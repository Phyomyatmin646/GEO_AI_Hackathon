from __future__ import annotations

import pandas as pd
import pytest

from myanmar_agri_geo.observed_labels import (
    OBSERVED_LABEL_COLUMNS,
    validate_observed_labels_frame,
    write_observed_label_template,
)


def _valid_row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "observation_id": "OBS-2024-0001",
        "grid_id": "mm_1839_396",
        "year_month": "2024-07",
        "crop_id": "monsoon_rice",
        "longitude": 95.324433,
        "latitude": 15.731919,
        "observed_crop_present": True,
        "observed_suitability_score": 86.0,
        "observed_yield_t_ha": 4.3,
        "planting_date": "2024-06-10",
        "harvest_date": "2024-11-15",
        "source_type": "ground_survey",
        "source_org": "Myanmar pilot field team",
        "source_reference": "field-batch-2024-07-A",
        "reviewer_role": "agronomist",
        "review_status": "approved",
        "consent_or_public_basis": "informed_consent",
        "location_precision_m": 300,
        "is_synthetic": False,
        "notes": "No personal identifiers retained.",
    }
    row.update(overrides)
    return row


def test_valid_real_observation_is_accepted_and_receives_spatial_split() -> None:
    accepted, rejected, report = validate_observed_labels_frame(
        pd.DataFrame([_valid_row()])
    )

    assert rejected.empty
    assert report["valid"] is True
    assert report["synthetic_rows_accepted"] == 0
    assert accepted.loc[0, "label_source"] == "observed_reviewed"
    assert accepted.loc[0, "split_role"] == "spatial_cv"
    assert pd.notna(accepted.loc[0, "spatial_cv_fold"])


def test_2025_is_locked_to_temporal_holdout() -> None:
    accepted, rejected, _ = validate_observed_labels_frame(
        pd.DataFrame(
            [
                _valid_row(
                    observation_id="OBS-2025-0001",
                    year_month="2025-07",
                    planting_date="2025-06-10",
                    harvest_date="2025-11-15",
                )
            ]
        )
    )

    assert rejected.empty
    assert accepted.loc[0, "split_role"] == "temporal_holdout"
    assert pd.isna(accepted.loc[0, "spatial_cv_fold"])


def test_synthetic_or_unreviewed_rows_are_rejected() -> None:
    _, rejected, report = validate_observed_labels_frame(
        pd.DataFrame(
            [
                _valid_row(is_synthetic=True),
                _valid_row(
                    observation_id="OBS-2024-0002",
                    grid_id="mm_1840_396",
                    review_status="pending",
                ),
            ]
        )
    )

    assert len(rejected) == 2
    assert report["accepted_rows"] == 0
    assert report["rejection_reason_counts"]["synthetic_record_forbidden"] == 1
    assert report["rejection_reason_counts"]["review_not_approved"] == 1


def test_direct_personal_identifier_columns_stop_validation() -> None:
    row = _valid_row()
    row["phone_number"] = "+95..."
    with pytest.raises(ValueError, match="personal identifiers"):
        validate_observed_labels_frame(pd.DataFrame([row]))


def test_template_is_empty_and_contains_full_contract(tmp_path) -> None:
    path = write_observed_label_template(tmp_path / "observed.csv")
    template = pd.read_csv(path)
    assert template.empty
    assert tuple(template.columns) == OBSERVED_LABEL_COLUMNS
