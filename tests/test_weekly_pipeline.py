"""Focused weekly window, feature-contract, alignment, and ingest tests."""
from __future__ import annotations

import csv
import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

from myanmar_agri_geo.weekly.feature_builder import (
    ALL_75_FEATURES,
    FEATURE_SCHEMA_SHA256,
    MODEL_INPUT_SCHEMA_SHA256,
    VALIDATED_WEEKLY_COLUMNS,
    FeatureBuilder,
    FeatureContractError,
)
from myanmar_agri_geo.weekly.validator import validate_region_csv
from myanmar_agri_geo.weekly.window import (
    build_coverage_metadata,
    observation_month_for_week,
    parse_week_start,
)
from scripts.run_weekly_predictions import BackendSubmissionError, run_predictions
import scripts.run_weekly_pipeline as weekly_pipeline
import scripts.run_weekly_predictions as weekly_predictions


def _feature_values(
    *,
    elevation: float,
    month: int,
    region: str = "yangon",
    aggregate_ndvi: float = 0.42,
) -> dict[str, float]:
    values = {name: 1.0 for name in ALL_75_FEATURES}
    values.update(
        {
            "elevation_m": elevation,
            "slope_degrees": 2.0,
            "soil_ph_h2o_0_30cm": 6.5,
            "surface_water_occurrence_pct": 10.0,
            "chirps_precipitation_mm": 100.0,
            "mean_temperature_c": 27.0,
            "solar_radiation_mj_m2_day": 18.0,
            "ndvi_median_mean": aggregate_ndvi,
            "data_month": float(month),
        }
    )
    for name in ALL_75_FEATURES[-6:]:
        values[name] = 0.0
    values[f"region_{region}"] = 1.0
    return {name: values[name] for name in ALL_75_FEATURES}


def _write_aligned_artifacts(
    tmp_path: Path,
    *,
    rows: list[tuple[str, str, str, dict[str, float]]] | None = None,
) -> tuple[Path, Path]:
    rows = rows or [
        ("mm_1847_432__2026-07", "mm_1847_432", "2026-07", _feature_values(elevation=15, month=7))
    ]
    feature_path = tmp_path / "features_serving.parquet"
    spatial_path = tmp_path / "spatial_index.parquet"
    pd.DataFrame([item[3] for item in rows], columns=ALL_75_FEATURES).to_parquet(
        feature_path, index=False
    )
    pd.DataFrame(
        [
            {
                "sample_id": sample_id,
                "grid_id": grid_id,
                "year_month": year_month,
                "region": "yangon",
                "longitude": 95.73900015607856,
                "latitude": 17.20167696904894,
            }
            for sample_id, grid_id, year_month, _ in rows
        ]
    ).to_parquet(spatial_path, index=False)
    return feature_path, spatial_path


def _raw_row(*, partial_days: int = 7) -> dict[str, Any]:
    dates = [date(2026, 8, 3).fromordinal(date(2026, 8, 3).toordinal() + offset).isoformat()
             for offset in range(partial_days)]
    coverage = build_coverage_metadata(
        "2026-08-03",
        {
            "chirps": dates,
            "era5": dates,
            "sentinel_1": dates[:2],
            "sentinel_2": dates[:1],
        },
    )
    return {
        "grid_id": "mm_1847_432",
        "latitude": 17.2,
        "longitude": 95.7,
        "region": "yangon",
        "week_start": coverage["week_start"],
        "week_end": coverage["week_end"],
        "observation_month": "2026-08",
        "observation_days": coverage["observation_days"],
        "expected_days": coverage["expected_days"],
        "coverage_ratio": coverage["coverage_ratio"],
        "is_partial_week": coverage["is_partial_week"],
        "source_coverage_json": json.dumps(coverage["source_coverage"]),
        "source_observation_dates_json": json.dumps(coverage["source_observation_dates"]),
        "source_dates_used_json": json.dumps(
            {
                "chirps_month_refresh": dates,
                "era5_month_refresh": dates,
                "sentinel_1_lookback": dates[:2],
                "sentinel_2_lookback": dates[:1],
            }
        ),
        "chirps_precipitation_mm": 55.0,
        "mean_temperature_c": 28.0,
        "solar_radiation_mj_m2_day": 20.0,
        # These fresh observations are raw-only and must never replace the
        # aligned monthly aggregate fields.
        "weekly_ndvi_median": 0.99,
        "ndvi_median": 0.98,
        "era5_soil_moisture_m3_m3": 0.31,
    }


