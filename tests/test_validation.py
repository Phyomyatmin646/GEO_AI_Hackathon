from __future__ import annotations

import json

import pandas as pd

from myanmar_agri_geo.schema import MONTHLY_FEATURE_COLUMNS, STATIC_FEATURE_COLUMNS
from myanmar_agri_geo.validation import validate_dataset, write_qa_report


def _valid_frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "grid_id": ["MMR_0001", "MMR_0002"],
            "year_month": ["2018-01", "2025-12"],
            "longitude": [96.10, 96.70],
            "latitude": [16.80, 21.20],
            "soil_ph_h2o_0_30cm": [6.2, 6.8],
            "monthly_rainfall_mm": [40.0, 120.0],
            "annual_rainfall_mm": [1_500.0, 2_100.0],
            "solar_radiation_mj_m2_day": [16.5, 19.2],
            "era5_soil_moisture_m3_m3": [0.22, 0.30],
            "source_versions_json": ['{"chirps":"v3","sentinel2":"harmonized"}'] * 2,
            "processing_timestamp_utc": ["2026-07-27T00:00:00Z"] * 2,
            "suitability_score__monsoon_rice": [80.0, 55.0],
            "is_suitable__monsoon_rice": [True, False],
            "label_source__monsoon_rice": ["rule_based", "rule_based"],
            "label_confidence__monsoon_rice": [0.45, 0.45],
        }
    )


def _check(report: dict, name: str) -> dict:
    return next(check for check in report["checks"] if check["name"] == name)


def test_validation_report_is_json_safe_for_valid_core_data() -> None:
    report = validate_dataset(
        _valid_frame(), expected_crops=("monsoon_rice",), strict_schema=False
    )

    assert report["valid"] is True
    assert report["errors"] == []
    assert _check(report, "coordinate_myanmar_bbox")["status"] == "pass"
    assert _check(report, "suitability_threshold_consistency__monsoon_rice")["status"] == "pass"
    json.dumps(report, allow_nan=False)


def test_validation_catches_duplicate_geo_and_label_failures() -> None:
    frame = _valid_frame()
    frame.loc[1, "grid_id"] = "MMR_0001"
    frame.loc[1, "year_month"] = "2018-01"
    frame.loc[1, "longitude"] = 120.0
    frame.loc[1, "soil_ph_h2o_0_30cm"] = 15.0
    frame.loc[1, "is_suitable__monsoon_rice"] = True

    report = validate_dataset(frame, expected_crops=("monsoon_rice",), strict_schema=False)

    assert report["valid"] is False
    assert _check(report, "unique_grid_month_key")["status"] == "fail"
    assert _check(report, "coordinate_myanmar_bbox")["status"] == "fail"
    assert _check(report, "range__soil_pH__soil_ph_h2o_0_30cm")["status"] == "fail"
    assert _check(report, "suitability_threshold_consistency__monsoon_rice")["status"] == "fail"


def test_missingness_release_gate_rejects_an_all_null_feature_row() -> None:
    """A non-empty schema must not make an unusable row look clean."""

    frame = _valid_frame()
    for column in STATIC_FEATURE_COLUMNS + MONTHLY_FEATURE_COLUMNS:
        frame[column] = pd.NA
    frame["feature_missing_fraction"] = 1.0
    frame["usable_for_training"] = False

    report = validate_dataset(
        frame,
        expected_crops=("monsoon_rice",),
        strict_schema=False,
        max_feature_missing_fraction=0.35,
    )

    assert report["valid"] is False
    assert _check(report, "feature_missing_fraction_release_gate")["status"] == "fail"
    assert _check(report, "usable_for_training_consistent")["status"] == "pass"


def test_write_qa_report_emits_strict_json(tmp_path) -> None:
    report = validate_dataset(
        _valid_frame(), expected_crops=("monsoon_rice",), strict_schema=False
    )
    destination = write_qa_report(report, tmp_path / "qa_report.json")

    loaded = json.loads(destination.read_text(encoding="utf-8"))
    assert loaded["valid"] is True
    assert loaded["summary"]["row_count"] == 2
