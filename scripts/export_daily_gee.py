#!/usr/bin/env python3
"""
export_daily_gee.py — Google Earth Engine daily data extraction for the 5 km grid.

Extracts current environmental and agricultural features for all six Myanmar regions
using the existing stable 5 km EPSG:6933 grid. Applies satellite lookback windows
when data is unavailable on the exact requested date.

Usage:
    python scripts/export_daily_gee.py --date 2026-08-03 --regions all
    python scripts/export_daily_gee.py --date 2026-08-03 --regions yangon,bago

Requirements:
    - Google Earth Engine Python API: `pip install earthengine-api`
    - Authenticated: `earthengine authenticate` OR service account credentials
    - GEE project: set GEE_PROJECT env var or edit GEE_PROJECT below

Output:
    data/daily/YYYY-MM-DD/raw/{region}.csv  (one file per region)
    data/daily/YYYY-MM-DD/run_summary.json

NOTE: This script requires GEE authentication. Without it, run_daily_predictions.py
can still run in --dry-run mode using the existing serving parquet as a substitute.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from myanmar_agri_geo.daily.validator import VALID_REGIONS

# ── Configuration ─────────────────────────────────────────────────────────────
GEE_PROJECT = os.environ.get("GEE_PROJECT", "gen-lang-client-0956667941")
DATA_DIR = PROJECT_ROOT / "data" / "daily"

# Satellite lookback windows (days)
SENTINEL2_LOOKBACK_DAYS = int(os.environ.get("SENTINEL2_LOOKBACK_DAYS", "15"))
SENTINEL1_LOOKBACK_DAYS = int(os.environ.get("SENTINEL1_LOOKBACK_DAYS", "18"))
MAX_SOURCE_AGE_DAYS = int(os.environ.get("MAX_SOURCE_AGE_DAYS", "30"))

# GEE dataset IDs (existing pipeline datasets — do not change)
CHIRPS_COLLECTION = "UCSB-CHC/CHIRPS/V3/DAILY_RNL"
ERA5_COLLECTION = "ECMWF/ERA5_LAND/DAILY_AGGR"
SENTINEL2_COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"
SENTINEL1_COLLECTION = "COPERNICUS/S1_GRD"
JRC_WATER = "JRC/GSW1_4/GlobalSurfaceWater"
SRTM = "USGS/SRTMGL1_003"

# Myanmar region boundaries in GEE (admin1 names)
REGION_ADMIN1_NAMES: dict[str, str] = {
    "yangon": "Yangon",
    "bago": "Bago",
    "mandalay": "Mandalay",
    "sagaing": "Sagaing",
    "magway": "Magway",
    "ayeyawaddy": "Ayeyarwady",
}

# Grid cell size (matches existing pipeline)
GRID_SIZE_M = 5000
GRID_CRS = "EPSG:6933"


def _require_ee() -> Any:
    """Import and authenticate Earth Engine. Raises on failure."""
    try:
        import ee
    except ImportError:
        print(
            "[ERROR] earthengine-api not installed.\n"
            "        Install with: pip install earthengine-api\n"
            "        Then authenticate: earthengine authenticate"
        )
        sys.exit(1)

    try:
        ee.Initialize(project=GEE_PROJECT)
        return ee
    except Exception as exc:
        print(
            f"[ERROR] Failed to initialize Earth Engine: {exc}\n"
            f"        Run: earthengine authenticate\n"
            f"        And set GEE_PROJECT env var (current: {GEE_PROJECT})"
        )
        sys.exit(1)


def _get_region_geometry(ee: Any, region: str) -> Any:
    """Return the GEE geometry for a Myanmar admin1 region."""
    admin1_name = REGION_ADMIN1_NAMES.get(region)
    if not admin1_name:
        raise ValueError(f"Unknown region: {region}")

    gaul = ee.FeatureCollection("FAO/GAUL/2015/level1")
    geometry = (
        gaul
        .filter(ee.Filter.eq("ADM0_NAME", "Myanmar"))
        .filter(ee.Filter.eq("ADM1_NAME", admin1_name))
        .geometry()
    )
    return geometry


def _make_5km_grid(ee: Any, geometry: Any) -> Any:
    """Create the stable 5 km equal-area grid for a region geometry."""
    projection = ee.Projection(GRID_CRS).atScale(GRID_SIZE_M)
    grid = geometry.coveringGrid(projection)
    return grid


def _get_chirps_precipitation(
    ee: Any, geometry: Any, target_date: date
) -> tuple[Any, str]:
    """Get CHIRPS month-to-date precipitation accumulated to target_date."""
    month_start = target_date.replace(day=1)
    start_str = month_start.strftime("%Y-%m-%d")
    end_str = (target_date + timedelta(days=1)).strftime("%Y-%m-%d")

    chirps = (
        ee.ImageCollection(CHIRPS_COLLECTION)
        .filterDate(start_str, end_str)
        .filterBounds(geometry)
        .select("precipitation")
        .sum()
        .rename("chirps_precipitation_mm")
    )
    return chirps, start_str


def _get_era5_temperature(
    ee: Any, geometry: Any, target_date: date
) -> tuple[Any, str]:
    """Get ERA5 monthly mean 2m temperature."""
    month_start = target_date.replace(day=1)
    start_str = month_start.strftime("%Y-%m-%d")
    end_str = (target_date + timedelta(days=1)).strftime("%Y-%m-%d")

    era5 = (
        ee.ImageCollection(ERA5_COLLECTION)
        .filterDate(start_str, end_str)
        .filterBounds(geometry)
        .select("temperature_2m")
        .mean()
        .subtract(273.15)  # K → °C
        .rename("mean_temperature_c")
    )
    return era5, start_str


def _get_era5_soil_moisture(
    ee: Any, geometry: Any, target_date: date
) -> tuple[Any, str]:
    """Get ERA5 monthly mean volumetric soil water layer 1."""
    month_start = target_date.replace(day=1)
    start_str = month_start.strftime("%Y-%m-%d")
    end_str = (target_date + timedelta(days=1)).strftime("%Y-%m-%d")

    era5 = (
        ee.ImageCollection(ERA5_COLLECTION)
        .filterDate(start_str, end_str)
        .filterBounds(geometry)
        .select("volumetric_soil_water_layer_1")
        .mean()
        .rename("era5_soil_moisture_m3_m3")
    )
    return era5, start_str


def _get_sentinel2_ndvi(
    ee: Any, geometry: Any, target_date: date
) -> tuple[Any, str, int]:
    """Get the latest valid Sentinel-2 NDVI/NDWI within the lookback window."""
    for lookback in range(0, SENTINEL2_LOOKBACK_DAYS + 1):
        check_date = target_date - timedelta(days=lookback)
        start_str = check_date.strftime("%Y-%m-%d")
        end_str = (check_date + timedelta(days=1)).strftime("%Y-%m-%d")

        col = (
            ee.ImageCollection(SENTINEL2_COLLECTION)
            .filterDate(start_str, end_str)
            .filterBounds(geometry)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 70))
        )
        count = col.size().getInfo()
        if count > 0:
            img = col.median()
            ndvi = img.normalizedDifference(["B8", "B4"]).rename("ndvi_median")
            ndwi = img.normalizedDifference(["B3", "B8"]).rename("ndwi_mcf_median")
            return ee.Image.cat([ndvi, ndwi]), start_str, lookback

    # No valid image found — return empty
    empty = ee.Image.constant([float("nan"), float("nan")]).rename(["ndvi_median", "ndwi_mcf_median"])
    return empty, "", MAX_SOURCE_AGE_DAYS + 1


def _get_sentinel1(
    ee: Any, geometry: Any, target_date: date
) -> tuple[Any, str, int]:
    """Get the latest valid Sentinel-1 VV/VH within the lookback window."""
    for lookback in range(0, SENTINEL1_LOOKBACK_DAYS + 1):
        check_date = target_date - timedelta(days=lookback)
        start_str = check_date.strftime("%Y-%m-%d")
        end_str = (check_date + timedelta(days=1)).strftime("%Y-%m-%d")

        col = (
            ee.ImageCollection(SENTINEL1_COLLECTION)
            .filterDate(start_str, end_str)
            .filterBounds(geometry)
            .filter(ee.Filter.eq("instrumentMode", "IW"))
            .select(["VV", "VH"])
        )
        count = col.size().getInfo()
        if count > 0:
            img = col.mean().rename(["s1_vv_db_median", "s1_vh_db_median"])
            return img, start_str, lookback

    empty = ee.Image.constant([float("nan"), float("nan")]).rename(["s1_vv_db_median", "s1_vh_db_median"])
    return empty, "", MAX_SOURCE_AGE_DAYS + 1


def export_region(
    ee: Any,
    region: str,
    target_date: date,
    output_dir: Path,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Extract GEE features for one region and write a raw CSV.

    Returns a provenance/summary dict.
    """
    print(f"\n[{region}] Extracting features for {target_date} ...")
    geometry = _get_region_geometry(ee, region)
    grid = _make_5km_grid(ee, geometry)

    date_str = target_date.strftime("%Y-%m-%d")
    obs_month = target_date.strftime("%Y-%m")

    provenance: dict[str, Any] = {
        "region": region,
        "observation_date": date_str,
        "observation_month": obs_month,
        "sources": {},
        "warnings": [],
    }

    # ── Collect feature images ────────────────────────────────────────────────
    chirps_img, chirps_src = _get_chirps_precipitation(ee, geometry, target_date)
    provenance["sources"]["chirps"] = chirps_src

    era5_temp_img, era5_src = _get_era5_temperature(ee, geometry, target_date)
    era5_sm_img, _ = _get_era5_soil_moisture(ee, geometry, target_date)
    provenance["sources"]["era5"] = era5_src

    s2_img, s2_src, s2_age = _get_sentinel2_ndvi(ee, geometry, target_date)
    provenance["sources"]["sentinel2"] = s2_src or "unavailable"
    provenance["sources"]["sentinel2_age_days"] = s2_age
    if s2_age > SENTINEL2_LOOKBACK_DAYS:
        provenance["warnings"].append(
            f"Sentinel-2 unavailable within {SENTINEL2_LOOKBACK_DAYS} days"
        )

    s1_img, s1_src, s1_age = _get_sentinel1(ee, geometry, target_date)
    provenance["sources"]["sentinel1"] = s1_src or "unavailable"
    provenance["sources"]["sentinel1_age_days"] = s1_age
    if s1_age > SENTINEL1_LOOKBACK_DAYS:
        provenance["warnings"].append(
            f"Sentinel-1 unavailable within {SENTINEL1_LOOKBACK_DAYS} days"
        )

    # Combine all feature images
    combined = (
        chirps_img
        .addBands(era5_temp_img)
        .addBands(era5_sm_img)
        .addBands(s2_img)
        .addBands(s1_img)
    )

    if dry_run:
        print(f"  [DRY-RUN] Would sample grid and write CSV")
        provenance["dry_run"] = True
        return provenance

    # Sample the combined image at each 5 km grid centroid
    print(f"  Sampling grid centroids (this may take a few minutes)...")
    try:
        samples = combined.reduceRegions(
            collection=grid,
            reducer=ee.Reducer.mean(),
            scale=GRID_SIZE_M,
            crs=GRID_CRS,
        )

        # Add identity and metadata columns
        def add_metadata(feature: Any) -> Any:
            centroid = feature.geometry().centroid(1)
            coords = centroid.coordinates()
            return feature.set({
                "grid_id": feature.get("system:index"),
                "latitude": coords.get(1),
                "longitude": coords.get(0),
                "region": region,
                "observation_date": date_str,
                "observation_month": obs_month,
                "source_date": date_str,
                "source_age_days": max(s2_age, s1_age),
            })

        samples = samples.map(add_metadata)

        # Download as CSV
        features = samples.getInfo()["features"]
        rows = []
        for feat in features:
            props = feat["properties"]
            # Add geometry centroid
            geom = feat.get("geometry", {})
            if geom and geom.get("type") == "Polygon":
                coords = geom["coordinates"][0]
                lons = [c[0] for c in coords]
                lats = [c[1] for c in coords]
                props.setdefault("latitude", sum(lats) / len(lats))
                props.setdefault("longitude", sum(lons) / len(lons))
            rows.append(props)

        if not rows:
            print(f"  [WARN] No grid cells extracted for {region}")
            provenance["warnings"].append("No grid cells extracted")
            return provenance

        import csv
        output_dir.mkdir(parents=True, exist_ok=True)
        csv_path = output_dir / f"{region}.csv"
        fieldnames = sorted(set(k for row in rows for k in row.keys()))

        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)

        print(f"  ✓ {len(rows)} cells → {csv_path}")
        provenance["row_count"] = len(rows)
        provenance["output_path"] = str(csv_path)

    except Exception as exc:
        print(f"  [ERROR] GEE extraction failed: {exc}")
        provenance["error"] = str(exc)

    return provenance


