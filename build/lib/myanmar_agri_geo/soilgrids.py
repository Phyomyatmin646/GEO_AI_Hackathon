"""SoilGrids local/WebDAV fallback utilities.

The normal path samples the official SoilGrids community assets in Google
Earth Engine.  This module is deliberately separate because SoilGrids' REST
service is not a production dependency; it can instead read user-downloaded
GeoTIFFs or WebDAV VRTs when GEE soil fields are unavailable.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


SOILGRIDS_PROPERTY_SPECS: dict[str, dict[str, Any]] = {
    "phh2o": {"output": "soil_ph_h2o_0_30cm", "factor": 10.0},
    "sand": {"output": "soil_sand_pct_0_30cm", "factor": 10.0},
    "silt": {"output": "soil_silt_pct_0_30cm", "factor": 10.0},
    "clay": {"output": "soil_clay_pct_0_30cm", "factor": 10.0},
    "soc": {"output": "soil_soc_g_kg_0_30cm", "factor": 10.0},
    "cec": {"output": "soil_cec_cmol_kg_0_30cm", "factor": 10.0},
}
DEPTH_WEIGHTS = {"0-5": 5 / 30, "5-15": 10 / 30, "15-30": 15 / 30}


def vrt_url(base_url: str, property_name: str, depth: str, statistic: str = "mean") -> str:
    """Return ISRIC's documented master-VRT URL for a SoilGrids layer."""

    base = base_url.rstrip("/")
    return f"{base}/{property_name}/{property_name}_{depth}cm_{statistic}.vrt"


def write_vrt_source_manifest(soil_config: dict[str, Any], cache_dir: str | Path) -> Path:
    """Write a small, reproducible list of WebDAV VRT resources.

    It does not download multi-gigabyte global rasters.  GDAL/rasterio can read
    these VRTs lazily, or users can download/clip them into this cache first.
    """

    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    base = soil_config["webdav_base_url"] if "webdav_base_url" in soil_config else None
    if base is None:
        raise ValueError("soil_config.webdav_base_url is required")
    properties = soil_config.get("properties", list(SOILGRIDS_PROPERTY_SPECS))
    depths = soil_config.get("depth_intervals_cm", list(DEPTH_WEIGHTS))
    records = []
    for property_name in properties:
        for depth in depths:
            records.append(
                {
                    "property": property_name,
                    "depth_cm": depth,
                    "statistic": "mean",
                    "url": vrt_url(base, property_name, depth),
                }
            )
    for property_name in soil_config.get("uncertainty_properties", []):
        for depth in depths:
            records.append(
                {
                    "property": property_name,
                    "depth_cm": depth,
                    "statistic": "uncertainty",
                    "url": vrt_url(base, property_name, depth, "uncertainty"),
                }
            )
    manifest = cache / "soilgrids_vrt_sources.json"
    manifest.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    return manifest


def _candidate_paths(cache_dir: Path, property_name: str, depth: str, statistic: str) -> list[Path]:
    stem = f"{property_name}_{depth}cm_{statistic}"
    return [
        cache_dir / f"{stem}.tif",
        cache_dir / f"{stem}.tiff",
        cache_dir / f"{stem}.vrt",
        cache_dir / property_name / f"{stem}.tif",
        cache_dir / property_name / f"{stem}.tiff",
        cache_dir / property_name / f"{stem}.vrt",
    ]


