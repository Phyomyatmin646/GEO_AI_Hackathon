"""Official CHIRPS v3 monthly GeoTIFF cache and sampling helpers.

Google Earth Engine's broadly available ``UCSB-CHG/CHIRPS/DAILY`` collection
is CHIRPS v2. This module makes the final rainfall contract explicit: cache
the official CHIRPS v3 monthly GeoTIFFs locally, then sample them at the same
grid centroids used by the GEE export. No v2 value is silently substituted
when a v3 cache is required.
"""

from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd


CHIRPS_V3_MONTHLY_BASE_URL = "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/tifs"


def validate_year_month(value: str) -> str:
    """Validate and return a canonical ``YYYY-MM`` month string."""

    try:
        parsed = datetime.strptime(str(value), "%Y-%m")
    except ValueError as exc:
        raise ValueError(f"Invalid month {value!r}; expected YYYY-MM") from exc
    return parsed.strftime("%Y-%m")


def chirps_v3_filename(year_month: str) -> str:
    """Return the official CHIRPS v3 monthly GeoTIFF filename."""

    canonical = validate_year_month(year_month)
    return f"chirps-v3.0.{canonical.replace('-', '.')}.tif"


def chirps_v3_url(year_month: str, base_url: str = CHIRPS_V3_MONTHLY_BASE_URL) -> str:
    """Return the authoritative monthly GeoTIFF URL for one month."""

    return f"{base_url.rstrip('/')}/{chirps_v3_filename(year_month)}"


def expected_cache_paths(cache_dir: str | Path, months: Iterable[str]) -> list[Path]:
    """Return cache paths in input order without touching the network."""

    directory = Path(cache_dir)
    return [directory / chirps_v3_filename(month) for month in months]


def write_download_manifest(
    months: Iterable[str],
    *,
    cache_dir: str | Path,
    base_url: str = CHIRPS_V3_MONTHLY_BASE_URL,
) -> Path:
    """Write an auditable download/cache plan, not a bulk raster download."""

    directory = Path(cache_dir)
    directory.mkdir(parents=True, exist_ok=True)
    records = []
    for month in months:
        canonical = validate_year_month(month)
        filename = chirps_v3_filename(canonical)
        records.append(
            {
                "year_month": canonical,
                "url": chirps_v3_url(canonical, base_url),
                "cache_path": str(directory / filename),
                "exists": (directory / filename).is_file(),
                "source": "CHIRPS v3 monthly final GeoTIFF",
            }
        )
    path = directory / "chirps_v3_download_manifest.json"
    path.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    return path


def download_monthly_cache(
    months: Iterable[str],
    *,
    cache_dir: str | Path,
    base_url: str = CHIRPS_V3_MONTHLY_BASE_URL,
    timeout_seconds: int = 120,
    overwrite: bool = False,
) -> list[Path]:
    """Download missing CHIRPS v3 monthly files into a local cache.

    This operation is deliberately invoked only by the explicit CLI
    ``prepare-chirps --download`` command. Files stream to ``.part`` paths and
    are atomically renamed after the HTTP response completes successfully.
    """

    try:
        import requests
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("CHIRPS v3 downloading requires requests; install `.[full]`.") from exc
    directory = Path(cache_dir)
    directory.mkdir(parents=True, exist_ok=True)
    results: list[Path] = []
    for month in months:
        canonical = validate_year_month(month)
        destination = directory / chirps_v3_filename(canonical)
        if destination.is_file() and not overwrite:
            results.append(destination)
            continue
        temporary = destination.with_suffix(destination.suffix + ".part")
        with requests.get(chirps_v3_url(canonical, base_url), stream=True, timeout=timeout_seconds) as response:
            response.raise_for_status()
            with temporary.open("wb") as handle:
                for chunk in response.iter_content(chunk_size=1_048_576):
                    if chunk:
                        handle.write(chunk)
        temporary.replace(destination)
        results.append(destination)
    write_download_manifest(months, cache_dir=directory, base_url=base_url)
    return results


def missing_cache_months(cache_dir: str | Path, months: Iterable[str]) -> list[str]:
    """List months whose expected GeoTIFF is absent from a local cache."""

    directory = Path(cache_dir)
    return [month for month in months if not (directory / chirps_v3_filename(month)).is_file()]


