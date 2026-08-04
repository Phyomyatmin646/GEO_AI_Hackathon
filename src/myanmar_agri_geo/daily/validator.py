"""Daily CSV validator for the Myanmar Agricultural Geo-CSV Pipeline.

Validates raw GEE-export CSVs before they are fed into batch model inference.
Produces validated/, rejected/ outputs and a validation_report.json.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd

# Myanmar approximate bounding box
MYANMAR_LAT_MIN, MYANMAR_LAT_MAX = 9.5, 28.6
MYANMAR_LON_MIN, MYANMAR_LON_MAX = 92.0, 101.2

VALID_REGIONS = frozenset(
    {"yangon", "bago", "mandalay", "sagaing", "magway", "ayeyawaddy"}
)

# Columns every daily CSV must have
REQUIRED_IDENTITY_COLS = [
    "grid_id",
    "latitude",
    "longitude",
    "region",
    "observation_date",
    "observation_month",
]

# Model features required for inference (no NaN allowed unless noted)
REQUIRED_FEATURE_COLS = [
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
    "chirps_precipitation_mm", "mean_temperature_c", "solar_radiation_mj_m2_day",
    # Rolling statistics (may come from serving parquet in feature_builder step)
    "chirps_precipitation_mm_mean", "mean_temperature_c_mean",
    "ndvi_median_mean", "solar_radiation_mj_m2_day_mean",
    "data_month",
]

# Acceptable ranges for sanity checks (min, max)
FEATURE_RANGES: dict[str, tuple[float, float]] = {
    "latitude": (MYANMAR_LAT_MIN, MYANMAR_LAT_MAX),
    "longitude": (MYANMAR_LON_MIN, MYANMAR_LON_MAX),
    "elevation_m": (-50, 6000),
    "slope_degrees": (0, 90),
    "chirps_precipitation_mm": (0, 1500),
    "mean_temperature_c": (-5, 50),
    "solar_radiation_mj_m2_day": (0, 35),
    "soil_ph_h2o_0_30cm": (2, 12),
    "surface_water_occurrence_pct": (0, 100),
    "data_month": (1, 12),
}

DATE_FMT = "%Y-%m-%d"
MONTH_FMT = "%Y-%m"


@dataclass
class ValidationReport:
    region: str
    input_rows: int = 0
    valid_rows: int = 0
    rejected_rows: int = 0
    rejection_reasons: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def record_rejection(self, reason: str) -> None:
        self.rejected_rows += 1
        self.rejection_reasons[reason] = self.rejection_reasons.get(reason, 0) + 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "region": self.region,
            "input_rows": self.input_rows,
            "valid_rows": self.valid_rows,
            "rejected_rows": self.rejected_rows,
            "acceptance_rate": round(
                self.valid_rows / self.input_rows if self.input_rows > 0 else 0, 4
            ),
            "rejection_reasons": self.rejection_reasons,
            "warnings": self.warnings,
        }


def validate_region_csv(
    input_path: Path,
    validated_path: Path,
    rejected_path: Path,
    region: str,
    allow_missing_rolling_stats: bool = True,
) -> ValidationReport:
    """Validate a single regional raw CSV.

    Args:
        input_path: Path to raw CSV from GEE export.
        validated_path: Output path for accepted rows.
        rejected_path: Output path for rejected rows (includes rejection_reason column).
        region: Internal region name (lowercase, e.g. 'yangon').
        allow_missing_rolling_stats: If True, rolling-stat columns may be absent
            (they'll be filled in by feature_builder from serving parquet).

    Returns:
        ValidationReport with counts and rejection details.
    """
    report = ValidationReport(region=region)

    if not input_path.exists():
        report.warnings.append(f"Input file not found: {input_path}")
        # Write empty validated/rejected files so downstream doesn't fail
        validated_path.parent.mkdir(parents=True, exist_ok=True)
        rejected_path.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame().to_csv(validated_path, index=False)
        pd.DataFrame(columns=["rejection_reason"]).to_csv(rejected_path, index=False)
        return report

    try:
        df = pd.read_csv(input_path, low_memory=False)
    except Exception as exc:
        report.warnings.append(f"Failed to parse CSV: {exc}")
        validated_path.parent.mkdir(parents=True, exist_ok=True)
        rejected_path.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame().to_csv(validated_path, index=False)
        pd.DataFrame(columns=["rejection_reason"]).to_csv(rejected_path, index=False)
        return report

    report.input_rows = len(df)
    rejection_reasons: list[str] = [""] * len(df)

    def _reject(mask: pd.Series, reason: str) -> None:
        for i in df[mask].index:
            if not rejection_reasons[i]:
                rejection_reasons[i] = reason
        report.record_rejection(reason)

    # ── 1. Required identity columns ─────────────────────────────────────────
    for col in REQUIRED_IDENTITY_COLS:
        if col not in df.columns:
            _reject(pd.Series([True] * len(df)), f"missing_column:{col}")

    # ── 2. Duplicate grid_id × observation_date ───────────────────────────────
    if "grid_id" in df.columns and "observation_date" in df.columns:
        dup_mask = df.duplicated(subset=["grid_id", "observation_date"], keep="first")
        _reject(dup_mask, "duplicate_grid_date")

    # ── 3. Region name ────────────────────────────────────────────────────────
    if "region" in df.columns:
        bad_region = ~df["region"].astype(str).str.lower().isin(VALID_REGIONS)
        _reject(bad_region, "invalid_region_name")

    # ── 4. Lat/lon bounds ─────────────────────────────────────────────────────
    if "latitude" in df.columns:
        bad_lat = (df["latitude"] < MYANMAR_LAT_MIN) | (df["latitude"] > MYANMAR_LAT_MAX)
        _reject(bad_lat.fillna(True), "latitude_out_of_bounds")

    if "longitude" in df.columns:
        bad_lon = (df["longitude"] < MYANMAR_LON_MIN) | (df["longitude"] > MYANMAR_LON_MAX)
        _reject(bad_lon.fillna(True), "longitude_out_of_bounds")

    # ── 5. Date format ────────────────────────────────────────────────────────
    if "observation_date" in df.columns:
        def _bad_date(d: Any) -> bool:
            try:
                datetime.strptime(str(d), DATE_FMT)
                return False
            except ValueError:
                return True
        bad_date = df["observation_date"].apply(_bad_date)
        _reject(bad_date, "invalid_observation_date_format")

    # ── 6. Feature range checks ───────────────────────────────────────────────
    for feat, (lo, hi) in FEATURE_RANGES.items():
        if feat in df.columns:
            numeric = pd.to_numeric(df[feat], errors="coerce")
            out_of_range = (numeric < lo) | (numeric > hi)
            _reject(out_of_range.fillna(False), f"out_of_range:{feat}")

    # ── 7. NaN / Inf in critical non-rolling features ─────────────────────────
    critical_cols = [
        c for c in REQUIRED_FEATURE_COLS
        if c in df.columns and c not in (
            "chirps_precipitation_mm_mean", "mean_temperature_c_mean",
            "ndvi_median_mean", "solar_radiation_mj_m2_day_mean", "data_month"
        )
    ]
    if critical_cols:
        bad_values = df[critical_cols].apply(
            lambda col: pd.to_numeric(col, errors="coerce")
            .apply(lambda v: math.isnan(v) or math.isinf(v) if isinstance(v, float) else False)
        ).any(axis=1)
        _reject(bad_values, "nan_or_inf_in_critical_feature")

    # ── Split valid / rejected ────────────────────────────────────────────────
    df["_rejection_reason"] = rejection_reasons
    accepted = df[df["_rejection_reason"] == ""].copy()
    rejected = df[df["_rejection_reason"] != ""].copy()

    accepted = accepted.drop(columns=["_rejection_reason"])
    rejected = rejected.rename(columns={"_rejection_reason": "rejection_reason"})

    report.valid_rows = len(accepted)
    # report.rejected_rows already summed by _reject() — reconcile
    report.rejected_rows = len(rejected)

    validated_path.parent.mkdir(parents=True, exist_ok=True)
    rejected_path.parent.mkdir(parents=True, exist_ok=True)
    validated_path.parent.mkdir(parents=True, exist_ok=True)
    rejected_path.parent.mkdir(parents=True, exist_ok=True)
    accepted.to_csv(validated_path, index=False)
    rejected.to_csv(rejected_path, index=False)

    return report


def validate_all_regions(
    date_str: str,
    base_dir: Path,
    regions: list[str],
    allow_missing_rolling_stats: bool = True,
) -> dict[str, Any]:
    """Validate all regional CSVs for a given date.

    Writes validated/, rejected/, and validation_report.json under base_dir/date_str/.
    Returns the full validation report dict.
    """
    date_dir = base_dir / date_str
    raw_dir = date_dir / "raw"
    validated_dir = date_dir / "validated"
    rejected_dir = date_dir / "rejected"

    all_reports: list[dict[str, Any]] = []
    total_valid = 0
    total_rejected = 0

    for region in regions:
        raw_path = raw_dir / f"{region}.csv"
        validated_path = validated_dir / f"{region}.csv"
        rejected_path = rejected_dir / f"{region}_rejected.csv"

        report = validate_region_csv(
            raw_path, validated_path, rejected_path, region,
            allow_missing_rolling_stats=allow_missing_rolling_stats,
        )
        all_reports.append(report.to_dict())
        total_valid += report.valid_rows
        total_rejected += report.rejected_rows

    summary = {
        "date": date_str,
        "validated_at": datetime.utcnow().isoformat() + "Z",
        "regions": all_reports,
        "totals": {
            "valid": total_valid,
            "rejected": total_rejected,
            "acceptance_rate": round(
                total_valid / (total_valid + total_rejected)
                if (total_valid + total_rejected) > 0 else 0,
                4,
            ),
        },
    }

    report_path = date_dir / "validation_report.json"
    date_dir.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary
