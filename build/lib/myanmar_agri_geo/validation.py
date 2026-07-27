"""Quality assurance helpers for the Myanmar crop-suitability export.

The extraction workflow deliberately exports physical units rather than model-ready
normalised features.  This module checks that contract before a CSV/Parquet file is
handed to a modelling workflow.  It is intentionally independent from Earth Engine
and can be imported in small environments: :mod:`pandas` is only required when a
table is actually validated.

Validation defaults to a release gate for the final public table.  Pass
``strict_schema=False`` only for an in-progress extract where incomplete source
feature coverage is expected and should be reported as warnings rather than errors.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from datetime import date, datetime, timezone
import json
from math import isfinite
from pathlib import Path
import re
from typing import Any, Literal

try:  # Keep package importable for users who only want configuration constants.
    import pandas as pd
except ImportError:  # pragma: no cover - exercised in minimal installations.
    pd = None  # type: ignore[assignment]


VALIDATION_VERSION = "1.0.0"

# These bounds deliberately include the small amount of sea/coastline covered by a
# 5 km grid.  A precise polygon membership check belongs in the extraction stage;
# the bounding-box check catches swapped coordinates and wrong-country exports.
MYANMAR_BOUNDS: dict[str, float] = {
    "min_lat": 9.00,
    "max_lat": 29.00,
    "min_lon": 92.00,
    "max_lon": 102.00,
}

DEFAULT_START_YEAR_MONTH = "2018-01"
DEFAULT_END_YEAR_MONTH = "2025-12"
DEFAULT_SUITABILITY_THRESHOLD = 70.0

CORE_REQUIRED_COLUMNS: tuple[str, ...] = (
    "grid_id",
    "year_month",
    "longitude",
    "latitude",
)

TARGET_CROPS: tuple[str, ...] = (
    "monsoon_rice",
    "dry_season_rice",
    "maize",
    "sugarcane",
    "cassava",
    "durian",
    "mangosteen",
    "longan",
    "mango",
    "chili",
    "tomato",
)

# Each entry accepts alternate names so the validator can be used while upstream
# source adapters evolve.  The first item is the canonical output name.
FEATURE_GROUPS: dict[str, tuple[str, ...]] = {
    "administrative_area": ("admin1_name", "admin_1", "admin_region", "adm1_name", "state_region"),
    "elevation": ("elevation_m", "dem_elevation_m"),
    "slope": ("slope_deg", "slope_degrees"),
    "soil_pH": ("soil_ph_h2o_0_30cm", "soil_ph_0_30cm", "soil_ph", "ph_h2o"),
    "soil_sand": ("soil_sand_pct_0_30cm",),
    "soil_silt": ("soil_silt_pct_0_30cm",),
    "soil_clay": ("soil_clay_pct_0_30cm",),
    "soil_organic_carbon": ("soil_soc_g_kg_0_30cm",),
    "soil_cec": ("soil_cec_cmol_kg_0_30cm",),
    "soil_pH_uncertainty": ("soil_ph_h2o_uncertainty_pct",),
    "rainfall": ("monthly_rainfall_mm", "chirps_precipitation_mm", "precipitation_mm", "rainfall_mm"),
    "air_temperature": ("mean_temperature_c", "era5_temperature_2m_c", "temperature_2m_c", "temperature_c"),
    "solar_radiation": (
        "solar_radiation_mj_m2_day",
        "era5_solar_radiation_mj_m2_day",
        "surface_solar_radiation_downwards_j_m2",
    ),
    "physical_soil_moisture": (
        "era5_soil_moisture_m3_m3",
        "era5_volumetric_soil_water_layer_1_m3_m3",
        "soil_moisture_m3_m3",
    ),
    "surface_water": ("surface_water_occurrence_pct", "jrc_surface_water_occurrence_pct"),
    "river_distance": ("distance_to_surface_water_m", "distance_to_river_m", "river_distance_m"),
    "ndvi": ("ndvi_median", "ndvi", "sentinel2_ndvi"),
    "ndwi": ("ndwi_mcf_median", "ndwi", "sentinel2_ndwi"),
    "ndmi": ("ndmi_median", "ndmi", "sentinel2_ndmi"),
    "sentinel2_source_scene_count": ("s2_scene_count", "sentinel2_scene_count"),
    "sentinel2_scene_count": ("s2_valid_observation_count", "sentinel2_scene_count", "s2_scene_count"),
    "sentinel2_cloud_fraction": ("s2_cloudy_pixel_fraction", "sentinel2_cloud_fraction", "s2_cloud_fraction"),
    "sentinel1_source_scene_count": ("s1_scene_count", "sentinel1_scene_count"),
    "source_versions": ("source_versions_json",),
    "feature_missingness": ("feature_missing_fraction",),
    "processing_date": ("processing_timestamp_utc", "processing_date", "processed_at"),
}

# ``aliases`` are exact, lower-case column names.  Keeping units in the column
# name lets this validation detect unit-conversion mistakes without guessing.
RANGE_RULES: dict[str, dict[str, Any]] = {
    "soil_pH": {
        "aliases": ("soil_ph_h2o_0_30cm", "soil_ph_0_30cm", "soil_ph", "ph_h2o"),
        "min": 0.0,
        "max": 14.0,
        "unit": "pH",
    },
    "monthly_rainfall_mm": {
        "aliases": ("chirps_precipitation_mm", "monthly_rainfall_mm", "precipitation_mm", "rainfall_mm"),
        "min": 0.0,
        "max": 5000.0,
        "unit": "mm/month",
    },
    "annual_rainfall_mm": {
        "aliases": ("annual_rainfall_mm", "rainfall_annual_mm", "precipitation_annual_mm"),
        "min": 0.0,
        "max": 15_000.0,
        "unit": "mm/year",
    },
    "era5_precipitation_m": {
        "aliases": ("era5_total_precipitation_m", "total_precipitation_m"),
        "min": 0.0,
        "max": 5.0,
        "unit": "m/month",
    },
    "solar_radiation_mj_m2_day": {
        "aliases": ("solar_radiation_mj_m2_day", "era5_solar_radiation_mj_m2_day"),
        "min": 0.0,
        "max": 50.0,
        "unit": "MJ/m²/day",
    },
    "solar_radiation_j_m2_day": {
        "aliases": ("surface_solar_radiation_downwards_j_m2", "solar_radiation_j_m2_day"),
        "min": 0.0,
        "max": 50_000_000.0,
        "unit": "J/m²/day",
    },
    "solar_radiation_w_m2": {
        "aliases": ("solar_radiation_w_m2", "surface_solar_radiation_w_m2"),
        "min": 0.0,
        "max": 700.0,
        "unit": "W/m²",
    },
    "physical_soil_moisture": {
        "aliases": (
            "era5_soil_moisture_m3_m3",
            "era5_volumetric_soil_water_layer_1_m3_m3",
            "soil_moisture_m3_m3",
        ),
        "min": 0.0,
        "max": 1.0,
        "unit": "m³/m³",
    },
    "surface_water_occurrence": {
        "aliases": ("surface_water_occurrence_pct", "jrc_surface_water_occurrence_pct"),
        "min": 0.0,
        "max": 100.0,
        "unit": "%",
    },
    "cloud_fraction": {
        "aliases": ("s2_cloudy_pixel_fraction", "sentinel2_cloud_fraction", "s2_cloud_fraction"),
        "min": 0.0,
        "max": 1.0,
        "unit": "fraction",
    },
    "s2_scene_count": {
        "aliases": ("s2_scene_count", "s2_valid_observation_count", "sentinel2_scene_count"),
        "min": 0.0,
        "max": 10_000.0,
        "unit": "scenes/month",
    },
    "s1_scene_count": {
        "aliases": ("s1_scene_count", "sentinel1_scene_count"),
        "min": 0.0,
        "max": 10_000.0,
        "unit": "scenes/month",
    },
    "feature_missing_fraction": {
        "aliases": ("feature_missing_fraction",),
        "min": 0.0,
        "max": 1.0,
        "unit": "fraction",
    },
    "water_availability_score": {
        "aliases": ("water_availability_score", "water_availability", "water_score"),
        "min": 0.0,
        "max": 100.0,
        "unit": "score",
    },
    "mean_temperature_c": {
        "aliases": ("mean_temperature_c", "era5_temperature_2m_c", "temperature_2m_c", "temperature_c"),
        "min": -90.0,
        "max": 70.0,
        "unit": "°C",
    },
    "ndvi": {
        "aliases": ("ndvi_median", "ndvi", "sentinel2_ndvi"),
        "min": -1.0,
        "max": 1.0,
        "unit": "index",
    },
    "ndwi": {
        "aliases": ("ndwi_mcf_median", "ndwi", "sentinel2_ndwi"),
        "min": -1.0,
        "max": 1.0,
        "unit": "index",
    },
    "ndmi": {
        "aliases": ("ndmi_median", "ndmi", "sentinel2_ndmi"),
        "min": -1.0,
        "max": 1.0,
        "unit": "index",
    },
}

MANIFEST_REQUIRED_COLUMNS: tuple[str, ...] = (
    "source_name",
    "dataset_id",
    "resolution",
    "units",
    "version",
)

_YEAR_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_TRUE_VALUES = frozenset({"1", "true", "t", "yes", "y"})
_FALSE_VALUES = frozenset({"0", "false", "f", "no", "n"})
_COORDINATE_ALIASES: dict[str, tuple[str, ...]] = {
    "latitude": ("latitude", "lat"),
    "longitude": ("longitude", "lon"),
}


class ValidationDependencyError(RuntimeError):
    """Raised when a table validation is requested without pandas installed."""


def validate_dataset(
    dataset: Any,
    *,
    required_columns: Iterable[str] | None = None,
    expected_crops: Iterable[str] = TARGET_CROPS,
    strict_schema: bool = True,
    suitability_threshold: float = DEFAULT_SUITABILITY_THRESHOLD,
    max_feature_missing_fraction: float | None = None,
    start_year_month: str = DEFAULT_START_YEAR_MONTH,
    end_year_month: str = DEFAULT_END_YEAR_MONTH,
    myanmar_bounds: Mapping[str, float] = MYANMAR_BOUNDS,
    range_rules: Mapping[str, Mapping[str, Any]] = RANGE_RULES,
    sample_limit: int = 5,
) -> dict[str, Any]:
    """Validate a crop-suitability table and return a JSON-serialisable QA report.

    Parameters
    ----------
    dataset:
        A pandas ``DataFrame``, a CSV/Parquet path, or a sequence of record mappings.
    strict_schema:
        Treat missing source-feature groups, crop metadata, and expected crops as
        failures.  This is the default for final CSV/Parquet release validation;
        set it to ``False`` for partial source extracts.
    suitability_threshold:
        ``is_suitable__<crop>`` must equal ``score >= threshold``.  Scores stay in
        their physical 0--100 export scale; this function never normalises them.

    The returned object only contains built-in Python values and can be passed
    directly to ``json.dumps``.  It does not mutate the supplied DataFrame.
    """

    source_frame = _coerce_table(dataset)
    # Continue gathering useful diagnostics after reporting duplicate headings.
    # Selecting the first occurrence is only a validation view; it never changes
    # the caller's frame and the duplicate-heading failure remains in the report.
    frame = _first_occurrence_columns(source_frame)
    checks: list[dict[str, Any]] = []
    sample_limit = max(0, int(sample_limit))
    crop_ids = tuple(dict.fromkeys(str(crop) for crop in expected_crops))
    threshold = float(suitability_threshold)
    if not isfinite(threshold) or not 0.0 <= threshold <= 100.0:
        raise ValueError("suitability_threshold must be a finite value from 0 through 100")
    if max_feature_missing_fraction is not None:
        max_feature_missing_fraction = float(max_feature_missing_fraction)
        if not isfinite(max_feature_missing_fraction) or not 0.0 <= max_feature_missing_fraction <= 1.0:
            raise ValueError("max_feature_missing_fraction must be a finite value from 0 through 1")
    if (
        not _YEAR_MONTH_RE.fullmatch(start_year_month)
        or not _YEAR_MONTH_RE.fullmatch(end_year_month)
        or start_year_month > end_year_month
    ):
        raise ValueError("start_year_month and end_year_month must use YYYY-MM with start <= end")
    required = _default_required_columns(
        crop_ids=crop_ids,
        strict_schema=strict_schema,
        supplied_required_columns=required_columns,
    )

    _add_check(
        checks,
        name="table_not_empty",
        status="pass" if len(frame) else "fail",
        message="Dataset contains at least one row." if len(frame) else "Dataset has no rows.",
        invalid_count=0 if len(frame) else 1,
    )

    _validate_schema(source_frame, checks, required, strict_schema)
    _validate_key_completeness_and_duplicates(frame, checks, sample_limit)
    _validate_year_month(frame, checks, start_year_month, end_year_month, sample_limit)
    _validate_coordinates(frame, checks, myanmar_bounds, sample_limit)
    _validate_admin0_myanmar(frame, checks, strict_schema, sample_limit)
    _validate_feature_coverage(frame, checks, strict_schema)
    _validate_feature_missingness(
        frame,
        checks,
        strict_schema=strict_schema,
        max_feature_missing_fraction=max_feature_missing_fraction,
        sample_limit=sample_limit,
    )
    _validate_ranges(frame, checks, range_rules, sample_limit)
    _validate_scene_count_consistency(frame, checks, sample_limit)
    _validate_processing_date(frame, checks, strict_schema, sample_limit)
    _validate_source_versions(frame, checks, strict_schema, sample_limit)
    _validate_suitability_labels(
        frame,
        checks,
        expected_crops=crop_ids,
        strict_schema=strict_schema,
        threshold=threshold,
        sample_limit=sample_limit,
    )

    missingness = _missingness_summary(frame)
    _add_check(
        checks,
        name="missingness_recorded",
        status="pass",
        message="Missingness is included in this report; null satellite values are not imputed by validation.",
        details={"overall_missing_pct": missingness["overall_missing_pct"]},
    )

    return _build_report(
        checks=checks,
        table_name=_dataset_name(dataset),
        row_count=len(frame),
        columns=list(map(str, source_frame.columns)),
        missingness=missingness,
        configuration={
            "strict_schema": strict_schema,
            "suitability_threshold": threshold,
            "max_feature_missing_fraction": max_feature_missing_fraction,
            "year_month_range": [start_year_month, end_year_month],
            "myanmar_bounds": dict(myanmar_bounds),
        },
    )


def validate_csv(path: str | Path, **kwargs: Any) -> dict[str, Any]:
    """Read a CSV or Parquet file and run :func:`validate_dataset` on it."""

    return validate_dataset(Path(path), **kwargs)


def validate_source_manifest(
    manifest: Any,
    *,
    required_columns: Iterable[str] = MANIFEST_REQUIRED_COLUMNS,
    sample_limit: int = 5,
) -> dict[str, Any]:
    """Validate provenance metadata used alongside a feature export.

    A manifest row should identify a source's dataset ID, resolution, units, and
    version.  This deliberately does not require a particular provider, allowing
    CHIRPS, ERA5-Land, Sentinel, SoilGrids, and local government sources to coexist.
    """

    source_frame = _coerce_table(manifest)
    frame = _first_occurrence_columns(source_frame)
    checks: list[dict[str, Any]] = []
    required = _normalise_column_list(required_columns)
    present = set(map(str, frame.columns))
    missing = [column for column in required if column not in present]
    _add_check(
        checks,
        name="manifest_required_columns",
        status="pass" if not missing else "fail",
        message="All required source-manifest columns are present."
        if not missing
        else "Source manifest is missing required columns.",
        invalid_count=len(missing),
        details={"missing_columns": missing, "required_columns": required},
    )
    duplicate_names = [str(column) for column in source_frame.columns[source_frame.columns.duplicated()].tolist()]
    _add_check(
        checks,
        name="manifest_unique_column_names",
        status="pass" if not duplicate_names else "fail",
        message="Manifest column names are unique."
        if not duplicate_names
        else "Source manifest has duplicate column names.",
        invalid_count=len(duplicate_names),
        details={"duplicate_columns": duplicate_names},
    )

    for column in required:
        if column not in present:
            continue
        missing_mask = _blank_or_null_mask(frame[column])
        _add_check(
            checks,
            name=f"manifest_nonempty__{column}",
            status="pass" if not bool(missing_mask.any()) else "fail",
            message=f"Manifest field '{column}' is populated."
            if not bool(missing_mask.any())
            else f"Manifest field '{column}' has blank or null values.",
            invalid_count=int(missing_mask.sum()),
            examples=_sample_records(frame, missing_mask, [column], sample_limit),
        )

    if "source_name" in present:
        duplicate_mask = frame.duplicated(subset=["source_name"], keep=False)
        _add_check(
            checks,
            name="manifest_unique_source_name",
            status="pass" if not bool(duplicate_mask.any()) else "warning",
            message="Each source appears once in the manifest."
            if not bool(duplicate_mask.any())
            else "Some source names appear more than once; verify intentional versioned entries.",
            invalid_count=int(duplicate_mask.sum()),
            examples=_sample_records(frame, duplicate_mask, ["source_name", "dataset_id", "version"], sample_limit),
        )

    return _build_report(
        checks=checks,
        table_name=_dataset_name(manifest),
        row_count=len(frame),
        columns=list(map(str, source_frame.columns)),
        missingness=_missingness_summary(frame),
        configuration={"manifest": True},
    )


def write_qa_report(report: Mapping[str, Any], path: str | Path) -> Path:
    """Persist a QA report as UTF-8 JSON and return its path.

    The function is intentionally small so extraction scripts can use it without a
    logging framework.  ``allow_nan=False`` makes accidental NumPy/Pandas values
    visible instead of emitting non-standard JSON.
    """

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8") as handle:
        json.dump(_json_safe(dict(report)), handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")
    return destination


def _coerce_table(dataset: Any) -> Any:
    """Return a DataFrame without requiring pandas merely to import this module."""

    if pd is None:
        raise ValidationDependencyError(
            "pandas is required to validate CSV/Parquet tables. Install it with `pip install pandas`."
        )

    if isinstance(dataset, pd.DataFrame):
        return dataset
    if isinstance(dataset, (str, Path)):
        path = Path(dataset)
        suffix = path.suffix.lower()
        if suffix in {".parquet", ".pq"}:
            return pd.read_parquet(path)
        return pd.read_csv(path)
    if isinstance(dataset, Sequence) and not isinstance(dataset, (str, bytes, bytearray)):
        return pd.DataFrame(dataset)
    if isinstance(dataset, Mapping):
        return pd.DataFrame(dataset)
    raise TypeError("dataset must be a pandas DataFrame, CSV/Parquet path, mapping, or record sequence")


def _first_occurrence_columns(frame: Any) -> Any:
    """Return a read-only validation view with duplicate headings removed after first use."""

    if not bool(frame.columns.duplicated().any()):
        return frame
    return frame.loc[:, ~frame.columns.duplicated()]


def _default_required_columns(
    *,
    crop_ids: tuple[str, ...],
    strict_schema: bool,
    supplied_required_columns: Iterable[str] | None,
) -> list[str]:
    """Select the stable public schema for a final export, or core keys for a partial one."""

    if supplied_required_columns is not None:
        return _normalise_column_list(supplied_required_columns)
    if not strict_schema:
        return list(CORE_REQUIRED_COLUMNS)
    # schema.py has no pandas dependency and is deliberately the source of truth
    # for the publication contract.  Retain a usable fallback if this file is
    # copied out of the package for one-off QA work.
    try:
        from .schema import required_columns as public_required_columns
    except ImportError:  # pragma: no cover - only relevant for copied single files
        return list(CORE_REQUIRED_COLUMNS)
    return public_required_columns(crop_ids)


def _validate_schema(
    frame: Any,
    checks: list[dict[str, Any]],
    required_columns: Iterable[str],
    strict_schema: bool,
) -> None:
    required = _normalise_column_list(required_columns)
    columns = list(map(str, frame.columns))
    present = set(columns)
    missing = [
        column
        for column in required
        if not _required_column_is_present(column, present)
    ]
    duplicate_names = [str(column) for column in frame.columns[frame.columns.duplicated()].tolist()]

    _add_check(
        checks,
        name="required_columns",
        status="pass" if not missing else "fail",
        message="All required core columns are present."
        if not missing
        else "Dataset is missing required core columns.",
        invalid_count=len(missing),
        details={"required_columns": required, "missing_columns": missing},
    )
    _add_check(
        checks,
        name="unique_column_names",
        status="pass" if not duplicate_names else "fail",
        message="Column names are unique."
        if not duplicate_names
        else "Dataset has duplicate column names.",
        invalid_count=len(duplicate_names),
        details={"duplicate_columns": duplicate_names},
    )

    # In strict mode make the intended publication metadata explicit.  In normal
    # mode the processing-date check below records this as a warning instead.
    if strict_schema:
        metadata_columns = {"processing_timestamp_utc", "processing_date", "processed_at"}
        _add_check(
            checks,
            name="strict_processing_metadata_column",
            status="pass" if present.intersection(metadata_columns) else "fail",
            message="A processing-date column is present."
            if present.intersection(metadata_columns)
            else "Strict schema requires processing_timestamp_utc (or a supported processing-date alias).",
            invalid_count=0 if present.intersection(metadata_columns) else 1,
        )


def _validate_key_completeness_and_duplicates(
    frame: Any, checks: list[dict[str, Any]], sample_limit: int
) -> None:
    needed = {"grid_id", "year_month"}
    if not needed.issubset(set(map(str, frame.columns))):
        _add_check(
            checks,
            name="unique_grid_month_key",
            status="warning",
            message="Skipped duplicate key check because grid_id or year_month is absent.",
        )
        return

    key_frame = frame[["grid_id", "year_month"]]
    latitude_column, longitude_column = _coordinate_column_names(frame)
    sample_columns = ["grid_id", "year_month", latitude_column, longitude_column]
    incomplete_mask = _blank_or_null_mask(key_frame["grid_id"]) | _blank_or_null_mask(key_frame["year_month"])
    _add_check(
        checks,
        name="grid_month_key_complete",
        status="pass" if not bool(incomplete_mask.any()) else "fail",
        message="Every row has a grid_id and year_month."
        if not bool(incomplete_mask.any())
        else "Some rows have a blank grid_id or year_month.",
        invalid_count=int(incomplete_mask.sum()),
        examples=_sample_records(frame, incomplete_mask, sample_columns, sample_limit),
    )

    complete_keys = ~incomplete_mask
    duplicate_mask = complete_keys & frame.duplicated(subset=["grid_id", "year_month"], keep=False)
    _add_check(
        checks,
        name="unique_grid_month_key",
        status="pass" if not bool(duplicate_mask.any()) else "fail",
        message="grid_id + year_month is unique."
        if not bool(duplicate_mask.any())
        else "Duplicate grid_id + year_month records were found.",
        invalid_count=int(duplicate_mask.sum()),
        examples=_sample_records(frame, duplicate_mask, sample_columns, sample_limit),
    )


def _validate_year_month(
    frame: Any,
    checks: list[dict[str, Any]],
    start_year_month: str,
    end_year_month: str,
    sample_limit: int,
) -> None:
    if "year_month" not in set(map(str, frame.columns)):
        _add_check(checks, name="year_month_format", status="warning", message="Skipped: year_month is absent.")
        return

    values = frame["year_month"].astype("string")
    nonempty = ~_blank_or_null_mask(frame["year_month"])
    format_mask = nonempty & ~values.str.match(_YEAR_MONTH_RE, na=False)
    _add_check(
        checks,
        name="year_month_format",
        status="pass" if not bool(format_mask.any()) else "fail",
        message="year_month uses YYYY-MM format."
        if not bool(format_mask.any())
        else "Some year_month values do not use YYYY-MM format.",
        invalid_count=int(format_mask.sum()),
        examples=_sample_records(frame, format_mask, ["grid_id", "year_month"], sample_limit),
    )

    valid_format = nonempty & ~format_mask
    out_of_window = valid_format & ((values < start_year_month) | (values > end_year_month))
    _add_check(
        checks,
        name="year_month_supported_window",
        status="pass" if not bool(out_of_window.any()) else "fail",
        message=f"All records are within {start_year_month} to {end_year_month}."
        if not bool(out_of_window.any())
        else f"Some records fall outside {start_year_month} to {end_year_month}.",
        invalid_count=int(out_of_window.sum()),
        examples=_sample_records(frame, out_of_window, ["grid_id", "year_month"], sample_limit),
    )


def _validate_coordinates(
    frame: Any,
    checks: list[dict[str, Any]],
    bounds: Mapping[str, float],
    sample_limit: int,
) -> None:
    latitude_column, longitude_column = _coordinate_column_names(frame)
    if latitude_column is None or longitude_column is None:
        _add_check(
            checks,
            name="coordinate_numeric",
            status="fail",
            message="Latitude/longitude columns are absent (accepted names: latitude/lat and longitude/lon).",
            invalid_count=1,
        )
        return

    lat_raw = frame[latitude_column]
    lon_raw = frame[longitude_column]
    lat = pd.to_numeric(lat_raw, errors="coerce")
    lon = pd.to_numeric(lon_raw, errors="coerce")
    present = ~_blank_or_null_mask(lat_raw) & ~_blank_or_null_mask(lon_raw)
    nonnumeric = present & (lat.isna() | lon.isna())
    _add_check(
        checks,
        name="coordinate_numeric",
        status="pass" if not bool(nonnumeric.any()) else "fail",
        message="Latitude and longitude are numeric."
        if not bool(nonnumeric.any())
        else "Some non-empty latitude or longitude values are not numeric.",
        invalid_count=int(nonnumeric.sum()),
        examples=_sample_records(
            frame, nonnumeric, ["grid_id", "year_month", latitude_column, longitude_column], sample_limit
        ),
    )

    missing = ~present
    _add_check(
        checks,
        name="coordinate_complete",
        status="pass" if not bool(missing.any()) else "fail",
        message="Latitude and longitude are populated."
        if not bool(missing.any())
        else "Some rows have a missing latitude or longitude.",
        invalid_count=int(missing.sum()),
        examples=_sample_records(
            frame, missing, ["grid_id", "year_month", latitude_column, longitude_column], sample_limit
        ),
    )

    numeric = ~lat.isna() & ~lon.isna()
    global_range = numeric & ((lat < -90) | (lat > 90) | (lon < -180) | (lon > 180))
    _add_check(
        checks,
        name="coordinate_global_range",
        status="pass" if not bool(global_range.any()) else "fail",
        message="Coordinates are within valid global latitude/longitude ranges."
        if not bool(global_range.any())
        else "Some coordinates are outside valid global latitude/longitude ranges.",
        invalid_count=int(global_range.sum()),
        examples=_sample_records(
            frame, global_range, ["grid_id", "year_month", latitude_column, longitude_column], sample_limit
        ),
    )

    required_bound_keys = {"min_lat", "max_lat", "min_lon", "max_lon"}
    if not required_bound_keys.issubset(bounds):
        _add_check(
            checks,
            name="coordinate_myanmar_bbox",
            status="warning",
            message="Skipped Myanmar bounding-box check because bound keys are incomplete.",
        )
        return
    in_bbox = (
        numeric
        & (lat >= float(bounds["min_lat"]))
        & (lat <= float(bounds["max_lat"]))
        & (lon >= float(bounds["min_lon"]))
        & (lon <= float(bounds["max_lon"]))
    )
    outside = numeric & ~global_range & ~in_bbox
    _add_check(
        checks,
        name="coordinate_myanmar_bbox",
        status="pass" if not bool(outside.any()) else "fail",
        message="Coordinates fall within the Myanmar export bounding box."
        if not bool(outside.any())
        else "Some coordinates are outside the Myanmar export bounding box.",
        invalid_count=int(outside.sum()),
        examples=_sample_records(
            frame, outside, ["grid_id", "year_month", latitude_column, longitude_column], sample_limit
        ),
        details={"bounds": dict(bounds)},
    )


def _validate_admin0_myanmar(
    frame: Any, checks: list[dict[str, Any]], strict_schema: bool, sample_limit: int
) -> None:
    """Require the exported country-context value for a final Myanmar release.

    The GEE grid is clipped to the GAUL Myanmar geometry.  This additional
    check prevents a locally substituted CSV that merely falls inside the
    broad geographic bounding box from being released as a Myanmar extract.
    It complements, rather than replaces, the extraction-time polygon clip.
    """

    column = _first_present_column(frame, ("admin0_name", "country_name", "country"))
    if column is None:
        _add_check(
            checks,
            name="admin0_is_myanmar",
            status="fail" if strict_schema else "warning",
            message="Myanmar admin-0/country context is absent."
            if strict_schema
            else "Myanmar admin-0/country context is absent; extraction provenance should confirm it.",
            invalid_count=1,
        )
        return
    raw = frame[column]
    present = ~_blank_or_null_mask(raw)
    normalised = raw.astype("string").str.strip().str.casefold()
    invalid = ~present | normalised.ne("myanmar")
    _add_check(
        checks,
        name="admin0_is_myanmar",
        status="pass" if not bool(invalid.any()) else "fail",
        message="Every row is explicitly tagged as Myanmar."
        if not bool(invalid.any())
        else f"'{column}' is blank or not Myanmar for some rows.",
        invalid_count=int(invalid.sum()),
        examples=_sample_records(frame, invalid, ["grid_id", "year_month", column], sample_limit),
    )


def _validate_feature_coverage(frame: Any, checks: list[dict[str, Any]], strict_schema: bool) -> None:
    columns = {str(column).lower() for column in frame.columns}
    for group, aliases in FEATURE_GROUPS.items():
        present = [alias for alias in aliases if alias.lower() in columns]
        _add_check(
            checks,
            name=f"feature_group__{group}",
            status="pass" if present else ("fail" if strict_schema else "warning"),
            message=f"Feature group '{group}' is represented by {present[0]}."
            if present
            else f"Feature group '{group}' is not represented by any accepted column.",
            invalid_count=0 if present else 1,
            details={"accepted_columns": list(aliases), "present_columns": present},
        )


def _validate_feature_missingness(
    frame: Any,
    checks: list[dict[str, Any]],
    *,
    strict_schema: bool,
    max_feature_missing_fraction: float | None,
    sample_limit: int,
) -> None:
    """Verify that row-level missingness is honest and within the release gate."""

    column = _first_present_column(frame, ("feature_missing_fraction",))
    if column is None:
        _add_check(
            checks,
            name="feature_missing_fraction_valid",
            status="fail" if strict_schema else "warning",
            message="feature_missing_fraction is absent."
            if strict_schema
            else "feature_missing_fraction is absent; row-level model usability cannot be assessed.",
            invalid_count=1,
        )
        return

    raw = frame[column]
    numeric = pd.to_numeric(raw, errors="coerce")
    nonempty = ~_blank_or_null_mask(raw)
    missing_or_invalid = numeric.isna() | (numeric < 0) | (numeric > 1)
    if not strict_schema:
        missing_or_invalid = nonempty & missing_or_invalid
    _add_check(
        checks,
        name="feature_missing_fraction_valid",
        status="pass" if not bool(missing_or_invalid.any()) else "fail",
        message="feature_missing_fraction is numeric and within 0--1."
        if not bool(missing_or_invalid.any())
        else "feature_missing_fraction has missing, non-numeric, or out-of-range values.",
        invalid_count=int(missing_or_invalid.sum()),
        examples=_sample_records(frame, missing_or_invalid, ["grid_id", "year_month", column], sample_limit),
    )

    # The primary schema defines exactly which physical predictors this field
    # summarizes.  Comparing it with a recomputation catches a hand-edited
    # quality fraction that could otherwise hide an unusable all-null row.
    try:
        from .schema import MONTHLY_FEATURE_COLUMNS, STATIC_FEATURE_COLUMNS

        tracked = [
            feature
            for feature in STATIC_FEATURE_COLUMNS + MONTHLY_FEATURE_COLUMNS
            if feature in frame.columns
        ]
    except ImportError:  # pragma: no cover - standalone copied validator
        tracked = []
    if tracked:
        recalculated = frame[tracked].isna().mean(axis=1)
        comparable = numeric.notna() & numeric.between(0, 1, inclusive="both")
        # Values are rounded to four decimals during assembly, so this allows
        # one last-digit rounding difference but no substantive mismatch.
        mismatch = comparable & (numeric.sub(recalculated).abs() > 0.00011)
        _add_check(
            checks,
            name="feature_missing_fraction_consistent",
            status="pass" if not bool(mismatch.any()) else "fail",
            message="feature_missing_fraction agrees with the physical feature columns."
            if not bool(mismatch.any())
            else "feature_missing_fraction disagrees with the physical feature columns.",
            invalid_count=int(mismatch.sum()),
            examples=_sample_records(frame, mismatch, ["grid_id", "year_month", column], sample_limit),
            details={"tracked_feature_column_count": len(tracked), "rounding_tolerance": 0.00011},
        )

    if max_feature_missing_fraction is not None:
        excess = numeric.notna() & (numeric > max_feature_missing_fraction)
        _add_check(
            checks,
            name="feature_missing_fraction_release_gate",
            status="pass" if not bool(excess.any()) else "fail",
            message=(
                "Every row satisfies the configured feature-missingness release gate."
                if not bool(excess.any())
                else "Some rows exceed the configured feature-missingness release gate."
            ),
            invalid_count=int(excess.sum()),
            examples=_sample_records(frame, excess, ["grid_id", "year_month", column], sample_limit),
            details={"max_feature_missing_fraction": max_feature_missing_fraction},
        )

        usable_column = _first_present_column(frame, ("usable_for_training",))
        if usable_column is None:
            _add_check(
                checks,
                name="usable_for_training_consistent",
                status="fail" if strict_schema else "warning",
                message="usable_for_training is absent."
                if strict_schema
                else "usable_for_training is absent; filter rows by feature_missing_fraction before fitting.",
                invalid_count=1,
            )
            return
        usable = _coerce_boolean(frame[usable_column])
        expected_usable = numeric <= max_feature_missing_fraction
        invalid_usable = numeric.notna() & (
            usable.isna() | (usable != expected_usable)
        )
        _add_check(
            checks,
            name="usable_for_training_consistent",
            status="pass" if not bool(invalid_usable.any()) else "fail",
            message="usable_for_training agrees with the configured missingness gate."
            if not bool(invalid_usable.any())
            else "usable_for_training disagrees with the configured missingness gate.",
            invalid_count=int(invalid_usable.sum()),
            examples=_sample_records(
                frame, invalid_usable, ["grid_id", "year_month", column, usable_column], sample_limit
            ),
            details={"max_feature_missing_fraction": max_feature_missing_fraction},
        )


def _validate_ranges(
    frame: Any,
    checks: list[dict[str, Any]],
    range_rules: Mapping[str, Mapping[str, Any]],
    sample_limit: int,
) -> None:
    normalised_columns = {str(column).lower(): str(column) for column in frame.columns}
    for rule_name, rule in range_rules.items():
        aliases = [str(alias).lower() for alias in rule.get("aliases", ())]
        matching_columns = [normalised_columns[alias] for alias in aliases if alias in normalised_columns]
        if not matching_columns:
            _add_check(
                checks,
                name=f"range__{rule_name}",
                status="warning",
                message=f"Skipped range check: no '{rule_name}' column is present.",
                details={"accepted_columns": list(rule.get("aliases", ()))},
            )
            continue

        lower = float(rule["min"])
        upper = float(rule["max"])
        for column in matching_columns:
            raw = frame[column]
            numeric = pd.to_numeric(raw, errors="coerce")
            nonempty = ~_blank_or_null_mask(raw)
            nonnumeric = nonempty & numeric.isna()
            out_of_range = numeric.notna() & ((numeric < lower) | (numeric > upper))
            invalid = nonnumeric | out_of_range
            _add_check(
                checks,
                name=f"range__{rule_name}__{column}",
                status="pass" if not bool(invalid.any()) else "fail",
                message=f"'{column}' is numeric and within [{lower}, {upper}] {rule.get('unit', '')}."
                if not bool(invalid.any())
                else f"'{column}' contains non-numeric or out-of-range values for {rule.get('unit', '')}.",
                invalid_count=int(invalid.sum()),
                examples=_sample_records(frame, invalid, ["grid_id", "year_month", column], sample_limit),
                details={
                    "min": lower,
                    "max": upper,
                    "unit": rule.get("unit"),
                    "non_numeric_count": int(nonnumeric.sum()),
                    "out_of_range_count": int(out_of_range.sum()),
                },
            )


def _validate_scene_count_consistency(
    frame: Any, checks: list[dict[str, Any]], sample_limit: int
) -> None:
    """Ensure cloud-clear Sentinel-2 scenes cannot exceed source scenes."""

    source_column = _first_present_column(frame, ("s2_scene_count", "sentinel2_scene_count"))
    valid_column = _first_present_column(frame, ("s2_valid_observation_count", "s2_valid_count"))
    if source_column is None or valid_column is None:
        _add_check(
            checks,
            name="s2_valid_scene_count_consistency",
            status="warning",
            message="Skipped Sentinel-2 valid/source scene consistency because one count column is absent.",
        )
        return
    source = pd.to_numeric(frame[source_column], errors="coerce")
    valid = pd.to_numeric(frame[valid_column], errors="coerce")
    comparable = source.notna() & valid.notna()
    invalid = comparable & (valid > source)
    _add_check(
        checks,
        name="s2_valid_scene_count_consistency",
        status="pass" if not bool(invalid.any()) else "fail",
        message="Sentinel-2 cloud-clear scene counts do not exceed source scene counts."
        if not bool(invalid.any())
        else "Some Sentinel-2 cloud-clear scene counts exceed source scene counts.",
        invalid_count=int(invalid.sum()),
        examples=_sample_records(
            frame, invalid, ["grid_id", "year_month", source_column, valid_column], sample_limit
        ),
    )


def _validate_processing_date(
    frame: Any, checks: list[dict[str, Any]], strict_schema: bool, sample_limit: int
) -> None:
    column = _first_present_column(frame, FEATURE_GROUPS["processing_date"])
    if column is None:
        _add_check(
            checks,
            name="processing_date_parseable",
            status="fail" if strict_schema else "warning",
            message="Processing date is absent."
            if strict_schema
            else "Processing date is absent; retain it in the row or source manifest for reproducibility.",
        )
        return
    parsed = pd.to_datetime(frame[column], errors="coerce", utc=True)
    nonempty = ~_blank_or_null_mask(frame[column])
    missing = ~nonempty
    unparsable = nonempty & parsed.isna()
    invalid = unparsable | (missing if strict_schema else False)
    _add_check(
        checks,
        name="processing_date_parseable",
        status="pass" if not bool(invalid.any()) else "fail",
        message="Processing date values are populated and parseable."
        if not bool(invalid.any())
        else "Some processing date values are missing or cannot be parsed.",
        invalid_count=int(invalid.sum()),
        examples=_sample_records(frame, invalid, ["grid_id", "year_month", column], sample_limit),
        details={"missing_count": int(missing.sum()), "unparsable_count": int(unparsable.sum())},
    )


def _validate_source_versions(
    frame: Any, checks: list[dict[str, Any]], strict_schema: bool, sample_limit: int
) -> None:
    """Ensure per-row source identifiers are present and remain parseable JSON."""

    column = _first_present_column(frame, FEATURE_GROUPS["source_versions"])
    if column is None:
        _add_check(
            checks,
            name="source_versions_json_parseable",
            status="fail" if strict_schema else "warning",
            message="source_versions_json is absent."
            if strict_schema
            else "source_versions_json is absent; retain source versions in the row or provenance manifest.",
            invalid_count=1,
        )
        return

    raw = frame[column]
    nonempty = ~_blank_or_null_mask(raw)

    def is_object_json(value: Any) -> bool:
        if value is None:
            return False
        try:
            parsed = json.loads(str(value))
        except (TypeError, ValueError, json.JSONDecodeError):
            return False
        return isinstance(parsed, dict) and bool(parsed)

    valid_json = raw.map(is_object_json)
    missing = ~nonempty
    malformed = nonempty & ~valid_json
    invalid = malformed | (missing if strict_schema else False)
    _add_check(
        checks,
        name="source_versions_json_parseable",
        status="pass" if not bool(invalid.any()) else "fail",
        message="source_versions_json contains populated, non-empty JSON objects."
        if not bool(invalid.any())
        else "Some source_versions_json values are missing or not non-empty JSON objects.",
        invalid_count=int(invalid.sum()),
        examples=_sample_records(frame, invalid, ["grid_id", "year_month", column], sample_limit),
        details={"missing_count": int(missing.sum()), "malformed_count": int(malformed.sum())},
    )


def _validate_suitability_labels(
    frame: Any,
    checks: list[dict[str, Any]],
    *,
    expected_crops: tuple[str, ...],
    strict_schema: bool,
    threshold: float,
    sample_limit: int,
) -> None:
    columns = {str(column): str(column) for column in frame.columns}
    score_prefix = "suitability_score__"
    score_crops = sorted(column[len(score_prefix) :] for column in columns if column.startswith(score_prefix))
    expected = tuple(dict.fromkeys(expected_crops))
    missing_expected = [crop for crop in expected if crop not in score_crops]
    _add_check(
        checks,
        name="suitability_score_columns",
        status=(
            "fail"
            if not score_crops or (strict_schema and missing_expected)
            else "warning"
            if missing_expected
            else "pass"
        ),
        message=(
            "Suitability score columns are present for the expected crops."
            if score_crops and not missing_expected
            else "Suitability score columns are missing for one or more expected crops."
        ),
        invalid_count=(len(missing_expected) if score_crops else max(1, len(expected))),
        details={"found_crops": score_crops, "missing_expected_crops": missing_expected},
    )
    if not score_crops:
        return

    for crop in score_crops:
        score_column = f"{score_prefix}{crop}"
        score_raw = frame[score_column]
        score = pd.to_numeric(score_raw, errors="coerce")
        score_nonempty = ~_blank_or_null_mask(score_raw)
        score_invalid = score_nonempty & (score.isna() | (score < 0) | (score > 100))
        _add_check(
            checks,
            name=f"suitability_score_range__{crop}",
            status="pass" if not bool(score_invalid.any()) else "fail",
            message=f"Suitability scores for '{crop}' are numeric values from 0 to 100."
            if not bool(score_invalid.any())
            else f"Suitability scores for '{crop}' contain invalid values.",
            invalid_count=int(score_invalid.sum()),
            examples=_sample_records(
                frame, score_invalid, ["grid_id", "year_month", score_column], sample_limit
            ),
        )

        label_column = f"is_suitable__{crop}"
        source_column = f"label_source__{crop}"
        confidence_column = f"label_confidence__{crop}"
        if label_column not in columns:
            _add_check(
                checks,
                name=f"suitability_label_column__{crop}",
                status="fail",
                message=f"Missing required label column '{label_column}'.",
                invalid_count=1,
            )
        else:
            _validate_boolean_label_consistency(
                frame,
                checks,
                crop=crop,
                score=score,
                score_is_valid=score.notna() & (score >= 0) & (score <= 100),
                label_column=label_column,
                threshold=threshold,
                sample_limit=sample_limit,
            )

        _validate_label_source(
            frame,
            checks,
            crop=crop,
            source_column=source_column,
            scored_rows=score.notna(),
            strict_schema=strict_schema,
            sample_limit=sample_limit,
        )
        _validate_label_confidence(
            frame,
            checks,
            crop=crop,
            confidence_column=confidence_column,
            scored_rows=score.notna(),
            strict_schema=strict_schema,
            sample_limit=sample_limit,
        )


def _validate_boolean_label_consistency(
    frame: Any,
    checks: list[dict[str, Any]],
    *,
    crop: str,
    score: Any,
    score_is_valid: Any,
    label_column: str,
    threshold: float,
    sample_limit: int,
) -> None:
    labels = _coerce_boolean(frame[label_column])
    label_required = score.notna()
    invalid_label = label_required & labels.isna()
    _add_check(
        checks,
        name=f"suitability_label_boolean__{crop}",
        status="pass" if not bool(invalid_label.any()) else "fail",
        message=f"'{label_column}' contains boolean/0-1 labels where a score is present."
        if not bool(invalid_label.any())
        else f"'{label_column}' contains missing or invalid boolean labels.",
        invalid_count=int(invalid_label.sum()),
        examples=_sample_records(frame, invalid_label, ["grid_id", "year_month", label_column], sample_limit),
    )
    expected = score >= threshold
    mismatch = score_is_valid & labels.notna() & (labels != expected)
    _add_check(
        checks,
        name=f"suitability_threshold_consistency__{crop}",
        status="pass" if not bool(mismatch.any()) else "fail",
        message=f"'{label_column}' agrees with score >= {threshold:g}."
        if not bool(mismatch.any())
        else f"'{label_column}' disagrees with the configured score threshold ({threshold:g}).",
        invalid_count=int(mismatch.sum()),
        examples=_sample_records(
            frame,
            mismatch,
            ["grid_id", "year_month", f"suitability_score__{crop}", label_column],
            sample_limit,
        ),
        details={"threshold": threshold},
    )


def _validate_label_source(
    frame: Any,
    checks: list[dict[str, Any]],
    *,
    crop: str,
    source_column: str,
    scored_rows: Any,
    strict_schema: bool,
    sample_limit: int,
) -> None:
    if source_column not in set(map(str, frame.columns)):
        _add_check(
            checks,
            name=f"label_source__{crop}",
            status="fail" if strict_schema else "warning",
            message=f"Missing '{source_column}', so label provenance cannot be audited.",
            invalid_count=1,
        )
        return
    missing = scored_rows & _blank_or_null_mask(frame[source_column])
    _add_check(
        checks,
        name=f"label_source__{crop}",
        status="pass" if not bool(missing.any()) else "fail",
        message=f"'{source_column}' is populated for scored records."
        if not bool(missing.any())
        else f"'{source_column}' is missing for scored records.",
        invalid_count=int(missing.sum()),
        examples=_sample_records(frame, missing, ["grid_id", "year_month", source_column], sample_limit),
    )


def _validate_label_confidence(
    frame: Any,
    checks: list[dict[str, Any]],
    *,
    crop: str,
    confidence_column: str,
    scored_rows: Any,
    strict_schema: bool,
    sample_limit: int,
) -> None:
    if confidence_column not in set(map(str, frame.columns)):
        _add_check(
            checks,
            name=f"label_confidence__{crop}",
            status="fail" if strict_schema else "warning",
            message=f"Missing '{confidence_column}', so label confidence cannot be audited.",
            invalid_count=1,
        )
        return
    raw = frame[confidence_column]
    numeric = pd.to_numeric(raw, errors="coerce")
    missing_or_invalid = scored_rows & (numeric.isna() | (numeric < 0) | (numeric > 1))
    _add_check(
        checks,
        name=f"label_confidence__{crop}",
        status="pass" if not bool(missing_or_invalid.any()) else "fail",
        message=f"'{confidence_column}' is a 0--1 confidence for scored records."
        if not bool(missing_or_invalid.any())
        else f"'{confidence_column}' contains missing, non-numeric, or out-of-range confidence values.",
        invalid_count=int(missing_or_invalid.sum()),
        examples=_sample_records(
            frame, missing_or_invalid, ["grid_id", "year_month", confidence_column], sample_limit
        ),
    )


def _missingness_summary(frame: Any) -> dict[str, Any]:
    row_count = len(frame)
    column_count = len(frame.columns)
    by_column: dict[str, dict[str, Any]] = {}
    total_missing = 0
    for column in frame.columns:
        missing_count = int(_blank_or_null_mask(frame[column]).sum())
        total_missing += missing_count
        by_column[str(column)] = {
            "missing_count": missing_count,
            "missing_pct": _pct(missing_count, row_count),
        }
    return {
        "overall_missing_count": total_missing,
        "overall_missing_pct": _pct(total_missing, row_count * column_count),
        "by_column": by_column,
    }


def _build_report(
    *,
    checks: list[dict[str, Any]],
    table_name: str | None,
    row_count: int,
    columns: list[str],
    missingness: Mapping[str, Any],
    configuration: Mapping[str, Any],
) -> dict[str, Any]:
    error_count = sum(check["status"] == "fail" for check in checks)
    warning_count = sum(check["status"] == "warning" for check in checks)
    pass_count = sum(check["status"] == "pass" for check in checks)
    errors = [check for check in checks if check["status"] == "fail"]
    warnings = [check for check in checks if check["status"] == "warning"]
    return _json_safe(
        {
            "validation_version": VALIDATION_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "valid": error_count == 0,
            "summary": {
                "table_name": table_name,
                "row_count": int(row_count),
                "column_count": len(columns),
                "check_count": len(checks),
                "passed_check_count": pass_count,
                "warning_count": warning_count,
                "error_count": error_count,
            },
            "configuration": dict(configuration),
            "columns": columns,
            "missingness": dict(missingness),
            # Keep explicit lists as well as summary counts so a CLI can display
            # failures without reimplementing status filtering.
            "errors": errors,
            "warnings": warnings,
            "checks": checks,
        }
    )


def _add_check(
    checks: list[dict[str, Any]],
    *,
    name: str,
    status: Literal["pass", "warning", "fail"],
    message: str,
    invalid_count: int | None = None,
    examples: list[dict[str, Any]] | None = None,
    details: Mapping[str, Any] | None = None,
) -> None:
    check: dict[str, Any] = {"name": name, "status": status, "message": message}
    if invalid_count is not None:
        check["invalid_count"] = int(invalid_count)
    if examples:
        check["examples"] = examples
    if details:
        check["details"] = dict(details)
    checks.append(check)


def _first_present_column(frame: Any, aliases: Iterable[str]) -> str | None:
    columns_by_lower = {str(column).lower(): str(column) for column in frame.columns}
    for alias in aliases:
        actual = columns_by_lower.get(alias.lower())
        if actual is not None:
            return actual
    return None


def _coordinate_column_names(frame: Any) -> tuple[str | None, str | None]:
    """Return the actual latitude and longitude fields, accepting lat/lon aliases."""

    return (
        _first_present_column(frame, _COORDINATE_ALIASES["latitude"]),
        _first_present_column(frame, _COORDINATE_ALIASES["longitude"]),
    )


def _required_column_is_present(column: str, present: set[str]) -> bool:
    """Apply the public ``lat``/``lon`` compatibility aliases to the core schema."""

    normalised = column.lower()
    if normalised in _COORDINATE_ALIASES:
        aliases = _COORDINATE_ALIASES[normalised]
        return any(alias in {name.lower() for name in present} for alias in aliases)
    return column in present


def _normalise_column_list(columns: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(str(column) for column in columns))


def _blank_or_null_mask(series: Any) -> Any:
    """Treat whitespace-only strings as missing without coercing numeric columns."""

    missing = series.isna()
    if pd.api.types.is_string_dtype(series) or pd.api.types.is_object_dtype(series):
        return missing | series.astype("string").str.strip().eq("").fillna(False)
    return missing


def _coerce_boolean(series: Any) -> Any:
    """Return True/False/NA labels from native booleans, 0/1, and common strings."""

    result = pd.Series(pd.NA, index=series.index, dtype="boolean")
    if pd.api.types.is_bool_dtype(series):
        return series.astype("boolean")

    textual = series.astype("string").str.strip().str.lower()
    result.loc[textual.isin(_TRUE_VALUES)] = True
    result.loc[textual.isin(_FALSE_VALUES)] = False

    # A numeric nullable series may format values as "1.0"; accept exactly 0/1.
    numeric = pd.to_numeric(series, errors="coerce")
    result.loc[numeric.eq(1)] = True
    result.loc[numeric.eq(0)] = False
    return result


def _sample_records(frame: Any, mask: Any, columns: Iterable[str], limit: int) -> list[dict[str, Any]]:
    if limit <= 0 or not bool(mask.any()):
        return []
    available = [column for column in dict.fromkeys(columns) if column in set(map(str, frame.columns))]
    if not available:
        return []
    records = frame.loc[mask, available].head(limit).to_dict(orient="records")
    return _json_safe(records)


def _dataset_name(dataset: Any) -> str | None:
    return str(dataset) if isinstance(dataset, (str, Path)) else None


def _pct(numerator: int, denominator: int) -> float:
    return round((100.0 * numerator / denominator), 6) if denominator else 0.0


def _json_safe(value: Any) -> Any:
    """Recursively convert pandas/NumPy scalars and dates to strict JSON values."""

    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if value == value and value not in {float("inf"), float("-inf")} else None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]

    # pd.NA, NaT, numpy scalars, and Timestamp are handled here without importing
    # NumPy directly.  ``item`` is intentionally attempted before string fallback.
    if pd is not None:
        try:
            if bool(pd.isna(value)):
                return None
        except (TypeError, ValueError):
            pass
    item = getattr(value, "item", None)
    if callable(item):
        try:
            return _json_safe(item())
        except (TypeError, ValueError):
            pass
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat):
        try:
            return isoformat()
        except (TypeError, ValueError):
            pass
    return str(value)


__all__ = [
    "CORE_REQUIRED_COLUMNS",
    "DEFAULT_END_YEAR_MONTH",
    "DEFAULT_START_YEAR_MONTH",
    "DEFAULT_SUITABILITY_THRESHOLD",
    "FEATURE_GROUPS",
    "MANIFEST_REQUIRED_COLUMNS",
    "MYANMAR_BOUNDS",
    "RANGE_RULES",
    "TARGET_CROPS",
    "VALIDATION_VERSION",
    "ValidationDependencyError",
    "validate_csv",
    "validate_dataset",
    "validate_source_manifest",
    "write_qa_report",
]
