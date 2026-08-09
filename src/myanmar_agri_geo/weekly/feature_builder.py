"""Build exact weekly model-input rows from row-aligned serving artifacts.

``features_serving.parquet`` intentionally has only the 75 model features.  Its
identity is held in ``spatial_index.parquet`` at the same row positions.  This
module keeps that positional contract intact; it never invents grid IDs and it
never performs a nearest-neighbour or arbitrary regional fallback.

The released models are monthly.  A weekly run is therefore a refresh of the
three current-month fields only.  All precomputed training-time aggregate
columns (including NDVI, NDWI, Sentinel-1 and ERA5 aggregate columns) remain
the values from the selected aligned serving row.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MODEL_DATA_DIR = PROJECT_ROOT.parent / "GEO_MODEL_SERVER" / "data" / "processed"

ALL_75_FEATURES: list[str] = [
    "elevation_m", "slope_degrees", "aspect_degrees", "distance_to_surface_water_m",
    "soil_cec_cmol_kg_0_30cm", "soil_clay_pct_0_30cm", "soil_sand_pct_0_30cm",
    "soil_silt_pct_0_30cm", "soil_soc_g_kg_0_30cm", "soil_ph_h2o_0_30cm",
    "surface_water_occurrence_pct", "surface_water_seasonality_months",
    "distance_to_road_km", "road_density_km_per_sqkm",
    "distance_to_railway_km", "railway_density_km_per_sqkm",
    "distance_to_river_km", "river_density_km_per_sqkm",
    "urban_fraction", "builtup_fraction", "cropland_fraction",
    "non_cropland_fraction", "permanent_water_fraction",
    "population_density", "valid_agriculture_mask",
    "chirps_precipitation_mm", "mean_temperature_c", "solar_radiation_mj_m2_day",
    "chirps_precipitation_mm_mean", "chirps_precipitation_mm_max",
    "chirps_precipitation_mm_min", "chirps_precipitation_mm_range",
    "chirps_precipitation_mm_cv",
    "era5_soil_moisture_m3_m3_mean", "era5_soil_moisture_m3_m3_max",
    "era5_soil_moisture_m3_m3_min", "era5_soil_moisture_m3_m3_cv",
    "mean_temperature_c_mean", "mean_temperature_c_max",
    "mean_temperature_c_min", "mean_temperature_c_range",
    "ndvi_median_mean", "ndvi_median_max", "ndvi_median_min",
    "ndvi_median_growing_season_mean",
    "ndwi_mcf_median_mean", "ndwi_mcf_median_max",
    "s1_vh_db_median_mean", "s1_vv_db_median_mean",
    "solar_radiation_mj_m2_day_mean", "solar_radiation_mj_m2_day_max",
    "data_month",
    "crop_area_pct_monsoon_rice", "crop_area_pct_dry_season_rice",
    "crop_area_pct_maize", "crop_area_pct_sugarcane", "crop_area_pct_cassava",
    "crop_area_pct_durian", "crop_area_pct_mangosteen", "crop_area_pct_longan",
    "crop_area_pct_mango", "crop_area_pct_chili", "crop_area_pct_tomato",
    "crop_area_pct_black_gram", "crop_area_pct_green_gram",
    "crop_area_pct_pigeon_pea", "crop_area_pct_groundnut",
    "crop_area_pct_sesame", "crop_area_pct_rubber",
    "region_ayeyawaddy", "region_bago", "region_magway",
    "region_mandalay", "region_sagaing", "region_yangon",
]

MODEL_INPUT_SCHEMA_SHA256 = "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8"
FEATURE_SCHEMA_SHA256 = hashlib.sha256(
    json.dumps(ALL_75_FEATURES, separators=(",", ":")).encode("utf-8")
).hexdigest()

if len(ALL_75_FEATURES) != 75 or FEATURE_SCHEMA_SHA256 != MODEL_INPUT_SCHEMA_SHA256:
    raise RuntimeError("checked-in 75-feature contract does not match the audited model schema")

CURRENT_MONTH_REFRESHABLE_FEATURES = (
    "chirps_precipitation_mm",
    "mean_temperature_c",
    "solar_radiation_mj_m2_day",
)

# These fields precede the exact ordered 75-feature suffix in validated CSVs.
WEEKLY_IDENTITY_COLUMNS = [
    "grid_id",
    "serving_sample_id",
    "latitude",
    "longitude",
    "region",
    "week_start",
    "week_end",
    "observation_month",
    "serving_year_month",
    "observation_days",
    "expected_days",
    "coverage_ratio",
    "is_partial_week",
    "source_coverage_json",
    "source_observation_dates_json",
    "source_dates_used_json",
    "feature_schema_sha256",
]
VALIDATED_WEEKLY_COLUMNS = WEEKLY_IDENTITY_COLUMNS + ALL_75_FEATURES

SPATIAL_REQUIRED_COLUMNS = [
    "sample_id", "grid_id", "year_month", "region", "longitude", "latitude"
]
REGION_ONE_HOT = {
    "ayeyawaddy": "region_ayeyawaddy",
    "bago": "region_bago",
    "magway": "region_magway",
    "mandalay": "region_mandalay",
    "sagaing": "region_sagaing",
    "yangon": "region_yangon",
}
CANONICAL_GRID_ID = re.compile(r"^mm_\d+_\d+$")


class FeatureContractError(ValueError):
    """Raised when a row cannot be built without violating the model contract."""


def configured_serving_paths() -> tuple[Path, Path]:
    """Return configurable serving/spatial paths with repository-local defaults."""

    model_data_dir = Path(os.environ.get("GEO_MODEL_DATA_DIR", DEFAULT_MODEL_DATA_DIR))
    features = Path(
        os.environ.get("FEATURES_SERVING_PARQUET", model_data_dir / "features_serving.parquet")
    )
    spatial = Path(
        os.environ.get("SPATIAL_INDEX_PARQUET", model_data_dir / "spatial_index.parquet")
    )
    return features.expanduser(), spatial.expanduser()


def _require_columns(actual: Iterable[str], required: Iterable[str], *, artifact: str) -> None:
    actual_set = set(actual)
    missing = [name for name in required if name not in actual_set]
    if missing:
        raise FeatureContractError(f"{artifact} is missing required columns: {missing}")


def _load_spatial_index(spatial_index_path: Path) -> pd.DataFrame:
    if not spatial_index_path.is_file():
        raise FeatureContractError(f"spatial index not found: {spatial_index_path}")
    try:
        spatial = pd.read_parquet(spatial_index_path, columns=SPATIAL_REQUIRED_COLUMNS)
    except Exception as exc:
        raise FeatureContractError(f"failed to read spatial index: {exc}") from exc

    _require_columns(spatial.columns, SPATIAL_REQUIRED_COLUMNS, artifact="spatial index")
    if spatial.empty:
        raise FeatureContractError("spatial index is empty")
    if spatial["sample_id"].duplicated().any():
        raise FeatureContractError("spatial index contains duplicate sample_id values")
    if spatial.duplicated(["grid_id", "year_month"]).any():
        raise FeatureContractError("spatial index contains duplicate grid_id/year_month rows")
    invalid_grid = ~spatial["grid_id"].astype(str).str.fullmatch(CANONICAL_GRID_ID)
    if invalid_grid.any():
        value = spatial.loc[invalid_grid, "grid_id"].iloc[0]
        raise FeatureContractError(f"spatial index contains non-canonical grid_id: {value!r}")

    numeric_coordinates = spatial[["longitude", "latitude"]].apply(pd.to_numeric, errors="coerce")
    if not np.isfinite(numeric_coordinates.to_numpy(dtype=float)).all():
        raise FeatureContractError("spatial index contains missing or non-finite coordinates")

    parsed_month = pd.to_datetime(spatial["year_month"], format="%Y-%m", errors="coerce")
    if parsed_month.isna().any():
        raise FeatureContractError("spatial index contains invalid year_month values")

    spatial = spatial.copy()
    spatial["_row_position"] = np.arange(len(spatial), dtype=np.int64)
    spatial["_parsed_month"] = parsed_month
    return spatial


def load_canonical_grid(spatial_index_path: Path, region: str) -> pd.DataFrame:
    """Load the latest canonical identity row for every grid cell in a region."""

    normalized_region = region.strip().lower()
    if normalized_region not in REGION_ONE_HOT:
        raise FeatureContractError(f"unknown weekly region: {region!r}")
    spatial = _load_spatial_index(Path(spatial_index_path))
    spatial = spatial[spatial["region"].astype(str).str.lower() == normalized_region]
    if spatial.empty:
        raise FeatureContractError(f"spatial index has no rows for region {normalized_region!r}")
    latest = (
        spatial.sort_values(["_parsed_month", "_row_position"])
        .drop_duplicates("grid_id", keep="last")
        .sort_values("grid_id")
    )
    return latest[SPATIAL_REQUIRED_COLUMNS + ["_row_position"]].reset_index(drop=True)


def _finite_float(value: Any, name: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise FeatureContractError(f"{name} is missing or not numeric") from exc
    if not math.isfinite(result):
        raise FeatureContractError(f"{name} is missing or non-finite")
    return result


def _canonical_json_object(value: Any, name: str) -> str:
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError as exc:
            raise FeatureContractError(f"{name} is not valid JSON") from exc
    else:
        decoded = value
    if not isinstance(decoded, dict):
        raise FeatureContractError(f"{name} must be a JSON object")
    for key, item in decoded.items():
        if not isinstance(key, str):
            raise FeatureContractError(f"{name} contains a non-string key")
        if name == "source_coverage_json":
            number = _finite_float(item, f"{name}.{key}")
            if number < 0 or number > 1:
                raise FeatureContractError(f"{name}.{key} must be between 0 and 1")
    return json.dumps(decoded, sort_keys=True, separators=(",", ":"))


class FeatureBuilder:
    """Load row-aligned serving artifacts and produce fail-closed weekly rows."""

    def __init__(
        self,
        serving_parquet_path: Path | None = None,
        spatial_index_path: Path | None = None,
    ) -> None:
        configured_features, configured_spatial = configured_serving_paths()
        self.serving_parquet_path = Path(serving_parquet_path or configured_features)
        self.spatial_index_path = Path(spatial_index_path or configured_spatial)
        self._aligned: pd.DataFrame | None = None

    def _load_aligned_latest_rows(self) -> None:
        if self._aligned is not None:
            return
        if not self.serving_parquet_path.is_file():
            raise FeatureContractError(f"serving feature parquet not found: {self.serving_parquet_path}")

        try:
            import pyarrow as pa
            import pyarrow.parquet as pq
        except ImportError as exc:
            raise FeatureContractError(
                "pyarrow is required to read the row-aligned serving artifacts"
            ) from exc

        parquet = pq.ParquetFile(self.serving_parquet_path)
        actual_schema = list(parquet.schema_arrow.names)
        if actual_schema != ALL_75_FEATURES:
            raise FeatureContractError(
                "features_serving.parquet columns/order do not match the exact audited 75-feature schema"
            )
        actual_checksum = hashlib.sha256(
            json.dumps(actual_schema, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        if actual_checksum != MODEL_INPUT_SCHEMA_SHA256:
            raise FeatureContractError(
                f"feature schema checksum mismatch: {actual_checksum} != {MODEL_INPUT_SCHEMA_SHA256}"
            )

        spatial = _load_spatial_index(self.spatial_index_path)
        if parquet.metadata.num_rows != len(spatial):
            raise FeatureContractError(
                "row alignment failure: features_serving.parquet and spatial_index.parquet "
                f"have different row counts ({parquet.metadata.num_rows} != {len(spatial)})"
            )

        latest = (
            spatial.sort_values(["_parsed_month", "_row_position"])
            .drop_duplicates("grid_id", keep="last")
            .sort_values("_row_position")
            .copy()
        )
        wanted = latest["_row_position"].to_numpy(dtype=np.int64)

        # The production parquet is a single ~1M-row group.  Stream it and take
        # only the ~10k latest aligned positions to keep peak memory bounded.
        selected_frames: list[pd.DataFrame] = []
        global_start = 0
        for batch in parquet.iter_batches(batch_size=65_536, columns=ALL_75_FEATURES):
            global_end = global_start + batch.num_rows
            left = int(np.searchsorted(wanted, global_start, side="left"))
            right = int(np.searchsorted(wanted, global_end, side="left"))
            if right > left:
                positions = wanted[left:right]
                offsets = pa.array(positions - global_start)
                frame = pa.Table.from_batches([batch]).take(offsets).to_pandas()
                frame["_row_position"] = positions
                selected_frames.append(frame)
            global_start = global_end

        if global_start != len(spatial) or not selected_frames:
            raise FeatureContractError("failed to read the selected row-aligned serving features")
        selected = pd.concat(selected_frames, ignore_index=True)
        aligned = latest.merge(
            selected,
            on="_row_position",
            how="left",
            validate="one_to_one",
            suffixes=("_spatial", ""),
        )
        if len(aligned) != len(latest):
            raise FeatureContractError("failed to preserve serving/spatial row alignment")

        # Cross-check the two identity signals already encoded in the features.
        feature_month = pd.to_numeric(aligned["data_month"], errors="coerce")
        spatial_month = aligned["year_month"].astype(str).str[-2:].astype(int)
        if not (feature_month == spatial_month).all():
            raise FeatureContractError("data_month does not align with spatial year_month")
        for region, one_hot_column in REGION_ONE_HOT.items():
            expected = aligned["region"].astype(str).str.lower().eq(region).astype(int)
            actual = pd.to_numeric(aligned[one_hot_column], errors="coerce")
            if not (actual == expected).all():
                raise FeatureContractError(
                    f"{one_hot_column} does not align with the spatial-index region"
                )

        self._aligned = aligned.set_index("grid_id", drop=False)

    def _aligned_row(self, grid_id: str, region: str) -> pd.Series:
        self._load_aligned_latest_rows()
        assert self._aligned is not None
        if not CANONICAL_GRID_ID.fullmatch(grid_id):
            raise FeatureContractError(f"grid_id is not canonical: {grid_id!r}")
        if grid_id not in self._aligned.index:
            raise FeatureContractError(f"grid_id is not present in spatial_index.parquet: {grid_id}")
        aligned = self._aligned.loc[grid_id]
        if isinstance(aligned, pd.DataFrame):
            raise FeatureContractError(f"canonical grid_id is ambiguous: {grid_id}")
        canonical_region = str(aligned["region"]).lower()
        if canonical_region != region.strip().lower():
            raise FeatureContractError(
                f"grid_id {grid_id} belongs to {canonical_region}, not {region}"
            )
        return aligned

    def build_feature_row(self, csv_row: dict[str, Any], region: str) -> dict[str, float]:
        """Return exactly 75 finite features in audited order.

        Only the three fields in ``CURRENT_MONTH_REFRESHABLE_FEATURES`` and
        ``data_month`` are refreshed.  Sentinel/NDVI/soil-moisture inputs in a
        raw weekly row are provenance/observation values and cannot overwrite
        the released model's aligned aggregate fields.
        """

        grid_id = str(csv_row.get("grid_id", ""))
        aligned = self._aligned_row(grid_id, region)
        features = {name: aligned[name] for name in ALL_75_FEATURES}

        for name in CURRENT_MONTH_REFRESHABLE_FEATURES:
            features[name] = _finite_float(csv_row.get(name), name)

        observation_month = str(csv_row.get("observation_month", ""))
        try:
            parsed_month = pd.Period(observation_month, freq="M")
        except (TypeError, ValueError) as exc:
            raise FeatureContractError("observation_month must use YYYY-MM format") from exc
        if str(parsed_month) != observation_month:
            raise FeatureContractError("observation_month must use YYYY-MM format")
        features["data_month"] = float(parsed_month.month)

        result: dict[str, float] = {}
        for name in ALL_75_FEATURES:
            result[name] = _finite_float(features.get(name), name)
        return result

    def build_validated_row(self, csv_row: dict[str, Any], region: str) -> dict[str, Any]:
        """Return identity/provenance metadata followed by the exact 75 features."""

        grid_id = str(csv_row.get("grid_id", ""))
        aligned = self._aligned_row(grid_id, region)
        features = self.build_feature_row(csv_row, region)

        observation_days = int(_finite_float(csv_row.get("observation_days"), "observation_days"))
        expected_days = int(_finite_float(csv_row.get("expected_days"), "expected_days"))
        coverage_ratio = _finite_float(csv_row.get("coverage_ratio"), "coverage_ratio")
        if expected_days != 7 or not 0 <= observation_days <= expected_days:
            raise FeatureContractError("weekly observation_days/expected_days are invalid")
        if not math.isclose(coverage_ratio, observation_days / expected_days, abs_tol=1e-6):
            raise FeatureContractError("coverage_ratio does not match observation_days/expected_days")

        is_partial = str(csv_row.get("is_partial_week", "")).strip().lower()
        if is_partial in {"true", "1"}:
            is_partial_week = True
        elif is_partial in {"false", "0"}:
            is_partial_week = False
        else:
            raise FeatureContractError("is_partial_week must be true or false")
        if is_partial_week != (observation_days < expected_days):
            raise FeatureContractError("is_partial_week conflicts with observation coverage")

        identity: dict[str, Any] = {
            "grid_id": grid_id,
            "serving_sample_id": str(aligned["sample_id"]),
            "latitude": _finite_float(aligned["latitude"], "latitude"),
            "longitude": _finite_float(aligned["longitude"], "longitude"),
            "region": region.strip().lower(),
            "week_start": str(csv_row.get("week_start", "")),
            "week_end": str(csv_row.get("week_end", "")),
            "observation_month": str(csv_row.get("observation_month", "")),
            "serving_year_month": str(aligned["year_month"]),
            "observation_days": observation_days,
            "expected_days": expected_days,
            "coverage_ratio": coverage_ratio,
            "is_partial_week": is_partial_week,
            "source_coverage_json": _canonical_json_object(
                csv_row.get("source_coverage_json"), "source_coverage_json"
            ),
            "source_observation_dates_json": _canonical_json_object(
                csv_row.get("source_observation_dates_json"),
                "source_observation_dates_json",
            ),
            "source_dates_used_json": _canonical_json_object(
                csv_row.get("source_dates_used_json"), "source_dates_used_json"
            ),
            "feature_schema_sha256": MODEL_INPUT_SCHEMA_SHA256,
        }
        return {name: identity[name] for name in WEEKLY_IDENTITY_COLUMNS} | features

    def build_batch(self, csv_rows: list[dict[str, Any]], region: str) -> list[dict[str, Any]]:
        return [self.build_validated_row(row, region) for row in csv_rows]