@pytest.mark.parametrize(
    ("start", "expected_end"),
    [
        ("2026-08-03", "2026-08-10"),
        ("2026-08-31", "2026-09-07"),
        ("2025-12-29", "2026-01-05"),
        ("2024-02-26", "2024-03-04"),
    ],
)
def test_week_window_is_monday_to_next_monday(start: str, expected_end: str) -> None:
    window = parse_week_start(start)
    assert window.start.weekday() == 0
    assert window.end.isoformat() == expected_end
    assert window.contains(window.end - pd.Timedelta(days=1))
    assert not window.contains(window.end)


def test_week_window_rejects_non_monday() -> None:
    with pytest.raises(ValueError, match="Monday"):
        parse_week_start("2026-08-09")


def test_production_pipeline_requires_all_six_regions(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="complete six-region manifest"):
        weekly_pipeline.run_pipeline(
            "2026-08-03",
            ["yangon"],
            skip_gee=True,
            data_dir=tmp_path,
        )


def test_week_window_uses_asia_yangon_midnight() -> None:
    window = parse_week_start("2026-08-03")
    assert window.start_at.isoformat() == "2026-08-03T00:00:00+06:30"
    assert window.end_at.isoformat() == "2026-08-10T00:00:00+06:30"


def test_cross_month_week_uses_month_of_last_included_day() -> None:
    assert observation_month_for_week("2026-08-31") == "2026-09"
    assert observation_month_for_week("2025-12-29") == "2026-01"


@pytest.mark.parametrize("days", [0, 1, 7])
def test_partial_week_and_source_coverage_is_explicit(days: int) -> None:
    observed = [
        date(2026, 8, 3).fromordinal(date(2026, 8, 3).toordinal() + offset)
        for offset in range(days)
    ]
    metadata = build_coverage_metadata(
        "2026-08-03",
        {"chirps": observed, "era5": observed, "sentinel_1": observed[:1], "sentinel_2": []},
    )
    assert metadata["observation_days"] == days
    assert metadata["coverage_ratio"] == round(days / 7, 6)
    assert metadata["is_partial_week"] is (days < 7)
    assert metadata["source_coverage"]["sentinel_2"] == 0.0


def test_required_daily_coverage_counts_only_intersecting_dates() -> None:
    metadata = build_coverage_metadata(
        "2026-08-03",
        {
            "chirps": ["2026-08-03", "2026-08-04"],
            "era5": ["2026-08-04", "2026-08-05"],
            "sentinel_1": [],
            "sentinel_2": [],
        },
    )

    assert metadata["observation_days"] == 1
    assert metadata["coverage_ratio"] == pytest.approx(1 / 7, abs=1e-6)


def test_exact_order_and_schema_checksum_regression() -> None:
    assert len(ALL_75_FEATURES) == 75
    assert FEATURE_SCHEMA_SHA256 == MODEL_INPUT_SCHEMA_SHA256
    assert hashlib.sha256(
        json.dumps(ALL_75_FEATURES, separators=(",", ":")).encode()
    ).hexdigest() == "35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8"


def test_builder_uses_latest_row_alignment_and_canonical_grid(tmp_path: Path) -> None:
    feature_path, spatial_path = _write_aligned_artifacts(
        tmp_path,
        rows=[
            (
                "mm_1847_432__2026-06", "mm_1847_432", "2026-06",
                _feature_values(elevation=10, month=6, aggregate_ndvi=0.25),
            ),
            (
                "mm_1847_432__2026-07", "mm_1847_432", "2026-07",
                _feature_values(elevation=15, month=7, aggregate_ndvi=0.42),
            ),
        ],
    )
    builder = FeatureBuilder(feature_path, spatial_path)
    built = builder.build_validated_row(_raw_row(), "yangon")

    assert list(built) == VALIDATED_WEEKLY_COLUMNS
    assert list(built)[-75:] == ALL_75_FEATURES
    assert built["grid_id"] == "mm_1847_432"
    assert built["serving_sample_id"] == "mm_1847_432__2026-07"
    assert built["latitude"] == pytest.approx(17.20167696904894)
    assert built["elevation_m"] == 15.0
    assert built["chirps_precipitation_mm"] == 55.0
    assert built["data_month"] == 8.0
    assert built["ndvi_median_mean"] == pytest.approx(0.42)

    with pytest.raises(FeatureContractError, match="not canonical"):
        builder.build_feature_row(_raw_row() | {"grid_id": "1847,432"}, "yangon")
    with pytest.raises(FeatureContractError, match="not present"):
        builder.build_feature_row(_raw_row() | {"grid_id": "mm_9999_9999"}, "yangon")


