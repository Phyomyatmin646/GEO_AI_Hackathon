"""Provenance manifests and reproducible file fingerprints."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

from .resources import collabhub_audit_summary


SOURCE_CATALOG: dict[str, dict[str, str]] = {
    "sentinel2": {
        "dataset_id": "COPERNICUS/S2_SR_HARMONIZED",
        "role": "10 m surface-reflectance composites and NDVI/NDWI/NDMI",
        "resolution": "10 m (indices); 20 m source SWIR band resampled by Earth Engine composition",
        "units": "unitless indices; scene/cloud counts and fractions",
        "temporal_coverage": "2017-present; early coverage must be measured per Myanmar month",
        "source_url": "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED",
        "license_note": "Copernicus Sentinel Data Terms and Conditions",
    },
    "sentinel1": {
        "dataset_id": "COPERNICUS/S1_GRD",
        "role": "SAR VV/VH fallback during optical-cloud gaps",
        "resolution": "10 m",
        "units": "dB backscatter and scene count",
        "temporal_coverage": "2014-present",
        "source_url": "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD",
        "license_note": "Copernicus Sentinel Data Terms and Conditions",
    },
    "chirps": {
        "dataset_id": "CHIRPS v3 monthly GeoTIFF cache",
        "role": "final monthly rainfall and trailing-12-month rainfall",
        "resolution": "0.05 degree",
        "units": "mm/month",
        "temporal_coverage": "1981-near present; final cache sampled only at Myanmar export centroids",
        "source_url": "https://www.chc.ucsb.edu/data/chirps3",
        "license_note": "CHIRPS v3 CC-BY 4.0/public-domain terms; retain citation and access date",
    },
    "chirps_gee_staging": {
        "dataset_id": "UCSB-CHG/CHIRPS/DAILY",
        "role": "GEE export staging only; never silently substitute it for required CHIRPS v3",
        "resolution": "0.05 degree",
        "units": "mm/day",
        "temporal_coverage": "1981-present (collection-specific)",
        "source_url": "https://developers.google.com/earth-engine/datasets/catalog/UCSB-CHG_CHIRPS_DAILY",
        "license_note": "CHIRPS public-domain terms; retain citation",
    },
    "era5_land": {
        "dataset_id": "ECMWF/ERA5_LAND/DAILY_AGGR",
        "role": "temperature, solar radiation, and physical soil-water features",
        "resolution": "approximately 11.1 km",
        "units": "degrees C, MJ m^-2 day^-1, m^3 m^-3",
        "temporal_coverage": "1950-near present",
        "source_url": "https://developers.google.com/earth-engine/datasets/catalog/ECMWF_ERA5_LAND_DAILY_AGGR",
        "license_note": "Acknowledge Copernicus Climate Change Service/ECMWF",
    },
    "soilgrids": {
        "dataset_id": "projects/soilgrids-isric/*_mean or ISRIC WebDAV VRT",
        "role": "0-30 cm thickness-weighted soil properties",
        "resolution": "250 m",
        "units": "pH, %, g kg^-1, cmol(c) kg^-1; documented conversions retained",
        "temporal_coverage": "static model release",
        "source_url": "https://docs.isric.org/globaldata/soilgrids/index.html",
        "license_note": "SoilGrids CC-BY 4.0; retain ISRIC citation",
    },
    "srtm": {
        "dataset_id": "USGS/SRTMGL1_003",
        "role": "elevation, slope, aspect",
        "resolution": "approximately 30 m",
        "units": "m and degrees",
        "temporal_coverage": "static terrain product",
        "source_url": "https://developers.google.com/earth-engine/datasets/catalog/USGS_SRTMGL1_003",
        "license_note": "Follow USGS SRTM data citation guidance",
    },
    "jrc_surface_water": {
        "dataset_id": "JRC/GSW1_4/GlobalSurfaceWater",
        "role": "surface-water occurrence; a static water-access proxy",
        "resolution": "30 m",
        "units": "historical occurrence percent and distance metres",
        "temporal_coverage": "historical product through 2021; do not treat as 2022-25 dynamic water truth",
        "source_url": "https://developers.google.com/earth-engine/datasets/catalog/JRC_GSW1_4_GlobalSurfaceWater",
        "license_note": "Acknowledge EC JRC/Google",
    },
    "fao_gaul": {
        "dataset_id": "FAO/GAUL/2015/level0",
        "role": "Myanmar national boundary and administration context",
        "resolution": "vector administrative boundary",
        "units": "administrative names/codes",
        "temporal_coverage": "2015 release",
        "source_url": "https://developers.google.com/earth-engine/datasets/catalog/FAO_GAUL_2015_level0",
        "license_note": "Follow FAO GAUL terms and citation guidance",
    },
}


def sha256_file(path: str | Path, chunk_size: int = 1_048_576) -> str:
    """Calculate a file digest without loading a full CSV into memory."""

    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(chunk_size), b""):
            digest.update(block)
    return digest.hexdigest()


def source_versions_json(config: dict[str, Any]) -> str:
    """Compact per-row source identifiers; detailed provenance goes in manifest."""

    selected = {
        name: config["sources"].get(name, entry["dataset_id"])
        for name, entry in SOURCE_CATALOG.items()
        if name in {"sentinel2", "sentinel1", "era5_land", "srtm", "jrc_surface_water"}
    }
    selected["chirps"] = (
        config["sources"].get("chirps_v3_monthly_base_url", "CHIRPS v3 monthly GeoTIFF cache")
        if config.get("chirps_v3", {}).get("enabled", True)
        else config["sources"].get("chirps", "UCSB-CHG/CHIRPS/DAILY")
    )
    selected["chirps_gee_staging"] = config["sources"].get("chirps", "UCSB-CHG/CHIRPS/DAILY")
    selected["soilgrids"] = "projects/soilgrids-isric/*_mean|WebDAV-fallback"
    return json.dumps(selected, sort_keys=True, separators=(",", ":"))


def build_manifest(
    *,
    config: dict[str, Any],
    raw_files: Iterable[str | Path],
    output_files: Iterable[str | Path],
    source_files: Iterable[str | Path] = (),
    frame: pd.DataFrame | None = None,
) -> dict[str, Any]:
    """Build a JSON-serialisable provenance manifest for one assembly run."""

    def file_record(path_like: str | Path) -> dict[str, Any]:
        path = Path(path_like)
        record: dict[str, Any] = {"path": str(path), "exists": path.is_file()}
        if path.is_file():
            record.update({"bytes": path.stat().st_size, "sha256": sha256_file(path)})
        return record

    manifest: dict[str, Any] = {
        "manifest_version": "1.0",
        "processing_timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "project": config["project"],
        "earth_engine": config["earth_engine"],
        "selected_sources": SOURCE_CATALOG,
        "contextual_resource_audit": collabhub_audit_summary(config),
        "raw_inputs": [file_record(path) for path in raw_files],
        "consumed_source_files": [file_record(path) for path in source_files],
        "outputs": [file_record(path) for path in output_files],
        "label_policy": {
            "strategy": "provisional agronomic rules blended only with provided observed labels",
            "observed_labels_are_features": False,
            "rule_score_is_ground_truth": False,
        },
    }
    if frame is not None and not frame.empty:
        manifest["dataset_summary"] = {
            "records": int(len(frame)),
            "cells": int(frame["grid_id"].nunique()) if "grid_id" in frame else None,
            "months": int(frame["year_month"].nunique()) if "year_month" in frame else None,
            "month_min": str(frame["year_month"].min()) if "year_month" in frame else None,
            "month_max": str(frame["year_month"].max()) if "year_month" in frame else None,
            "columns": list(frame.columns),
        }
    return manifest


def write_json(path: str | Path, payload: dict[str, Any]) -> Path:
    """Write a deterministically formatted JSON deliverable."""

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    return destination
