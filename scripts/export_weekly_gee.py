#!/usr/bin/env python3
"""Export weekly observations on the existing canonical 5 km grid.

The released models remain monthly.  Accordingly the raw CSV contains both
true weekly aggregates (for provenance/audit) and three explicitly provisional
month-to-date model refresh fields.  Weekly Sentinel/NDVI/soil observations are
never written over the model's aligned long-term aggregate columns.

The observation-month policy for a cross-month week is the month containing
the interval's last included day (``week_end - 1 day``).  Month-compatible
refresh collections are restricted to that calendar month.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from myanmar_agri_geo.gee_backend import (  # noqa: E402
    GEEConfig,
    create_5km_grid,
    get_myanmar_admin1_region,
    initialize_earth_engine,
    sample_feature_image_to_grid,
)
from myanmar_agri_geo.weekly.feature_builder import (  # noqa: E402
    configured_serving_paths,
    load_canonical_grid,
)
from myanmar_agri_geo.weekly.validator import VALID_REGIONS  # noqa: E402
from myanmar_agri_geo.weekly.window import (  # noqa: E402
    YANGON_TIMEZONE_NAME,
    build_coverage_metadata,
    observation_month_for_week,
    parse_week_start,
)

GEE_PROJECT = os.environ.get("GEE_PROJECT", "gen-lang-client-0956667941")
DATA_DIR = Path(os.environ.get("WEEKLY_DATA_DIR", PROJECT_ROOT / "data" / "weekly"))

CHIRPS_COLLECTION = "UCSB-CHC/CHIRPS/V3/DAILY_RNL"
ERA5_COLLECTION = "ECMWF/ERA5_LAND/DAILY_AGGR"
SENTINEL2_COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"
SENTINEL1_COLLECTION = "COPERNICUS/S1_GRD"

SENTINEL2_LOOKBACK_DAYS = int(os.environ.get("SENTINEL2_LOOKBACK_DAYS", "15"))
SENTINEL1_LOOKBACK_DAYS = int(os.environ.get("SENTINEL1_LOOKBACK_DAYS", "18"))

REGION_ADMIN1_NAMES = {
    "yangon": "Yangon",
    "bago": "Bago",
    "mandalay": "Mandalay",
    "sagaing": "Sagaing",
    "magway": "Magway",
    "ayeyawaddy": "Ayeyawaddy",
}

GRID_CONFIG = GEEConfig(
    grid_crs="EPSG:6933",
    grid_size_m=5_000,
    sample_scale_m=5_000,
    sampling_geometry="centroid",
)


def _effective_end(window_end: date, *, now: datetime | None = None) -> date:
    local_now = (now or datetime.now(ZoneInfo(YANGON_TIMEZONE_NAME))).astimezone(
        ZoneInfo(YANGON_TIMEZONE_NAME)
    )
    return min(window_end, local_now.date() + timedelta(days=1))


def _collection_dates(collection: Any) -> list[str]:
    """Return distinct real UTC source dates; no cadence padding is applied."""

    milliseconds = collection.aggregate_array("system:time_start").getInfo()
    dates: set[str] = set()
    for value in milliseconds or []:
        if value is None:
            continue
        parsed = datetime.fromtimestamp(float(value) / 1000, tz=UTC).date()
        dates.add(parsed.isoformat())
    return sorted(dates)


def _mask_sentinel2(image: Any) -> Any:
    scl = image.select("SCL")
    clear = (
        scl.neq(0)
        .And(scl.neq(1))
        .And(scl.neq(3))
        .And(scl.neq(8))
        .And(scl.neq(9))
        .And(scl.neq(10))
        .And(scl.neq(11))
    )
    return image.updateMask(clear)


def _build_observation_image(
    ee: Any,
    geometry: Any,
    week_start: date,
    effective_end: date,
) -> tuple[Any, dict[str, list[str]], dict[str, list[str]], str]:
    """Build true weekly aggregates plus monthly-compatible refresh fields."""

    if effective_end <= week_start:
        raise RuntimeError("the requested week has no elapsed Asia/Yangon observation days")
    observation_month = observation_month_for_week(week_start)
    month_start = date.fromisoformat(f"{observation_month}-01")
    if month_start.month == 12:
        next_month = date(month_start.year + 1, 1, 1)
    else:
        next_month = date(month_start.year, month_start.month + 1, 1)
    month_refresh_end = min(effective_end, next_month)
    if month_refresh_end <= month_start:
        raise RuntimeError(
            "the partial week has not reached its documented observation month"
        )

    weekly_chirps = (
        ee.ImageCollection(CHIRPS_COLLECTION)
        .filterDate(week_start.isoformat(), effective_end.isoformat())
        .filterBounds(geometry.bounds())
    )
    weekly_era5 = (
        ee.ImageCollection(ERA5_COLLECTION)
        .filterDate(week_start.isoformat(), effective_end.isoformat())
        .filterBounds(geometry.bounds())
    )
    monthly_chirps = (
        ee.ImageCollection(CHIRPS_COLLECTION)
        .filterDate(month_start.isoformat(), month_refresh_end.isoformat())
        .filterBounds(geometry.bounds())
    )
    monthly_era5 = (
        ee.ImageCollection(ERA5_COLLECTION)
        .filterDate(month_start.isoformat(), month_refresh_end.isoformat())
        .filterBounds(geometry.bounds())
    )

    chirps_dates = _collection_dates(weekly_chirps)
    era5_dates = _collection_dates(weekly_era5)
    if not chirps_dates:
        print("WARNING: CHIRPS has zero real observations in the requested week. Proceeding anyway.")
        # raise RuntimeError("CHIRPS has zero real observations in the requested week")
    if not era5_dates:
        raise RuntimeError("ERA5-Land has zero real observations in the requested week")
    monthly_chirps_dates = _collection_dates(monthly_chirps)
    monthly_era5_dates = _collection_dates(monthly_era5)
    if not monthly_chirps_dates or not monthly_era5_dates:
        print("WARNING: month-to-date model refresh sources are unavailable. Proceeding anyway.")
        # raise RuntimeError("month-to-date model refresh sources are unavailable")

    # Exact monthly-model refresh fields: provisional MTD total/means.
    chirps_mtd = monthly_chirps.select("precipitation").sum().rename(
        "chirps_precipitation_mm"
    )
    temperature_mtd = (
        monthly_era5.select("temperature_2m")
        .mean()
        .subtract(273.15)
        .rename("mean_temperature_c")
    )

    def radiation_mj(image: Any) -> Any:
        return image.select("surface_solar_radiation_downwards_sum").divide(1_000_000)

    solar_mtd = monthly_era5.map(radiation_mj).mean().rename(
        "solar_radiation_mj_m2_day"
    )

    # True weekly aggregates are kept as extra raw provenance fields only.
    rainfall_week = weekly_chirps.select("precipitation").sum().rename(
        "weekly_rainfall_mm_sum"
    )
    rainfall_observation_count = weekly_chirps.select("precipitation").count().rename(
        "weekly_rainfall_observation_count"
    )
    weekly_temperature = weekly_era5.select("temperature_2m")
    temperature_week_mean = weekly_temperature.mean().subtract(273.15).rename(
        "weekly_temperature_c_mean"
    )
    temperature_week_min = (
        weekly_era5.select("temperature_2m_min")
        .min()
        .subtract(273.15)
        .rename("weekly_temperature_c_min")
    )
    temperature_week_max = (
        weekly_era5.select("temperature_2m_max")
        .max()
        .subtract(273.15)
        .rename("weekly_temperature_c_max")
    )

    def wind_speed(image: Any) -> Any:
        return image.expression(
            "sqrt(u * u + v * v)",
            {
                "u": image.select("u_component_of_wind_10m"),
                "v": image.select("v_component_of_wind_10m"),
            },
        ).rename("wind_speed_m_s")

    weekly_wind = weekly_era5.map(wind_speed)
    wind_week_mean = weekly_wind.mean().rename("weekly_wind_speed_m_s_mean")
    wind_week_max = weekly_wind.max().rename("weekly_wind_speed_m_s_max")
    soil_week = weekly_era5.select("volumetric_soil_water_layer_1")
    soil_week_mean = soil_week.mean().rename("weekly_soil_moisture_m3_m3_mean")
    soil_week_latest = ee.Image(
        soil_week.sort("system:time_start", False).first()
    ).rename("weekly_soil_moisture_m3_m3_latest")
    solar_week_mean = weekly_era5.map(radiation_mj).mean().rename(
        "weekly_solar_radiation_mj_m2_day_mean"
    )

    images = [
        chirps_mtd,
        temperature_mtd,
        solar_mtd,
        rainfall_week,
        rainfall_observation_count,
        temperature_week_mean,
        temperature_week_min,
        temperature_week_max,
        wind_week_mean,
        wind_week_max,
        soil_week_mean,
        soil_week_latest,
        solar_week_mean,
    ]

    sentinel2_start = week_start - timedelta(days=SENTINEL2_LOOKBACK_DAYS)
    sentinel2 = (
        ee.ImageCollection(SENTINEL2_COLLECTION)
        .filterDate(sentinel2_start.isoformat(), effective_end.isoformat())
        .filterBounds(geometry.bounds())
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 70))
    )
    sentinel2_week = sentinel2.filterDate(week_start.isoformat(), effective_end.isoformat())
    sentinel2_dates = _collection_dates(sentinel2_week)
    sentinel2_used_dates = _collection_dates(sentinel2)
    if sentinel2_used_dates:
        clear_sentinel2 = sentinel2.map(_mask_sentinel2)
        s2 = clear_sentinel2.median()
        images.extend(
            [
                s2.normalizedDifference(["B8", "B4"]).rename("weekly_ndvi_median"),
                s2.normalizedDifference(["B3", "B8"]).rename("weekly_ndwi_median"),
                clear_sentinel2.select("B8").count().rename(
                    "weekly_s2_valid_observation_count"
                ),
            ]
        )

    sentinel1_start = week_start - timedelta(days=SENTINEL1_LOOKBACK_DAYS)
    sentinel1 = (
        ee.ImageCollection(SENTINEL1_COLLECTION)
        .filterDate(sentinel1_start.isoformat(), effective_end.isoformat())
        .filterBounds(geometry.bounds())
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .select(["VV", "VH"])
    )
    sentinel1_week = sentinel1.filterDate(week_start.isoformat(), effective_end.isoformat())
    sentinel1_dates = _collection_dates(sentinel1_week)
    sentinel1_used_dates = _collection_dates(sentinel1)
    if sentinel1_used_dates:
        s1 = sentinel1.median()
        images.extend(
            [
                s1.select("VV").rename("weekly_s1_vv_db_median"),
                s1.select("VH").rename("weekly_s1_vh_db_median"),
                sentinel1.select("VV").count().rename("weekly_s1_observation_count"),
            ]
        )

    combined = ee.Image(images[0])
    for image in images[1:]:
        combined = combined.addBands(image)
    source_dates = {
        "chirps": chirps_dates,
        "era5": era5_dates,
        "sentinel_1": sentinel1_dates,
        "sentinel_2": sentinel2_dates,
    }
    source_dates_used = {
        "chirps_month_refresh": monthly_chirps_dates,
        "era5_month_refresh": monthly_era5_dates,
        "sentinel_1_lookback": sentinel1_used_dates,
        "sentinel_2_lookback": sentinel2_used_dates,
    }
    return combined, source_dates, source_dates_used, observation_month


def export_region(
    ee: Any,
    region: str,
    week_start: str,
    output_dir: Path,
    spatial_index_path: Path,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    window = parse_week_start(week_start)
    effective_end = _effective_end(window.end, now=now)
    canonical = load_canonical_grid(spatial_index_path, region)
    canonical_ids = canonical["grid_id"].astype(str).tolist()
    canonical_by_id = canonical.set_index("grid_id")

    myanmar_bbox = ee.Geometry.Rectangle([90.0, 9.0, 105.0, 29.0])
    generated_grid = create_5km_grid(region=myanmar_bbox, config=GRID_CONFIG, ee_module=ee)
    grid = generated_grid.filter(ee.Filter.inList("grid_id", canonical_ids))
    
    min_lon = canonical["longitude"].min()
    max_lon = canonical["longitude"].max()
    min_lat = canonical["latitude"].min()
    max_lat = canonical["latitude"].max()
    geometry = ee.Geometry.Rectangle([float(min_lon), float(min_lat), float(max_lon), float(max_lat)])
    


    image, source_dates, source_dates_used, observation_month = _build_observation_image(
        ee, geometry, window.start, effective_end
    )
    coverage = build_coverage_metadata(window.start, source_dates)
    chunk_grid = sample_feature_image_to_grid(
        image, grid, config=GRID_CONFIG, ee_module=ee
    )

    coverage_json = json.dumps(
        coverage["source_coverage"], sort_keys=True, separators=(",", ":")
    )
    dates_json = json.dumps(
        coverage["source_observation_dates"], sort_keys=True, separators=(",", ":")
    )
    used_dates_json = json.dumps(
        source_dates_used, sort_keys=True, separators=(",", ":")
    )

    def add_properties(feature):
        return feature.set({
            "region": region,
            "week_start": window.start.isoformat(),
            "week_end": window.end.isoformat(),
            "observation_month": observation_month,
            "observation_days": coverage["observation_days"],
            "expected_days": coverage["expected_days"],
            "coverage_ratio": coverage["coverage_ratio"],
            "is_partial_week": coverage["is_partial_week"],
            "source_coverage_json": coverage_json,
            "source_observation_dates_json": dates_json,
            "source_dates_used_json": used_dates_json,
        })
        
    export_collection = chunk_grid.map(add_properties)
    
    # Remove unnecessary .geo property before export
    export_collection = export_collection.map(lambda f: ee.Feature(None, f.toDictionary()))

    task_name = f"weekly_extract_{region}_{window.start.isoformat()}"
    filename = f"{region}"
    task = ee.batch.Export.table.toDrive(
        collection=export_collection,
        description=task_name,
        folder="myanmar_weekly_extracts",
        fileNamePrefix=filename,
        fileFormat="CSV",
    )
    task.start()
    print(f"[{datetime.now().isoformat()}] Queued Drive export task for {region}: {task.id}")

    return {
        "region": region,
        "task_id": task.id,
        "observation_month": observation_month,
        "coverage_metadata": coverage,
    }


def main_programmatic(
    week_start: str,
    regions: list[str],
    dry_run: bool = False,
    data_dir: Path | None = None,
) -> dict[str, Any]:
    window = parse_week_start(week_start)
    _, spatial_index_path = configured_serving_paths()
    output_root = Path(data_dir or DATA_DIR)
    raw_dir = output_root / window.identifier / "raw"

    if dry_run:
        plans = []
        for region in regions:
            grid = load_canonical_grid(spatial_index_path, region)
            plans.append({"region": region, "canonical_grid_cells": len(grid), "dry_run": True})
        return {
            "week_start": window.start.isoformat(),
            "week_end": window.end.isoformat(),
            "regions": plans,
            "dry_run": True,
        }

    ee = initialize_earth_engine(project=GEE_PROJECT)
    started = time.monotonic()
    results = [
        export_region(ee, region, week_start, raw_dir, spatial_index_path)
        for region in regions
    ]
    summary = {
        "week_start": window.start.isoformat(),
        "week_end": window.end.isoformat(),
        "timezone": YANGON_TIMEZONE_NAME,
        "exported_at": datetime.now(UTC).isoformat(),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "gee_project": GEE_PROJECT,
        "regions": results,
    }
    summary_path = output_root / window.identifier / "run_summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def _parse_regions(value: str) -> list[str]:
    if value == "all":
        return sorted(VALID_REGIONS)
    regions = [item.strip().lower() for item in value.split(",") if item.strip()]
    invalid = sorted(set(regions) - VALID_REGIONS)
    if invalid:
        raise ValueError(f"unknown regions: {invalid}")
    if not regions:
        raise ValueError("at least one region is required")
    return regions


def main() -> None:
    parser = argparse.ArgumentParser(description="Export weekly GEE observations")
    parser.add_argument("--week-start", required=True, help="Monday in YYYY-MM-DD format")
    parser.add_argument("--regions", default="all")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        regions = _parse_regions(args.regions)
        summary = main_programmatic(args.week_start, regions, args.dry_run)
    except (RuntimeError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