def _read_cached_sources(cache_dir: Path) -> dict[tuple[str, str, str], str]:
    manifest = cache_dir / "soilgrids_vrt_sources.json"
    if not manifest.is_file():
        return {}
    try:
        records = json.loads(manifest.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return {
        (record["property"], record["depth_cm"], record["statistic"]): record["url"]
        for record in records
        if {"property", "depth_cm", "statistic", "url"}.issubset(record)
    }


def _sample_raster(source: str, longitudes: np.ndarray, latitudes: np.ndarray) -> np.ndarray:
    """Sample a local GeoTIFF/VRT or a GDAL-readable HTTP VRT at WGS84 points."""

    try:
        import rasterio
        from rasterio.warp import transform
    except ImportError as exc:  # pragma: no cover - depends on optional extra
        raise RuntimeError("Install the 'full' extra to sample SoilGrids rasters") from exc

    open_source = source
    if source.startswith("https://"):
        open_source = "/vsicurl/" + source
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
        with rasterio.open(open_source) as dataset:
            xs, ys = transform("EPSG:4326", dataset.crs, longitudes.tolist(), latitudes.tolist())
            samples = [sample[0] for sample in dataset.sample(zip(xs, ys), masked=True)]
            values = np.asarray(np.ma.array(samples, dtype=float).filled(np.nan), dtype=float)
            nodata = dataset.nodata
            if nodata is not None:
                values[np.isclose(values, nodata)] = np.nan
            return values


def _locate_layer(
    cache_dir: Path,
    sources: dict[tuple[str, str, str], str],
    property_name: str,
    depth: str,
    statistic: str,
    allow_remote_vrt: bool,
) -> str | None:
    for candidate in _candidate_paths(cache_dir, property_name, depth, statistic):
        if candidate.is_file():
            return str(candidate)
    if allow_remote_vrt:
        return sources.get((property_name, depth, statistic))
    return None


def attach_soilgrids_from_cache(
    frame: pd.DataFrame,
    soil_config: dict[str, Any],
    *,
    cache_dir: str | Path,
) -> pd.DataFrame:
    """Attach 0-30 cm SoilGrids features to a GEE export dataframe.

    Every property is calculated as a thickness-weighted average of 0-5, 5-15,
    and 15-30 cm. SoilGrids integer storage units are converted to physical
    units exactly once using the documented factor of 10. If a layer is absent,
    its output stays null and ``soil_data_status`` records the limitation.
    """

    required = {"longitude", "latitude"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Soil sampling requires {sorted(missing)}")
    output = frame.copy()
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    sources = _read_cached_sources(cache)
    allow_remote = bool(soil_config.get("allow_remote_vrt", False))
    longitudes = output["longitude"].astype(float).to_numpy()
    latitudes = output["latitude"].astype(float).to_numpy()
    missing_any = False

    for property_name in soil_config.get("properties", list(SOILGRIDS_PROPERTY_SPECS)):
        if property_name not in SOILGRIDS_PROPERTY_SPECS:
            continue
        weighted = np.zeros(len(output), dtype=float)
        weight_available = np.zeros(len(output), dtype=float)
        for depth, weight in DEPTH_WEIGHTS.items():
            source = _locate_layer(cache, sources, property_name, depth, "mean", allow_remote)
            if source is None:
                missing_any = True
                continue
            try:
                values = _sample_raster(source, longitudes, latitudes)
            except Exception:
                # Preserve provenance rather than silently substituting values.
                missing_any = True
                continue
            valid = np.isfinite(values)
            weighted[valid] += values[valid] * weight
            weight_available[valid] += weight
        result = np.full(len(output), np.nan)
        valid = weight_available > 0
        result[valid] = weighted[valid] / weight_available[valid]
        output[SOILGRIDS_PROPERTY_SPECS[property_name]["output"]] = result / SOILGRIDS_PROPERTY_SPECS[property_name]["factor"]

    # SoilGrids uncertainty is a relative value multiplied by 10. A weighted
    # mean provides a transparent 0-30 cm proxy, not a formal propagated CI.
    uncertainty = np.zeros(len(output), dtype=float)
    uncertainty_weight = np.zeros(len(output), dtype=float)
    for depth, weight in DEPTH_WEIGHTS.items():
        source = _locate_layer(cache, sources, "phh2o", depth, "uncertainty", allow_remote)
        if source is None:
            missing_any = True
            continue
        try:
            values = _sample_raster(source, longitudes, latitudes)
        except Exception:
            missing_any = True
            continue
        valid = np.isfinite(values)
        uncertainty[valid] += values[valid] * weight
        uncertainty_weight[valid] += weight
    output["soil_ph_h2o_uncertainty_pct"] = np.where(
        uncertainty_weight > 0, uncertainty / uncertainty_weight / 10.0 * 100.0, np.nan
    )
    existing_status = output.get("soil_data_status", pd.Series("not_sampled", index=output.index)).astype(str)
    output["soil_data_status"] = np.where(
        missing_any,
        np.where(existing_status.eq("gee_community_asset"), "gee_community_asset_mean_only", "partial_or_missing_local_fallback"),
        "soilgrids_webdav_or_local_cache",
    )
    return output