def main() -> None:
    parser = argparse.ArgumentParser(description="Export daily GEE features for the 5 km grid")
    parser.add_argument("--date", required=True, help="Date in YYYY-MM-DD format")
    parser.add_argument("--regions", default="all", help="Comma-separated regions or 'all'")
    parser.add_argument("--dry-run", action="store_true", help="Skip actual GEE sampling")
    args = parser.parse_args()

    try:
        target_date = datetime.strptime(args.date, "%Y-%m-%d").date()
    except ValueError:
        print(f"[ERROR] Invalid date: {args.date}")
        sys.exit(1)

    if args.regions == "all":
        regions = sorted(VALID_REGIONS)
    else:
        regions = [r.strip().lower() for r in args.regions.split(",")]
        invalid = set(regions) - VALID_REGIONS
        if invalid:
            print(f"[ERROR] Unknown regions: {invalid}")
            sys.exit(1)

    date_str = target_date.strftime("%Y-%m-%d")
    raw_dir = DATA_DIR / date_str / "raw"

    print(f"=== GEE Export: {date_str} ({', '.join(regions)}) ===")
    ee = _require_ee()

    t0 = time.time()
    all_provenance: list[dict[str, Any]] = []

    for region in regions:
        prov = export_region(ee, region, target_date, raw_dir, dry_run=args.dry_run)
        all_provenance.append(prov)

    # Write run summary
    summary = {
        "date": date_str,
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "elapsed_seconds": round(time.time() - t0, 1),
        "regions": all_provenance,
        "gee_project": GEE_PROJECT,
        "sentinel2_lookback_days": SENTINEL2_LOOKBACK_DAYS,
        "sentinel1_lookback_days": SENTINEL1_LOOKBACK_DAYS,
    }
    summary_path = DATA_DIR / date_str / "run_summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\n[DONE] Summary → {summary_path}")


if __name__ == "__main__":
    main()
