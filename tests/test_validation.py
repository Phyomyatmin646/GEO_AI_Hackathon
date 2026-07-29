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
        min_usable_row_fraction=0.95,
    )

    assert report["valid"] is False
    assert _check(report, "feature_missing_fraction_release_gate")["status"] == "warning"
    assert _check(report, "usable_row_fraction_release_gate")["status"] == "fail"
    assert _check(report, "usable_for_training_consistent")["status"] == "pass"


def test_small_unusable_subset_is_retained_when_dataset_coverage_passes() -> None:
    frame = pd.concat([_valid_frame()] * 50, ignore_index=True)
    frame["grid_id"] = [f"MMR_{index:04d}" for index in range(len(frame))]
    for column in STATIC_FEATURE_COLUMNS + MONTHLY_FEATURE_COLUMNS:
        if column not in frame:
            frame[column] = 1.0
        frame.loc[0, column] = pd.NA
    frame["feature_missing_fraction"] = frame[
        STATIC_FEATURE_COLUMNS + MONTHLY_FEATURE_COLUMNS
    ].isna().mean(axis=1).round(4)
    frame["usable_for_training"] = frame["feature_missing_fraction"] <= 0.35

    report = validate_dataset(
        frame,
        expected_crops=("monsoon_rice",),
        strict_schema=False,
        max_feature_missing_fraction=0.35,
        min_usable_row_fraction=0.95,
    )

    assert report["valid"] is True
    assert _check(report, "feature_missing_fraction_release_gate")["status"] == "warning"
    gate = _check(report, "usable_row_fraction_release_gate")
    assert gate["status"] == "pass"
    assert gate["details"]["usable_rows"] == 99


def test_climate_context_contract_checks_ranges_metadata_and_invariants() -> None:
    frame = _valid_frame()
    frame["mean_temperature_c"] = [27.0, 20.0]
    frame["rainfall_normal_1991_2020_mm"] = [50.0, 100.0]
    frame["rainfall_anomaly_1991_2020_mm"] = [-10.0, 20.0]
    frame["rainfall_anomaly_1991_2020_pct"] = [-20.0, 20.0]
    frame["temperature_normal_1991_2020_c"] = [26.0, 21.0]
    frame["temperature_anomaly_1991_2020_c"] = [1.0, -1.0]
    frame["climate_context_status"] = (
        "historical_same_month_normal_and_anomaly"
    )
    frame["climate_baseline_period"] = "1991-2020"
    frame["climate_context_interpretation"] = (
        "historical_context_not_attribution_forecast_or_projection"
    )

    report = validate_dataset(
        frame,
        expected_crops=("monsoon_rice",),
        strict_schema=False,
    )

    assert report["valid"] is True
    assert _check(report, "climate_rainfall_anomaly_invariant")["status"] == (
        "pass"
    )
    assert _check(report, "climate_temperature_anomaly_invariant")["status"] == (
        "pass"
    )
    assert _check(report, "climate_context_status_consistent")["status"] == (
        "pass"
    )

    frame.loc[0, "rainfall_anomaly_1991_2020_mm"] = 25.0
    inconsistent = validate_dataset(
        frame,
        expected_crops=("monsoon_rice",),
        strict_schema=False,
    )
    assert inconsistent["valid"] is False
    assert _check(
        inconsistent,
        "climate_rainfall_anomaly_invariant",
    )["status"] == "fail"


def test_partial_climate_context_column_set_fails_validation() -> None:
    frame = _valid_frame()
    frame["rainfall_normal_1991_2020_mm"] = [50.0, 100.0]

    report = validate_dataset(
        frame,
        expected_crops=("monsoon_rice",),
        strict_schema=False,
    )

    assert report["valid"] is False
    assert _check(report, "climate_context_complete_column_set")["status"] == (
        "fail"
    )


def test_required_climate_context_rejects_an_entirely_absent_column_set() -> None:
    report = validate_dataset(
        _valid_frame(),
        expected_crops=("monsoon_rice",),
        strict_schema=False,
        require_climate_context=True,
    )

    assert report["valid"] is False
    gate = _check(report, "climate_context_complete_column_set")
    assert gate["status"] == "fail"
    assert gate["invalid_count"] == 5
    assert len(gate["details"]["missing_columns"]) == 5
    assert report["configuration"]["require_climate_context"] is True


def test_required_climate_context_rejects_present_but_all_null_values() -> None:
    frame = _valid_frame()
    frame["mean_temperature_c"] = [27.0, 20.0]
    climate_columns = (
        "rainfall_normal_1991_2020_mm",
        "rainfall_anomaly_1991_2020_mm",
        "rainfall_anomaly_1991_2020_pct",
        "temperature_normal_1991_2020_c",
        "temperature_anomaly_1991_2020_c",
    )
    for column in climate_columns:
        frame[column] = pd.NA
    frame["climate_context_status"] = "incomplete_historical_context"
    frame["climate_baseline_period"] = "1991-2020"
    frame["climate_context_interpretation"] = (
        "historical_context_not_attribution_forecast_or_projection"
    )

    required = validate_dataset(
        frame,
        expected_crops=("monsoon_rice",),
        strict_schema=False,
        min_usable_row_fraction=0.50,
        require_climate_context=True,
    )

    assert required["valid"] is False
    assert _check(required, "climate_context_complete_column_set")[
        "status"
    ] == "pass"
    completeness = _check(
        required,
        "climate_context_complete_row_fraction",
    )
    assert completeness["status"] == "fail"
    assert completeness["details"] == {
        "complete_rows": 0,
        "total_rows": 2,
        "complete_fraction": 0.0,
        "minimum_complete_fraction": 0.95,
    }
    assert _check(required, "climate_rainfall_anomaly_invariant")[
        "details"
    ]["comparable_rows"] == 0
    assert _check(required, "climate_rainfall_anomaly_invariant")[
        "status"
    ] == "fail"
    assert _check(required, "climate_rainfall_anomaly_percentage_invariant")[
        "status"
    ] == "fail"
    assert _check(required, "climate_temperature_anomaly_invariant")[
        "status"
    ] == "fail"
    assert required["configuration"][
        "climate_context_min_complete_fraction"
    ] == 0.95

    legacy_optional = validate_dataset(
        frame,
        expected_crops=("monsoon_rice",),
        strict_schema=False,
        require_climate_context=False,
    )
    assert legacy_optional["valid"] is True
    assert not any(
        check["name"] == "climate_context_complete_row_fraction"
        for check in legacy_optional["checks"]
    )


def test_write_qa_report_emits_strict_json(tmp_path) -> None:
    report = validate_dataset(
        _valid_frame(), expected_crops=("monsoon_rice",), strict_schema=False
    )
    destination = write_qa_report(report, tmp_path / "qa_report.json")

    loaded = json.loads(destination.read_text(encoding="utf-8"))
    assert loaded["valid"] is True
    assert loaded["summary"]["row_count"] == 2