def test_missing_or_nonfinite_feature_fails_closed(tmp_path: Path) -> None:
    bad = _feature_values(elevation=15, month=7)
    bad["surface_water_seasonality_months"] = float("nan")
    feature_path, spatial_path = _write_aligned_artifacts(
        tmp_path,
        rows=[("mm_1847_432__2026-07", "mm_1847_432", "2026-07", bad)],
    )
    builder = FeatureBuilder(feature_path, spatial_path)
    with pytest.raises(FeatureContractError, match="surface_water_seasonality_months"):
        builder.build_feature_row(_raw_row(), "yangon")


def test_validator_writes_identity_then_exact_75_features(tmp_path: Path) -> None:
    feature_path, spatial_path = _write_aligned_artifacts(tmp_path)
    raw_path = tmp_path / "raw.csv"
    validated_path = tmp_path / "validated.csv"
    rejected_path = tmp_path / "rejected.csv"
    pd.DataFrame([_raw_row(partial_days=1)]).to_csv(raw_path, index=False)

    report = validate_region_csv(
        raw_path,
        validated_path,
        rejected_path,
        "yangon",
        "2026-08-03",
        FeatureBuilder(feature_path, spatial_path),
    )
    assert report.valid_rows == 1
    assert report.rejected_rows == 0
    with validated_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        assert reader.fieldnames == VALIDATED_WEEKLY_COLUMNS
        row = next(reader)
    assert row["is_partial_week"] == "True"
    assert float(row["coverage_ratio"]) == pytest.approx(1 / 7, abs=1e-6)


def _validated_week_dir(tmp_path: Path) -> Path:
    feature_path, spatial_path = _write_aligned_artifacts(tmp_path)
    week_dir = tmp_path / "weekly" / "2026-08-03"
    raw_path = week_dir / "raw" / "yangon.csv"
    raw_path.parent.mkdir(parents=True)
    pd.DataFrame([_raw_row()]).to_csv(raw_path, index=False)
    validate_region_csv(
        raw_path,
        week_dir / "validated" / "yangon.csv",
        week_dir / "rejected" / "yangon_rejected.csv",
        "yangon",
        "2026-08-03",
        FeatureBuilder(feature_path, spatial_path),
    )
    return tmp_path / "weekly"


def test_backend_submission_uses_internal_contract(tmp_path: Path) -> None:
    data_dir = _validated_week_dir(tmp_path)
    captured: dict[str, Any] = {}

    def fake_post(url: str, body: bytes, headers: dict[str, str], timeout: float) -> bytes:
        captured.update(url=url, payload=json.loads(body), headers=headers, timeout=timeout)
        return json.dumps(
            {
                "run_id": "run-1",
                "status": "succeeded",
                "week_start": "2026-08-03",
                "week_end": "2026-08-10",
                "model_catalog_version": "catalog-v1",
                "schema_version": "weekly-model-input-v1",
                "flagged_models_enabled": False,
                "crop_predictions_available": False,
                "regions": [{"region": "yangon", "status": "succeeded", "cell_count": 1}],
            }
        ).encode()

    result = run_predictions(
        "2026-08-03",
        ["yangon"],
        data_dir=data_dir,
        backend_url="http://backend.test:8000",
        internal_api_key="internal-secret",
        http_post=fake_post,
    )
    assert result["run_id"] == "run-1"
    assert captured["url"] == "http://backend.test:8000/api/v1/internal/weekly/ingest"
    assert captured["headers"]["X-Internal-API-Key"] == "internal-secret"
    assert captured["payload"]["schema_checksum"] == MODEL_INPUT_SCHEMA_SHA256
    submitted = captured["payload"]["regions"][0]
    assert set(submitted) == {"region", "row_count", "source_sha256", "coverage_metadata"}
    assert "csv_path" not in submitted
    assert len(submitted["source_sha256"]) == 64


def test_dry_run_makes_no_backend_call(tmp_path: Path) -> None:
    data_dir = _validated_week_dir(tmp_path)

    def forbidden(*args: Any, **kwargs: Any) -> bytes:
        raise AssertionError("dry-run attempted an HTTP request")

    result = run_predictions(
        "2026-08-03",
        ["yangon"],
        dry_run=True,
        data_dir=data_dir,
        internal_api_key="",
        http_post=forbidden,
    )
    assert result["dry_run"] is True


