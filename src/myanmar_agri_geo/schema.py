"""Stable output schema shared by export, assembly, and validation steps."""

from __future__ import annotations

from typing import Iterable


IDENTITY_COLUMNS = [
    "sample_id",
    "grid_id",
    "year_month",
    "longitude",
    "latitude",
    "admin0_name",
    "admin1_name",
    "admin2_name",
    "spatial_block_id",
]

STATIC_FEATURE_COLUMNS = [
    "elevation_m",
    "slope_degrees",
    "aspect_degrees",
    "surface_water_occurrence_pct",
    "distance_to_surface_water_m",
    "soil_ph_h2o_0_30cm",
    "soil_sand_pct_0_30cm",
    "soil_silt_pct_0_30cm",
    "soil_clay_pct_0_30cm",
    "soil_soc_g_kg_0_30cm",
    "soil_cec_cmol_kg_0_30cm",
    "soil_ph_h2o_uncertainty_pct",
]

MONTHLY_FEATURE_COLUMNS = [
    "ndvi_median",
    "ndwi_mcf_median",
    "ndmi_median",
    "s2_scene_count",
    "s2_valid_observation_count",
    "s2_cloudy_pixel_fraction",
    "s1_vv_db_median",
    "s1_vh_db_median",
    "s1_scene_count",
    "chirps_precipitation_mm",
    "monthly_rainfall_mm",
    "annual_rainfall_mm",
    "mean_temperature_c",
    "min_temperature_c",
    "max_temperature_c",
    "solar_radiation_mj_m2_day",
    "era5_soil_moisture_m3_m3",
    "water_availability_score",
]

QUALITY_COLUMNS = [
    "s2_data_status",
    "s1_data_status",
    "rainfall_data_status",
    "soil_data_status",
    "feature_missing_fraction",
    "usable_for_training",
    "source_versions_json",
    "processing_timestamp_utc",
]


def label_columns(crops: Iterable[str]) -> list[str]:
    """Return deterministic wide multi-label columns for the requested crops."""

    result: list[str] = []
    for crop in crops:
        result.extend(
            [
                f"suitability_score__{crop}",
                f"is_suitable__{crop}",
                f"label_source__{crop}",
                f"label_confidence__{crop}",
            ]
        )
    return result


def required_columns(crops: Iterable[str]) -> list[str]:
    """Return the full final dataset schema in its preferred order."""

    return IDENTITY_COLUMNS + STATIC_FEATURE_COLUMNS + MONTHLY_FEATURE_COLUMNS + QUALITY_COLUMNS + label_columns(crops)


def raw_gee_required_columns() -> list[str]:
    """The minimum values required from a completed GEE table export."""

    return ["grid_id", "year_month", "longitude", "latitude"]
