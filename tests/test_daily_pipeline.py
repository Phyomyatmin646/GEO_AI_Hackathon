"""Tests for the daily pipeline orchestrator, validation, and feature building."""
from __future__ import annotations

import json
from pathlib import Path
from unittest import mock

import pytest
import pandas as pd

from myanmar_agri_geo.daily.validator import validate_region_csv, ValidationReport
from myanmar_agri_geo.daily.feature_builder import FeatureBuilder, ALL_75_FEATURES

def test_daily_pipeline_validator_accepts_valid_rows(tmp_path):
    """Test that validator passes valid rows."""
    valid_csv = tmp_path / "raw.csv"
    val_out = tmp_path / "validated.csv"
    rej_out = tmp_path / "rejected.csv"
    
    # Create valid mock data
    pd.DataFrame([{
        "grid_id": "1818,402",
        "latitude": 16.5,
        "longitude": 96.0,
        "region": "yangon",
        "observation_date": "2026-08-03",
        "observation_month": "2026-08",
        "elevation_m": 15,
        "chirps_precipitation_mm": 50,
        "mean_temperature_c": 28,
        "solar_radiation_mj_m2_day": 20,
        "data_month": 8,
    }]).to_csv(valid_csv, index=False)

    report = validate_region_csv(valid_csv, val_out, rej_out, "yangon")
    
    assert report.input_rows == 1
    assert report.valid_rows == 1
    assert report.rejected_rows == 0
    
    df_val = pd.read_csv(val_out)
    assert len(df_val) == 1
    assert df_val.iloc[0]["grid_id"] == "1818,402"

def test_daily_pipeline_validator_rejects_missing_cols(tmp_path):
    """Test that validator rejects rows with missing required columns."""
    raw_csv = tmp_path / "raw.csv"
    val_out = tmp_path / "validated.csv"
    rej_out = tmp_path / "rejected.csv"
    
    pd.DataFrame([{
        "grid_id": "1818,402",
        "region": "yangon",
    }]).to_csv(raw_csv, index=False)

    report = validate_region_csv(raw_csv, val_out, rej_out, "yangon")
    
    assert report.input_rows == 1
    assert report.valid_rows == 0
    assert report.rejected_rows == 1
    assert "missing_column:latitude" in report.rejection_reasons

def test_feature_builder_initialization(tmp_path):
    """Test that FeatureBuilder builds exact 75 features."""
    # Create mock parquet
    parquet_path = tmp_path / "features_serving.parquet"
    pd.DataFrame({
        "grid_id": ["1818,402"],
        "elevation_m": [15],
        "crop_area_pct_monsoon_rice": [80],
        "chirps_precipitation_mm_mean": [40],
    }).to_parquet(parquet_path)
    
    builder = FeatureBuilder(parquet_path)
    row = builder.build_feature_row({
        "grid_id": "1818,402",
        "observation_month": "2026-08",
        "chirps_precipitation_mm": 55,
    }, "yangon")
    
    assert len(row) == 75
    assert list(row.keys()) == ALL_75_FEATURES
    assert row["elevation_m"] == 15.0
    assert row["crop_area_pct_monsoon_rice"] == 80.0
    assert row["chirps_precipitation_mm"] == 55.0
    assert row["region_yangon"] == 1.0
    assert row["data_month"] == 8.0
