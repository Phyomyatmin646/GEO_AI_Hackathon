"""Manual smoke check for the row-aligned weekly feature builder."""

from src.myanmar_agri_geo.weekly.feature_builder import FeatureBuilder, FeatureContractError

try:
    print(
        FeatureBuilder().build_feature_row(
            {
                "grid_id": "mm_1847_432",
                "observation_month": "2026-08",
                "chirps_precipitation_mm": 55,
                "mean_temperature_c": 28,
                "solar_radiation_mj_m2_day": 20,
            },
            "yangon",
        )
    )
except FeatureContractError as exc:
    print(f"Weekly feature contract stopped safely: {exc}")