def _sample_geotiff(path: Path, longitudes: np.ndarray, latitudes: np.ndarray) -> np.ndarray:
    """Sample one raster at EPSG:4326 points, preserving NoData as NaN."""

    try:
        import rasterio
        from rasterio.warp import transform
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("CHIRPS v3 sampling requires rasterio; install `.[full]`.") from exc
    with rasterio.open(path) as dataset:
        xs, ys = transform("EPSG:4326", dataset.crs, longitudes.tolist(), latitudes.tolist())
        samples = [sample[0] for sample in dataset.sample(zip(xs, ys), masked=True)]
        values = np.asarray(np.ma.array(samples, dtype=float).filled(np.nan), dtype=float)
        if dataset.nodata is not None:
            values[np.isclose(values, float(dataset.nodata))] = np.nan
        # CHIRPS uses -9999 as a missing-data sentinel in affected cells.
        values[values <= -9990] = np.nan
        return values


def attach_chirps_v3_from_cache(
    frame: pd.DataFrame,
    *,
    cache_dir: str | Path,
    base_url: str = CHIRPS_V3_MONTHLY_BASE_URL,
    require_complete_cache: bool = True,
) -> pd.DataFrame:
    """Replace staging rainfall with sampled CHIRPS v3 monthly values.

    If ``require_complete_cache`` is true, a missing *file* aborts assembly so
    a final dataset cannot accidentally claim CHIRPS v3 while using v2. With a
    deliberately configured false value, a present GEE staging value can be
    retained and is explicitly tagged ``gee_chirps_staging_fallback``.
    """

    required = {"year_month", "longitude", "latitude"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"CHIRPS v3 sampling requires {sorted(missing)}")
    output = frame.copy()
    output["year_month"] = output["year_month"].map(validate_year_month)
    directory = Path(cache_dir)
    months = sorted(output["year_month"].dropna().unique())
    unavailable = missing_cache_months(directory, months)
    if unavailable and require_complete_cache:
        preview = ", ".join(unavailable[:8])
        suffix = "..." if len(unavailable) > 8 else ""
        raise FileNotFoundError(
            "CHIRPS v3 cache is incomplete. Run `myanmar-agri-geo prepare-chirps "
            f"--download`; missing {len(unavailable)} month(s): {preview}{suffix}"
        )

    staging = pd.to_numeric(output.get("chirps_precipitation_mm"), errors="coerce")
    if staging is None:
        staging = pd.Series(np.nan, index=output.index)
    output["chirps_gee_staging_precipitation_mm"] = staging
    final_values = pd.Series(np.nan, index=output.index, dtype=float)
    statuses = pd.Series("missing_chirps_v3_cache", index=output.index, dtype="object")
    longitudes = pd.to_numeric(output["longitude"], errors="coerce")
    latitudes = pd.to_numeric(output["latitude"], errors="coerce")
    for month, positions in output.groupby("year_month", sort=False).groups.items():
        path = directory / chirps_v3_filename(month)
        index = list(positions)
        if not path.is_file():
            continue
        values = _sample_geotiff(
            path,
            longitudes.loc[index].to_numpy(),
            latitudes.loc[index].to_numpy(),
        )
        final_values.loc[index] = values
        statuses.loc[index] = np.where(np.isfinite(values), "chirps_v3_cache", "chirps_v3_nodata")
    if not require_complete_cache:
        fallback = final_values.isna() & staging.notna()
        final_values.loc[fallback] = staging.loc[fallback]
        statuses.loc[fallback] = "gee_chirps_staging_fallback"
    output["chirps_precipitation_mm"] = final_values
    output["monthly_rainfall_mm"] = final_values
    # Recompute any trailing total from the final v3 monthly values in the
    # assembly step; a staging-data annual total must never survive a v3 swap.
    output["annual_rainfall_mm"] = np.nan
    output["rainfall_data_status"] = statuses
    output["chirps_v3_monthly_base_url"] = base_url.rstrip("/")
    return output


__all__ = [
    "CHIRPS_V3_MONTHLY_BASE_URL",
    "attach_chirps_v3_from_cache",
    "chirps_v3_filename",
    "chirps_v3_url",
    "download_monthly_cache",
    "expected_cache_paths",
    "missing_cache_months",
    "validate_year_month",
    "write_download_manifest",
]