def test_resume_revalidates_and_uses_backend_idempotency(tmp_path: Path) -> None:
    data_dir = _validated_week_dir(tmp_path)
    saved = data_dir / "2026-08-03" / "predictions" / "backend_ingest_response.json"
    saved.parent.mkdir(parents=True)
    saved.write_text("stale local response", encoding="utf-8")
    calls = 0

    def fake_post(url: str, body: bytes, headers: dict[str, str], timeout: float) -> bytes:
        nonlocal calls
        calls += 1
        return json.dumps(
            {
                "run_id": "run-1",
                "status": "succeeded",
                "week_start": "2026-08-03",
                "week_end": "2026-08-10",
                "model_catalog_version": "catalog-v1",
                "schema_version": "weekly-model-input-v1",
                "flagged_models_enabled": False,
                "crop_predictions_available": False,
                "regions": [
                    {"region": "yangon", "status": "succeeded", "cell_count": 1}
                ],
            }
        ).encode()

    result = run_predictions(
        "2026-08-03",
        ["yangon"],
        resume=True,
        data_dir=data_dir,
        backend_url="http://backend.test:8000",
        internal_api_key="internal-secret",
        http_post=fake_post,
    )

    assert calls == 1
    assert result["run_id"] == "run-1"
    assert json.loads(saved.read_text(encoding="utf-8"))["run_id"] == "run-1"


def test_submission_rejects_backend_region_omission(tmp_path: Path) -> None:
    data_dir = _validated_week_dir(tmp_path)

    def incomplete_post(*args: Any, **kwargs: Any) -> bytes:
        return json.dumps(
            {
                "run_id": "run-1",
                "status": "succeeded",
                "week_start": "2026-08-03",
                "week_end": "2026-08-10",
                "model_catalog_version": "catalog-v1",
                "schema_version": "weekly-model-input-v1",
                "flagged_models_enabled": False,
                "crop_predictions_available": False,
                "regions": [],
            }
        ).encode()

    with pytest.raises(BackendSubmissionError, match="regions do not match"):
        run_predictions(
            "2026-08-03",
            ["yangon"],
            data_dir=data_dir,
            backend_url="http://backend.test:8000",
            internal_api_key="internal-secret",
            http_post=incomplete_post,
        )


@pytest.mark.parametrize("backend_status", ["partially_succeeded", "failed"])
def test_pipeline_propagates_unsuccessful_backend_status(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    backend_status: str,
) -> None:
    monkeypatch.setattr(
        weekly_pipeline,
        "validate_all_regions",
        lambda *args, **kwargs: {"invalid_regions": []},
    )
    monkeypatch.setattr(
        weekly_predictions,
        "run_predictions",
        lambda *args, **kwargs: {"status": backend_status},
    )

    result = weekly_pipeline.run_pipeline(
        "2026-08-03",
        sorted(weekly_pipeline.VALID_REGIONS),
        skip_gee=True,
        data_dir=tmp_path,
    )

    assert result["status"] == backend_status
    assert result["stages"]["backend_ingest"]["status"] == backend_status
    assert result["stages"]["backend_ingest"]["transport_status"] == "succeeded"


def test_real_serving_artifacts_schema_and_known_null_blocker() -> None:
    pytest.importorskip("pyarrow.parquet")
    import pyarrow.parquet as pq

    model_data = Path("/Users/phyomyatmin/Desktop/GEO_MODEL_SERVER/data/processed")
    feature_path = model_data / "features_serving.parquet"
    spatial_path = model_data / "spatial_index.parquet"
    if not feature_path.is_file() or not spatial_path.is_file():
        pytest.skip("audited GEO_MODEL_SERVER artifacts are not mounted")

    feature_file = pq.ParquetFile(feature_path)
    spatial_file = pq.ParquetFile(spatial_path)
    assert feature_file.schema_arrow.names == ALL_75_FEATURES
    assert feature_file.metadata.num_rows == spatial_file.metadata.num_rows == 1_029_348
    seasonality = pq.read_table(
        feature_path, columns=["surface_water_seasonality_months"]
    ).column(0)
    # Operational validation must stop here rather than silently substitute 0.
    assert seasonality.null_count == feature_file.metadata.num_rows


def test_submission_rejects_noncanonical_region(tmp_path: Path) -> None:
    with pytest.raises(BackendSubmissionError, match="canonical"):
        run_predictions("2026-08-03", ["Ayeyarwady"], dry_run=True, data_dir=tmp_path)
