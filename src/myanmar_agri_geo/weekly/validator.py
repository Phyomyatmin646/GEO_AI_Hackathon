"""Fail-closed validation and construction of weekly regional model CSVs."""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .feature_builder import (
    ALL_75_FEATURES,
    VALIDATED_WEEKLY_COLUMNS,
    FeatureBuilder,
    FeatureContractError,
)
from .window import build_coverage_metadata, observation_month_for_week, parse_week_start

MYANMAR_LAT_MIN, MYANMAR_LAT_MAX = 9.5, 28.6
MYANMAR_LON_MIN, MYANMAR_LON_MAX = 92.0, 101.2

VALID_REGIONS = frozenset(
    {"yangon", "bago", "mandalay", "sagaing", "magway", "ayeyawaddy"}
)

REQUIRED_RAW_COLUMNS = [
    "grid_id",
    "region",
    "week_start",
    "week_end",
    "observation_month",
    "observation_days",
    "expected_days",
    "coverage_ratio",
    "is_partial_week",
    "source_coverage_json",
    "source_observation_dates_json",
    "source_dates_used_json",
    "chirps_precipitation_mm",
    "mean_temperature_c",
    "solar_radiation_mj_m2_day",
]

FEATURE_RANGES: dict[str, tuple[float, float]] = {
    "latitude": (MYANMAR_LAT_MIN, MYANMAR_LAT_MAX),
    "longitude": (MYANMAR_LON_MIN, MYANMAR_LON_MAX),
    "elevation_m": (-50, 6_000),
    "slope_degrees": (0, 90),
    "chirps_precipitation_mm": (0, 5_000),
    "mean_temperature_c": (-5, 50),
    "solar_radiation_mj_m2_day": (0, 50),
    "soil_ph_h2o_0_30cm": (2, 12),
    "surface_water_occurrence_pct": (0, 100),
    "data_month": (1, 12),
}


class WeeklyValidationError(ValueError):
    """Raised when an input artifact cannot be validated at all."""


@dataclass
class ValidationReport:
    region: str
    input_rows: int = 0
    valid_rows: int = 0
    rejected_rows: int = 0
    rejection_reasons: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    output_path: str | None = None

    def record_rejection(self, reason: str) -> None:
        self.rejection_reasons[reason] = self.rejection_reasons.get(reason, 0) + 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "region": self.region,
            "input_rows": self.input_rows,
            "valid_rows": self.valid_rows,
            "rejected_rows": self.rejected_rows,
            "acceptance_rate": round(
                self.valid_rows / self.input_rows if self.input_rows else 0.0, 6
            ),
            "rejection_reasons": dict(sorted(self.rejection_reasons.items())),
            "warnings": self.warnings,
            "output_path": self.output_path,
        }


def _coverage_from_row(row: dict[str, Any], week_start: str) -> dict[str, object]:
    try:
        dates = json.loads(str(row["source_observation_dates_json"]))
        stated_coverage = json.loads(str(row["source_coverage_json"]))
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise FeatureContractError("source coverage metadata is not valid JSON") from exc
    if not isinstance(dates, dict) or not isinstance(stated_coverage, dict):
        raise FeatureContractError("source coverage metadata must contain JSON objects")

    computed = build_coverage_metadata(week_start, dates)
    if computed["source_coverage"] != stated_coverage:
        raise FeatureContractError("source_coverage_json does not match real observation dates")
    comparisons = {
        "week_start": str(row.get("week_start", "")),
        "week_end": str(row.get("week_end", "")),
        "observation_days": int(float(row.get("observation_days"))),
        "expected_days": int(float(row.get("expected_days"))),
        "coverage_ratio": float(row.get("coverage_ratio")),
        "is_partial_week": str(row.get("is_partial_week", "")).lower() in {"true", "1"},
    }
    for key, value in comparisons.items():
        expected = computed[key]
        if isinstance(expected, float):
            if not math.isclose(float(value), expected, abs_tol=1e-6):
                raise FeatureContractError(f"{key} conflicts with source observation dates")
        elif value != expected:
            raise FeatureContractError(f"{key} conflicts with source observation dates")
    return computed


def _validate_built_row(row: dict[str, Any]) -> None:
    if list(row) != VALIDATED_WEEKLY_COLUMNS:
        raise FeatureContractError("validated row does not have identity + exact ordered 75 features")
    feature_values = np.asarray([row[name] for name in ALL_75_FEATURES], dtype=float)
    if not np.isfinite(feature_values).all():
        raise FeatureContractError("validated row contains missing or non-finite model features")
    for feature, (minimum, maximum) in FEATURE_RANGES.items():
        value = float(row[feature])
        if value < minimum or value > maximum:
            raise FeatureContractError(
                f"out_of_range:{feature} ({value} not in [{minimum}, {maximum}])"
            )


