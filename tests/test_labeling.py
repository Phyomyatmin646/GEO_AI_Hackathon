from __future__ import annotations

import pandas as pd

from myanmar_agri_geo.crop_profiles import CROP_IDS
from myanmar_agri_geo.labeling import add_rule_based_labels, calibrate_with_observed_labels


def _features() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "grid_id": ["MMR_A"],
            "year_month": ["2022-06"],
            "mean_temperature_c": [27.0],
            "monthly_rainfall_mm": [150.0],
            "annual_rainfall_mm": [1900.0],
            "soil_ph_h2o_0_30cm": [6.0],
            "slope_degrees": [2.0],
            "solar_radiation_mj_m2_day": [18.0],
            "water_availability_score": [75.0],
        }
    )


def test_rule_labels_cover_each_configured_crop_without_fabricating_observations() -> None:
    output = add_rule_based_labels(_features(), crops=list(CROP_IDS))
    for crop in CROP_IDS:
        assert output.loc[0, f"label_source__{crop}"] == "rule_based"
        assert output.loc[0, f"label_confidence__{crop}"] <= 0.45
        assert 0 <= output.loc[0, f"suitability_score__{crop}"] <= 100


def test_observed_calibration_updates_only_the_matching_crop_and_row(tmp_path) -> None:
    labeled = add_rule_based_labels(_features(), crops=["durian", "mango"])
    observed_path = tmp_path / "observed.csv"
    pd.DataFrame(
        {
            "observation_id": ["OBS-001"],
            "grid_id": ["MMR_A"],
            "year_month": ["2022-06"],
            "crop_id": ["durian"],
            "longitude": [96.1],
            "latitude": [18.2],
            "observed_crop_present": [True],
            "observed_suitability_score": [100.0],
            "observed_yield_t_ha": [8.5],
            "planting_date": ["2022-05-01"],
            "harvest_date": ["2022-10-01"],
            "source_type": ["ground_survey"],
            "source_org": ["Pilot field team"],
            "source_reference": ["survey-batch-2022-06"],
            "reviewer_role": ["agronomist"],
            "review_status": ["approved"],
            "consent_or_public_basis": ["informed_consent"],
            "location_precision_m": [250],
            "is_synthetic": [False],
        }
    ).to_csv(observed_path, index=False)
    output = calibrate_with_observed_labels(
        labeled,
        observed_path,
        crops=["durian", "mango"],
        suitability_threshold=70.0,
        calibration_weight=0.35,
        observed_confidence=0.85,
    )
    assert output.loc[0, "label_source__durian"] == "hybrid_rule_observed"
    assert output.loc[0, "label_source__mango"] == "rule_based"
