"""Production gates for real, reviewed Myanmar crop observations.

This module never creates crop observations.  It validates records supplied by
field teams, public official registers, or permitted data-sharing partners and
keeps rejected rows out of training/calibration inputs.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd

from .crop_profiles import CROP_IDS
from .manifest import write_json
from .splits import add_split_manifest_columns


OBSERVED_LABEL_COLUMNS = (
    "observation_id",
    "grid_id",
    "year_month",
    "crop_id",
    "longitude",
    "latitude",
    "observed_crop_present",
    "observed_suitability_score",
    "observed_yield_t_ha",
    "planting_date",
    "harvest_date",
    "source_type",
    "source_org",
    "source_reference",
    "reviewer_role",
    "review_status",
    "consent_or_public_basis",
    "location_precision_m",
    "is_synthetic",
    "notes",
)

REQUIRED_OBSERVED_LABEL_COLUMNS = {
    "observation_id",
    "grid_id",
    "year_month",
    "crop_id",
    "longitude",
    "latitude",
    "source_type",
    "source_org",
    "source_reference",
    "reviewer_role",
    "review_status",
    "consent_or_public_basis",
    "location_precision_m",
    "is_synthetic",
}

OUTCOME_COLUMNS = {
    "observed_crop_present",
    "observed_suitability_score",
    "observed_yield_t_ha",
    "planting_date",
    "harvest_date",
}

ALLOWED_SOURCE_TYPES = {
    "ground_survey",
    "field_observation",
    "official_registry",
    "agronomist_reviewed_record",
}
ALLOWED_REVIEWER_ROLES = {
    "agronomist",
    "extension_officer",
    "crop_scientist",
    "data_steward",
}
ALLOWED_REVIEW_STATUSES = {"approved"}
ALLOWED_LEGAL_BASES = {
    "informed_consent",
    "public_official_record",
    "data_sharing_agreement",
    "research_approval",
}
PROHIBITED_PII_COLUMNS = {
    "farmer_name",
    "farmer_id",
    "phone",
    "phone_number",
    "email",
    "national_id",
    "nrc",
    "household_id",
}


def write_observed_label_template(path: str | Path) -> Path:
    """Write an empty, machine-readable CSV contract without fake examples."""

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(columns=OBSERVED_LABEL_COLUMNS).to_csv(destination, index=False)
    return destination


def _text(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip()


def _normalised_choice(series: pd.Series) -> pd.Series:
    return _text(series).str.lower().str.replace(r"[\s-]+", "_", regex=True)


def _parse_boolean(series: pd.Series) -> tuple[pd.Series, pd.Series]:
    values = _normalised_choice(series)
    truthy = values.isin({"1", "true", "yes", "y"})
    falsy = values.isin({"0", "false", "no", "n"})
    blank = values.eq("")
    parsed = pd.Series(pd.NA, index=series.index, dtype="boolean")
    parsed.loc[truthy] = True
    parsed.loc[falsy] = False
    invalid = ~(truthy | falsy | blank)
    return parsed, invalid


def _counts(series: pd.Series) -> dict[str, int]:
    return {
        str(key): int(value)
        for key, value in series.fillna("<missing>").astype(str).value_counts().items()
    }


def validate_observed_labels_frame(
    frame: pd.DataFrame,
    *,
    crops: Iterable[str] = CROP_IDS,
    start_year_month: str = "2018-01",
    end_year_month: str = "2025-12",
    holdout_year: int = 2025,
    folds: int = 5,
    block_degrees: float = 0.5,
    min_latitude: float = 9.0,
    max_latitude: float = 29.0,
    min_longitude: float = 92.0,
    max_longitude: float = 102.0,
    max_location_precision_m: float = 5_000.0,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Return accepted rows, rejected rows, and an audit-safe QA report.

    A row is accepted only when it is non-synthetic, source-backed, explicitly
    approved by an eligible reviewer, privacy-safe, inside Myanmar bounds, and
    contains at least one real observed outcome or crop-stage date.
    """

    supplied_columns = {str(column) for column in frame.columns}
    missing = REQUIRED_OBSERVED_LABEL_COLUMNS.difference(supplied_columns)
    if missing:
        raise ValueError(
            "Observed-label schema is incomplete; missing "
            f"{sorted(missing)}"
        )
    if not OUTCOME_COLUMNS.intersection(supplied_columns):
        raise ValueError(
            "Observed labels require at least one outcome column from "
            f"{sorted(OUTCOME_COLUMNS)}"
        )
    pii = {column for column in supplied_columns if column.lower() in PROHIBITED_PII_COLUMNS}
    if pii:
        raise ValueError(
            "Remove direct personal identifiers before validation; prohibited "
            f"columns: {sorted(pii)}"
        )

    work = frame.copy().reset_index(drop=True)
    for column in OBSERVED_LABEL_COLUMNS:
        if column not in work:
            work[column] = pd.NA

    reasons: list[list[str]] = [[] for _ in range(len(work))]

    def reject(mask: pd.Series | np.ndarray, code: str) -> None:
        values = np.asarray(mask, dtype=bool)
        for position in np.flatnonzero(values):
            reasons[int(position)].append(code)

    for column in ("observation_id", "grid_id", "year_month", "crop_id"):
        work[column] = _text(work[column])
        reject(work[column].eq(""), f"missing_{column}")

    work["crop_id"] = _normalised_choice(work["crop_id"])
    allowed_crops = {str(crop) for crop in crops}
    reject(~work["crop_id"].isin(allowed_crops), "unknown_crop_id")

    valid_month_format = work["year_month"].str.fullmatch(r"\d{4}-(0[1-9]|1[0-2])")
    reject(~valid_month_format.fillna(False), "invalid_year_month")
    in_period = work["year_month"].between(start_year_month, end_year_month)
    reject(valid_month_format.fillna(False) & ~in_period, "outside_project_period")

    work["longitude"] = pd.to_numeric(work["longitude"], errors="coerce")
    work["latitude"] = pd.to_numeric(work["latitude"], errors="coerce")
    reject(work["longitude"].isna(), "invalid_longitude")
    reject(work["latitude"].isna(), "invalid_latitude")
    reject(
        work["longitude"].notna()
        & ~work["longitude"].between(min_longitude, max_longitude),
        "outside_myanmar_longitude_bounds",
    )
    reject(
        work["latitude"].notna()
        & ~work["latitude"].between(min_latitude, max_latitude),
        "outside_myanmar_latitude_bounds",
    )

    present, invalid_present = _parse_boolean(work["observed_crop_present"])
    work["observed_crop_present"] = present
    reject(invalid_present, "invalid_observed_crop_present")

    work["observed_suitability_score"] = pd.to_numeric(
        work["observed_suitability_score"], errors="coerce"
    )
    raw_score_present = _text(frame.get("observed_suitability_score", pd.Series("", index=work.index))).ne("")
    reject(
        raw_score_present & work["observed_suitability_score"].isna(),
        "invalid_observed_suitability_score",
    )
    reject(
        work["observed_suitability_score"].notna()
        & ~work["observed_suitability_score"].between(0, 100),
        "observed_suitability_score_out_of_range",
    )

    work["observed_yield_t_ha"] = pd.to_numeric(
        work["observed_yield_t_ha"], errors="coerce"
    )
    raw_yield_present = _text(frame.get("observed_yield_t_ha", pd.Series("", index=work.index))).ne("")
    reject(
        raw_yield_present & work["observed_yield_t_ha"].isna(),
        "invalid_observed_yield_t_ha",
    )
    reject(
        work["observed_yield_t_ha"].notna()
        & ~work["observed_yield_t_ha"].between(0, 250),
        "observed_yield_t_ha_out_of_range",
    )

    planting_text = _text(work["planting_date"])
    harvest_text = _text(work["harvest_date"])
    planting = pd.to_datetime(planting_text, format="%Y-%m-%d", errors="coerce")
    harvest = pd.to_datetime(harvest_text, format="%Y-%m-%d", errors="coerce")
    reject(planting_text.ne("") & planting.isna(), "invalid_planting_date")
    reject(harvest_text.ne("") & harvest.isna(), "invalid_harvest_date")
    reject(planting.notna() & harvest.notna() & (planting > harvest), "planting_after_harvest")
    work["planting_date"] = planting.dt.strftime("%Y-%m-%d")
    work["harvest_date"] = harvest.dt.strftime("%Y-%m-%d")

    has_outcome = (
        work["observed_crop_present"].notna()
        | work["observed_suitability_score"].notna()
        | work["observed_yield_t_ha"].notna()
        | planting.notna()
        | harvest.notna()
    )
    reject(~has_outcome, "missing_observed_outcome")

    for column in (
        "source_type",
        "reviewer_role",
        "review_status",
        "consent_or_public_basis",
    ):
        work[column] = _normalised_choice(work[column])
    reject(~work["source_type"].isin(ALLOWED_SOURCE_TYPES), "unapproved_source_type")
    reject(~work["reviewer_role"].isin(ALLOWED_REVIEWER_ROLES), "unapproved_reviewer_role")
    reject(~work["review_status"].isin(ALLOWED_REVIEW_STATUSES), "review_not_approved")
    reject(
        ~work["consent_or_public_basis"].isin(ALLOWED_LEGAL_BASES),
        "missing_consent_or_public_basis",
    )

    for column in ("source_org", "source_reference"):
        work[column] = _text(work[column])
        reject(work[column].eq(""), f"missing_{column}")

    work["location_precision_m"] = pd.to_numeric(
        work["location_precision_m"], errors="coerce"
    )
    reject(work["location_precision_m"].isna(), "invalid_location_precision_m")
    reject(
        work["location_precision_m"].notna()
        & ~work["location_precision_m"].between(0, max_location_precision_m),
        "location_precision_too_coarse",
    )

    synthetic, invalid_synthetic = _parse_boolean(work["is_synthetic"])
    work["is_synthetic"] = synthetic
    reject(invalid_synthetic | synthetic.isna(), "invalid_is_synthetic")
    reject(synthetic.fillna(True), "synthetic_record_forbidden")

    duplicate_observation = work["observation_id"].ne("") & work["observation_id"].duplicated(
        keep=False
    )
    reject(duplicate_observation, "duplicate_observation_id")
    duplicate_label = work.duplicated(["grid_id", "year_month", "crop_id"], keep=False)
    reject(duplicate_label, "duplicate_grid_month_crop")

    work["rejection_reasons"] = ["|".join(values) for values in reasons]
    rejected = work.loc[work["rejection_reasons"].ne("")].copy()
    accepted = work.loc[work["rejection_reasons"].eq("")].drop(
        columns=["rejection_reasons"]
    )

    if not accepted.empty:
        accepted = add_split_manifest_columns(
            accepted,
            holdout_year=holdout_year,
            folds=folds,
            block_degrees=block_degrees,
        )
        accepted["label_source"] = "observed_reviewed"
        accepted["observed_score"] = accepted["observed_suitability_score"]
        fallback_score = accepted["observed_crop_present"].map(
            {True: 100.0, False: 0.0}
        )
        accepted["observed_score"] = accepted["observed_score"].fillna(fallback_score)
        accepted["training_target_available"] = (
            accepted["observed_score"].notna()
            | accepted["observed_yield_t_ha"].notna()
        )

    reason_counts = Counter(
        reason
        for row_reasons in reasons
        for reason in row_reasons
    )
    report: dict[str, Any] = {
        "contract": "myanmar_observed_crop_labels_v1",
        "valid": bool(len(accepted) > 0 and len(rejected) == 0),
        "input_rows": int(len(work)),
        "accepted_rows": int(len(accepted)),
        "rejected_rows": int(len(rejected)),
        "rejection_reason_counts": dict(sorted(reason_counts.items())),
        "synthetic_rows_accepted": 0,
        "holdout_year": int(holdout_year),
        "spatial_folds": int(folds),
        "spatial_block_degrees": float(block_degrees),
        "privacy": {
            "direct_personal_identifier_columns_present": False,
            "maximum_location_precision_m": float(max_location_precision_m),
        },
        "accepted_by_crop": _counts(accepted["crop_id"]) if not accepted.empty else {},
        "accepted_by_source_type": (
            _counts(accepted["source_type"]) if not accepted.empty else {}
        ),
        "accepted_by_split_role": (
            _counts(accepted["split_role"]) if not accepted.empty else {}
        ),
    }
    return accepted.reset_index(drop=True), rejected.reset_index(drop=True), report


def validate_observed_label_file(
    input_path: str | Path,
    *,
    accepted_path: str | Path,
    rejected_path: str | Path,
    report_path: str | Path,
    **kwargs: Any,
) -> dict[str, Any]:
    """Validate one CSV and persist accepted, rejected, and JSON QA artifacts."""

    source = Path(input_path)
    if not source.is_file():
        raise FileNotFoundError(f"Observed-label file does not exist: {source}")
    frame = pd.read_csv(source)
    accepted, rejected, report = validate_observed_labels_frame(frame, **kwargs)

    accepted_destination = Path(accepted_path)
    rejected_destination = Path(rejected_path)
    accepted_destination.parent.mkdir(parents=True, exist_ok=True)
    rejected_destination.parent.mkdir(parents=True, exist_ok=True)
    accepted.to_csv(accepted_destination, index=False)
    rejected.to_csv(rejected_destination, index=False)
    write_json(Path(report_path), report)
    return report
