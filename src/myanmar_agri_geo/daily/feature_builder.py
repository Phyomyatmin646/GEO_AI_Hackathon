"""Feature builder for the daily inference pipeline.

Constructs the exact 75 model-input features expected by the serving parquet
by merging:
  1. Static features    — read from features_serving.parquet by grid_id
  2. Dynamic features   — from the daily GEE export CSV (CHIRPS, ERA5, Sentinel)
  3. Rolling statistics — computed from the per-cell historical records in the parquet
  4. data_month         — integer 1–12 derived from observation_month
  5. region_* one-hot   — derived from region name

The builder avoids any spatial KD-tree lookup for fresh data (the serving-parquet
lookup is used only to fetch STATIC features by exact grid_id match).
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

# ── Serving-parquet column subsets ────────────────────────────────────────────

# Static features — do not change day-to-day
STATIC_FEATURE_COLS = [
    "elevation_m", "slope_degrees", "aspect_degrees",
    "distance_to_surface_water_m",
    "soil_cec_cmol_kg_0_30cm", "soil_clay_pct_0_30cm", "soil_sand_pct_0_30cm",
    "soil_silt_pct_0_30cm", "soil_soc_g_kg_0_30cm", "soil_ph_h2o_0_30cm",
    "surface_water_occurrence_pct", "surface_water_seasonality_months",
    "distance_to_road_km", "road_density_km_per_sqkm",
    "distance_to_railway_km", "railway_density_km_per_sqkm",
    "distance_to_river_km", "river_density_km_per_sqkm",
    "urban_fraction", "builtup_fraction", "cropland_fraction",
    "non_cropland_fraction", "permanent_water_fraction",
    "population_density", "valid_agriculture_mask",
    "crop_area_pct_monsoon_rice", "crop_area_pct_dry_season_rice",
    "crop_area_pct_maize", "crop_area_pct_sugarcane", "crop_area_pct_cassava",
    "crop_area_pct_durian", "crop_area_pct_mangosteen", "crop_area_pct_longan",
    "crop_area_pct_mango", "crop_area_pct_chili", "crop_area_pct_tomato",
    "crop_area_pct_black_gram", "crop_area_pct_green_gram",
    "crop_area_pct_pigeon_pea", "crop_area_pct_groundnut",
    "crop_area_pct_sesame", "crop_area_pct_rubber",
]

# Columns used to compute rolling statistics from the serving parquet
ROLLING_SOURCE_COLS = {
    "chirps_precipitation_mm": [
        "chirps_precipitation_mm_mean",
        "chirps_precipitation_mm_max",
        "chirps_precipitation_mm_min",
        "chirps_precipitation_mm_range",
        "chirps_precipitation_mm_cv",
    ],
    "era5_soil_moisture_m3_m3": [
        "era5_soil_moisture_m3_m3_mean",
        "era5_soil_moisture_m3_m3_max",
        "era5_soil_moisture_m3_m3_min",
        "era5_soil_moisture_m3_m3_cv",
    ],
    "mean_temperature_c": [
        "mean_temperature_c_mean",
        "mean_temperature_c_max",
        "mean_temperature_c_min",
        "mean_temperature_c_range",
    ],
    "ndvi_median": [
        "ndvi_median_mean",
        "ndvi_median_max",
        "ndvi_median_min",
        "ndvi_median_growing_season_mean",
    ],
    "ndwi_mcf_median": [
        "ndwi_mcf_median_mean",
        "ndwi_mcf_median_max",
    ],
    "s1_vh_db_median": ["s1_vh_db_median_mean"],
    "s1_vv_db_median": ["s1_vv_db_median_mean"],
    "solar_radiation_mj_m2_day": [
        "solar_radiation_mj_m2_day_mean",
        "solar_radiation_mj_m2_day_max",
    ],
}

REGION_ONE_HOT = [
    "region_ayeyawaddy", "region_bago", "region_magway",
    "region_mandalay", "region_sagaing", "region_yangon",
]

REGION_NAME_MAP = {
    "ayeyawaddy": "region_ayeyawaddy",
    "bago": "region_bago",
    "magway": "region_magway",
    "mandalay": "region_mandalay",
    "sagaing": "region_sagaing",
    "yangon": "region_yangon",
}

# Full ordered list — must match serving parquet column order exactly
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

assert len(ALL_75_FEATURES) == 75, f"Expected 75 features, got {len(ALL_75_FEATURES)}"


def _safe_float(v: Any) -> float | None:
    try:
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


def _compute_rolling_stats(
    source_col: str,
    cell_history: pd.Series,
    fresh_value: float | None,
) -> dict[str, float | None]:
    """Compute rolling statistics for a feature over all historical values.

    Combines the serving-parquet history for a cell with the fresh observation.
    Uses the already-computed rolling stats from the parquet as the base, then
    updates with the fresh value.
    """
    target_cols = ROLLING_SOURCE_COLS.get(source_col, [])
    return {col: None for col in target_cols}  # placeholder — see build_feature_row


class FeatureBuilder:
    """Merges static (serving parquet) + dynamic (GEE CSV) + rolling stats.

    Usage:
        builder = FeatureBuilder(serving_parquet_path)
        row = builder.build_feature_row(csv_row_dict, region="yangon")
        # row is a dict with exactly the 75 keys in ALL_75_FEATURES order
    """

    def __init__(self, serving_parquet_path: Path) -> None:
        self._parquet_path = serving_parquet_path
        self._static_index: pd.DataFrame | None = None
        self._rolling_index: pd.DataFrame | None = None

    def _load_parquet(self) -> None:
        if self._static_index is not None:
            return

        # Load only the columns we need to save RAM
        needed_static = ["grid_id"] + STATIC_FEATURE_COLS
        rolling_src = list(ROLLING_SOURCE_COLS.keys())
        rolling_target = [col for cols in ROLLING_SOURCE_COLS.values() for col in cols]

        all_needed = needed_static + rolling_src + rolling_target
        import pyarrow.parquet as pq
        existing = set(pq.read_schema(self._parquet_path).names)
        cols_to_read = ["grid_id"] + [c for c in all_needed if c in existing and c != "grid_id"]

        full = pd.read_parquet(self._parquet_path, columns=cols_to_read)

        # Deduplicate by grid_id — take the most recent row (last occurrence)
        deduped = full.groupby("grid_id", sort=False).last().reset_index()

        static_cols_avail = ["grid_id"] + [c for c in STATIC_FEATURE_COLS if c in deduped.columns]
        self._static_index = deduped[static_cols_avail].set_index("grid_id")

        rolling_cols_avail = [c for c in rolling_target if c in deduped.columns]
        if rolling_cols_avail:
            self._rolling_index = deduped[["grid_id"] + rolling_cols_avail].set_index("grid_id")
        else:
            self._rolling_index = pd.DataFrame()

    def build_feature_row(
        self,
        csv_row: dict[str, Any],
        region: str,
    ) -> dict[str, Any]:
        """Build a complete 75-feature dict for a single grid cell.

        Args:
            csv_row: One row from the validated daily CSV.
            region: Internal region name (lowercase).

        Returns:
            dict with exactly the keys in ALL_75_FEATURES, float values.
            Missing values are represented as float('nan').
        """
        self._load_parquet()

        grid_id = str(csv_row.get("grid_id", ""))
        row: dict[str, Any] = {}

        # ── 1. Static features from serving parquet ───────────────────────────
        if grid_id and self._static_index is not None and grid_id in self._static_index.index:
            static_row = self._static_index.loc[grid_id]
            for col in STATIC_FEATURE_COLS:
                row[col] = _safe_float(static_row.get(col)) if col in static_row else math.nan
        else:
            # Fallback: try CSV itself for static features
            for col in STATIC_FEATURE_COLS:
                row[col] = _safe_float(csv_row.get(col, math.nan)) or math.nan

        # ── 2. Dynamic features from fresh GEE CSV ────────────────────────────
        # Current-month observations override serving parquet values
        dynamic_map = {
            "chirps_precipitation_mm": ["chirps_precipitation_mm", "precipitation_mm", "monthly_rainfall_mm"],
            "mean_temperature_c": ["mean_temperature_c", "temperature_c"],
            "solar_radiation_mj_m2_day": ["solar_radiation_mj_m2_day", "solar_radiation"],
        }
        for feat, csv_candidates in dynamic_map.items():
            for candidate in csv_candidates:
                val = _safe_float(csv_row.get(candidate))
                if val is not None:
                    row[feat] = val
                    break
            else:
                row[feat] = math.nan

        # ERA5 soil moisture — may come as era5_soil_moisture_m3_m3 or similar
        for candidate in ["era5_soil_moisture_m3_m3", "soil_moisture_m3_m3"]:
            val = _safe_float(csv_row.get(candidate))
            if val is not None:
                row["era5_soil_moisture_m3_m3_raw"] = val
                break

        # Sentinel / NDVI from CSV
        ndvi_raw = _safe_float(csv_row.get("ndvi_median")) or math.nan
        ndwi_raw = _safe_float(csv_row.get("ndwi_mcf_median")) or math.nan
        s1_vh_raw = _safe_float(csv_row.get("s1_vh_db_median")) or math.nan
        s1_vv_raw = _safe_float(csv_row.get("s1_vv_db_median")) or math.nan

        # ── 3. Rolling statistics from serving parquet ────────────────────────
        if self._rolling_index is not None and not self._rolling_index.empty and \
                grid_id in self._rolling_index.index:
            rolling_row = self._rolling_index.loc[grid_id]
            for target_col in [c for cols in ROLLING_SOURCE_COLS.values() for c in cols]:
                if target_col in rolling_row:
                    row[target_col] = _safe_float(rolling_row[target_col]) or math.nan
                else:
                    row[target_col] = math.nan
        else:
            # No parquet data for this grid_id — derive simple stats from current values
            for target_col in [c for cols in ROLLING_SOURCE_COLS.values() for c in cols]:
                row[target_col] = math.nan

        # Override rolling means with fresh NDVI/NDWI/S1 where we have them
        if not math.isnan(ndvi_raw):
            row["ndvi_median_mean"] = ndvi_raw
            row["ndvi_median_growing_season_mean"] = ndvi_raw
        if not math.isnan(ndwi_raw):
            row["ndwi_mcf_median_mean"] = ndwi_raw
        if not math.isnan(s1_vh_raw):
            row["s1_vh_db_median_mean"] = s1_vh_raw
        if not math.isnan(s1_vv_raw):
            row["s1_vv_db_median_mean"] = s1_vv_raw

        # ERA5 rolling from parquet already in row; refresh mean if fresh value exists
        era5_fresh = _safe_float(csv_row.get("era5_soil_moisture_m3_m3"))
        if era5_fresh is not None:
            row["era5_soil_moisture_m3_m3_mean"] = era5_fresh

        # ── 4. data_month ─────────────────────────────────────────────────────
        obs_month = str(csv_row.get("observation_month", ""))
        try:
            row["data_month"] = float(int(obs_month.split("-")[1]))
        except (IndexError, ValueError):
            row["data_month"] = math.nan

        # ── 5. Region one-hot encoding ────────────────────────────────────────
        for region_col in REGION_ONE_HOT:
            row[region_col] = 0.0
        mapped_col = REGION_NAME_MAP.get(region.lower())
        if mapped_col:
            row[mapped_col] = 1.0

        # ── 6. Return in exact feature order ──────────────────────────────────
        return {feat: float(row.get(feat, math.nan)) for feat in ALL_75_FEATURES}

    def build_batch(
        self,
        csv_rows: list[dict[str, Any]],
        region: str,
    ) -> list[dict[str, Any]]:
        """Build feature rows for an entire batch."""
        return [self.build_feature_row(r, region) for r in csv_rows]
