"""Leakage-resistant spatial/temporal split-manifest utilities."""

from __future__ import annotations

import hashlib

import pandas as pd


def _stable_fold(value: str, folds: int) -> int:
    digest = hashlib.sha256(value.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % folds


def add_split_manifest_columns(
    frame: pd.DataFrame,
    *,
    holdout_year: int = 2025,
    folds: int = 5,
    block_degrees: float = 0.5,
) -> pd.DataFrame:
    """Add spatial blocks and temporal holdout assignments to a copy of ``frame``.

    Rows from the holdout year are never assigned to a spatial CV training fold.
    Earlier rows in the same geographic block receive the same deterministic fold.
    """

    if folds < 2:
        raise ValueError("folds must be at least 2")
    required = {"longitude", "latitude", "year_month"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Cannot make split manifest; missing {sorted(missing)}")
    output = frame.copy()
    x = (output["longitude"].astype(float) // block_degrees).astype("Int64")
    y = (output["latitude"].astype(float) // block_degrees).astype("Int64")
    output["spatial_block_id"] = "MMR_" + x.astype(str) + "_" + y.astype(str)
    output["spatial_cv_fold"] = output["spatial_block_id"].map(lambda value: _stable_fold(value, folds)).astype("Int64")
    years = output["year_month"].astype(str).str.slice(0, 4).astype(int)
    output["split_role"] = "spatial_cv"
    output.loc[years >= holdout_year, "split_role"] = "temporal_holdout"
    output.loc[years >= holdout_year, "spatial_cv_fold"] = pd.NA
    return output


def split_manifest(frame: pd.DataFrame) -> pd.DataFrame:
    """Return one split record per cell/month rather than model feature columns."""

    columns = ["grid_id", "year_month", "spatial_block_id", "spatial_cv_fold", "split_role"]
    missing = set(columns).difference(frame.columns)
    if missing:
        raise ValueError(f"Missing split columns: {sorted(missing)}")
    return frame.loc[:, columns].drop_duplicates().sort_values(["year_month", "grid_id"]).reset_index(drop=True)