def validate_region_csv(
    input_path: Path,
    validated_path: Path,
    rejected_path: Path,
    region: str,
    week_start: str,
    feature_builder: FeatureBuilder,
    *,
    write_outputs: bool = True,
) -> ValidationReport:
    """Construct and validate one regional weekly model-input CSV."""

    normalized_region = region.strip().lower()
    if normalized_region not in VALID_REGIONS:
        raise WeeklyValidationError(f"unknown weekly region: {region!r}")
    window = parse_week_start(week_start)
    report = ValidationReport(region=normalized_region)

    if not input_path.is_file():
        raise WeeklyValidationError(f"raw weekly CSV not found: {input_path}")
    try:
        raw = pd.read_csv(input_path, low_memory=False, dtype={"grid_id": str})
    except Exception as exc:
        raise WeeklyValidationError(f"failed to parse {input_path}: {exc}") from exc
    if raw.empty:
        raise WeeklyValidationError(f"raw weekly CSV is empty: {input_path}")

    missing_columns = [name for name in REQUIRED_RAW_COLUMNS if name not in raw.columns]
    if missing_columns:
        raise WeeklyValidationError(f"raw weekly CSV is missing columns: {missing_columns}")

    report.input_rows = len(raw)
    duplicate_mask = raw.duplicated(["grid_id", "week_start"], keep=False)
    accepted_rows: list[dict[str, Any]] = []
    rejected_rows: list[dict[str, Any]] = []
    region_coverage_signature: str | None = None

    for position, series in raw.iterrows():
        source = series.to_dict()
        try:
            if bool(duplicate_mask.loc[position]):
                raise FeatureContractError("duplicate_grid_week")
            if str(source["region"]).strip().lower() != normalized_region:
                raise FeatureContractError("row region does not match regional file")
            if str(source["week_start"]) != window.start.isoformat():
                raise FeatureContractError("row week_start does not match requested week")
            if str(source["week_end"]) != window.end.isoformat():
                raise FeatureContractError("row week_end is not the next Monday")
            expected_observation_month = observation_month_for_week(window.start)
            if str(source["observation_month"]) != expected_observation_month:
                raise FeatureContractError(
                    "observation_month must contain the interval's last included day"
                )

            coverage = _coverage_from_row(source, week_start)
            # Validate the separate source-use provenance as JSON. It may
            # include MTD and configured Sentinel lookback dates outside the
            # seven-day coverage interval.
            used_dates = json.loads(str(source["source_dates_used_json"]))
            if not isinstance(used_dates, dict):
                raise FeatureContractError("source_dates_used_json must be a JSON object")
            signature = json.dumps(coverage, sort_keys=True, separators=(",", ":"))
            if region_coverage_signature is None:
                region_coverage_signature = signature
            elif signature != region_coverage_signature:
                raise FeatureContractError("source coverage metadata is inconsistent within region")

            built = feature_builder.build_validated_row(source, normalized_region)
            _validate_built_row(built)
            accepted_rows.append(built)
        except (FeatureContractError, TypeError, ValueError, OverflowError) as exc:
            reason = str(exc) or exc.__class__.__name__
            report.record_rejection(reason)
            rejected_rows.append(source | {"rejection_reason": reason})

    report.valid_rows = len(accepted_rows)
    report.rejected_rows = len(rejected_rows)
    report.output_path = str(validated_path)

    if write_outputs:
        validated_path.parent.mkdir(parents=True, exist_ok=True)
        rejected_path.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(accepted_rows, columns=VALIDATED_WEEKLY_COLUMNS).to_csv(
            validated_path, index=False
        )
        rejected_columns = list(raw.columns) + ["rejection_reason"]
        pd.DataFrame(rejected_rows, columns=rejected_columns).to_csv(rejected_path, index=False)

    return report


def validate_all_regions(
    week_start: str,
    base_dir: Path,
    regions: list[str],
    feature_builder: FeatureBuilder,
    *,
    write_outputs: bool = True,
) -> dict[str, Any]:
    """Validate all requested regional files under ``data/weekly/<Monday>``."""

    window = parse_week_start(week_start)
    week_dir = Path(base_dir) / window.identifier
    raw_dir = week_dir / "raw"
    validated_dir = week_dir / "validated"
    rejected_dir = week_dir / "rejected"

    reports: list[dict[str, Any]] = []
    total_valid = 0
    total_rejected = 0
    missing_or_invalid_regions: list[str] = []
    for region in regions:
        try:
            report = validate_region_csv(
                raw_dir / f"{region}.csv",
                validated_dir / f"{region}.csv",
                rejected_dir / f"{region}_rejected.csv",
                region,
                week_start,
                feature_builder,
                write_outputs=write_outputs,
            )
        except WeeklyValidationError as exc:
            report = ValidationReport(region=region, warnings=[str(exc)])
            missing_or_invalid_regions.append(region)
        reports.append(report.to_dict())
        total_valid += report.valid_rows
        total_rejected += report.rejected_rows
        if report.valid_rows == 0 or report.rejected_rows > 0:
            if region not in missing_or_invalid_regions:
                missing_or_invalid_regions.append(region)

    summary = {
        "week_start": window.start.isoformat(),
        "week_end": window.end.isoformat(),
        "validated_at": datetime.now(UTC).isoformat(),
        "regions": reports,
        "invalid_regions": missing_or_invalid_regions,
        "totals": {
            "valid": total_valid,
            "rejected": total_rejected,
            "acceptance_rate": round(
                total_valid / (total_valid + total_rejected)
                if total_valid + total_rejected
                else 0.0,
                6,
            ),
        },
    }
    if write_outputs:
        week_dir.mkdir(parents=True, exist_ok=True)
        (week_dir / "validation_report.json").write_text(
            json.dumps(summary, indent=2), encoding="utf-8"
        )
    return summary
