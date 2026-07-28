"""Aggregate-only comparison against source-backed official crop statistics."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .crop_profiles import CROP_IDS
from .manifest import write_json


OFFICIAL_STATS_COLUMNS = (
    "admin1",
    "year",
    "crop_id",
    "official_crop_area_ha",
    "official_production_tonnes",
    "official_yield_t_ha",
    "source_org",
    "source_url",
    "retrieved_at",
    "notes",
)


def write_official_stats_template(path: str | Path) -> Path:
    """Write an empty aggregate side-table contract without fabricated rows."""

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(columns=OFFICIAL_STATS_COLUMNS).to_csv(destination, index=False)
    return destination


def _rank_correlation(x: pd.Series, y: pd.Series) -> float | None:
    pair = pd.DataFrame(
        {
            "x": pd.to_numeric(x, errors="coerce"),
            "y": pd.to_numeric(y, errors="coerce"),
        }
    ).dropna()
    if len(pair) < 3 or pair["x"].nunique() < 2 or pair["y"].nunique() < 2:
        return None
    value = pair["x"].rank(method="average").corr(pair["y"].rank(method="average"))
    return None if pd.isna(value) else round(float(value), 4)


def compare_official_statistics(
    predictions_path: str | Path,
    official_stats_path: str | Path,
    *,
    comparison_path: str | Path,
    report_path: str | Path,
) -> dict[str, Any]:
    """Compare admin/year/crop predictions with official aggregate statistics.

    Official statistics are evaluation-only.  This function writes a joined
    comparison side table and report; it never writes into the 5 km feature or
    observed-label tables.
    """

    predictions = pd.read_csv(predictions_path)
    official = pd.read_csv(official_stats_path)

    prediction_required = {"admin1", "crop_id", "predicted_crop_score"}
    if "year" not in predictions and "year_month" in predictions:
        predictions["year"] = predictions["year_month"].astype(str).str.slice(0, 4)
    missing_predictions = (prediction_required | {"year"}).difference(predictions.columns)
    if missing_predictions:
        raise ValueError(
            "Prediction comparison table is missing "
            f"{sorted(missing_predictions)}"
        )

    official_required = {
        "admin1",
        "year",
        "crop_id",
        "source_org",
        "source_url",
        "retrieved_at",
    }
    missing_official = official_required.difference(official.columns)
    if missing_official:
        raise ValueError(
            "Official-statistics table is missing "
            f"{sorted(missing_official)}"
        )
    metric_columns = {
        "official_crop_area_ha",
        "official_production_tonnes",
        "official_yield_t_ha",
    }
    if not metric_columns.intersection(official.columns):
        raise ValueError(
            "Official-statistics table needs at least one official area, "
            "production, or yield metric"
        )

    for frame in (predictions, official):
        frame["admin1"] = frame["admin1"].fillna("").astype(str).str.strip()
        frame["crop_id"] = (
            frame["crop_id"]
            .fillna("")
            .astype(str)
            .str.strip()
            .str.lower()
            .str.replace(r"[\s-]+", "_", regex=True)
        )
        frame["year"] = pd.to_numeric(frame["year"], errors="coerce").astype("Int64")
        frame["_admin1_key"] = frame["admin1"].str.casefold()

    unknown = set(official["crop_id"]).difference(CROP_IDS)
    if unknown:
        raise ValueError(f"Official statistics contain unknown crops: {sorted(unknown)}")
    if official["source_url"].fillna("").astype(str).str.strip().eq("").any():
        raise ValueError("Every official-statistics row needs source_url")
    if official["source_org"].fillna("").astype(str).str.strip().eq("").any():
        raise ValueError("Every official-statistics row needs source_org")

    keys = ["_admin1_key", "year", "crop_id"]
    if predictions.duplicated(keys).any():
        raise ValueError("Prediction comparison table has duplicate admin1/year/crop_id keys")
    if official.duplicated(keys).any():
        raise ValueError("Official-statistics table has duplicate admin1/year/crop_id keys")

    official_metrics = [
        column
        for column in (*metric_columns, "source_org", "source_url", "retrieved_at", "notes")
        if column in official.columns
    ]
    joined = predictions.merge(
        official.loc[:, keys + official_metrics],
        on=keys,
        how="left",
        validate="one_to_one",
        indicator=True,
    )
    matched = joined["_merge"].eq("both")

    per_crop: dict[str, Any] = {}
    for crop_id, group in joined.loc[matched].groupby("crop_id", sort=True):
        crop_report: dict[str, Any] = {"matched_rows": int(len(group))}
        if "official_crop_area_ha" in group:
            crop_report["score_vs_official_area_spearman"] = _rank_correlation(
                group["predicted_crop_score"], group["official_crop_area_ha"]
            )
        if (
            "predicted_yield_t_ha" in group
            and "official_yield_t_ha" in group
        ):
            crop_report["predicted_vs_official_yield_spearman"] = _rank_correlation(
                group["predicted_yield_t_ha"], group["official_yield_t_ha"]
            )
            pair = group[["predicted_yield_t_ha", "official_yield_t_ha"]].apply(
                pd.to_numeric, errors="coerce"
            ).dropna()
            crop_report["yield_mae_t_ha"] = (
                round(float(np.abs(pair.iloc[:, 0] - pair.iloc[:, 1]).mean()), 4)
                if not pair.empty
                else None
            )
        per_crop[str(crop_id)] = crop_report

    report: dict[str, Any] = {
        "contract": "myanmar_official_crop_statistics_comparison_v1",
        "valid": bool(matched.any()),
        "prediction_rows": int(len(predictions)),
        "official_rows": int(len(official)),
        "matched_rows": int(matched.sum()),
        "unmatched_prediction_rows": int((~matched).sum()),
        "match_fraction": round(float(matched.mean()), 4) if len(joined) else 0.0,
        "overall_score_vs_official_area_spearman": (
            _rank_correlation(
                joined.loc[matched, "predicted_crop_score"],
                joined.loc[matched, "official_crop_area_ha"],
            )
            if "official_crop_area_ha" in joined
            else None
        ),
        "per_crop": per_crop,
        "safety_note": (
            "Aggregate official statistics are evaluation-only and were not "
            "joined to 5 km model features or treated as observed grid labels."
        ),
    }

    comparison_destination = Path(comparison_path)
    comparison_destination.parent.mkdir(parents=True, exist_ok=True)
    joined.drop(columns=["_admin1_key", "_merge"]).to_csv(
        comparison_destination, index=False
    )
    write_json(Path(report_path), report)
    return report
