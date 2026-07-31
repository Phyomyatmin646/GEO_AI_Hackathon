import os
import csv
import pytest
from myanmar_agri_geo.flood_impact_labels import (
    validate_row,
    generate_template,
    process_csv,
    ALL_FIELDS
)

def test_generate_template(tmp_path):
    output_dir = tmp_path / "flood_impact"
    generate_template(str(output_dir))
    
    csv_file = output_dir / "flood_impact_template.csv"
    assert csv_file.exists()
    
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        headers = next(reader)
        assert headers == ALL_FIELDS


def test_valid_row():
    row = {
        "observation_id": "1234",
        "observation_date": "2026-07-31",
        "crop_type": "rice",
        "latitude": "16.8",
        "longitude": "96.1",
        "flood_event_observed": "true",
        "storm_event_observed": "false",
        "flood_duration_days": "3",
        "extreme_weather_type": "river_flood",
        "primary_damage_mechanism": "flooding",
        "crop_damage_percent": "50"
    }
    res = validate_row(row)
    assert res.status == "validated"


def test_rejected_row_missing_required():
    row = {
        "observation_id": "", # missing
        "observation_date": "2026-07-31",
        "crop_type": "rice",
        "latitude": "16.8",
        "longitude": "96.1"
    }
    res = validate_row(row)
    assert res.status == "rejected"
    assert any("Missing required field: observation_id" in e for e in res.errors)


def test_quarantine_row_event_mismatch():
    row = {
        "observation_id": "1234",
        "observation_date": "2026-07-31",
        "crop_type": "rice",
        "latitude": "16.8",
        "longitude": "96.1",
        "flood_event_observed": "false",
        "storm_event_observed": "false",
        "extreme_weather_type": "cyclone", # this is a mismatch
    }
    res = validate_row(row)
    assert res.status == "quarantine"
    assert any("event_flag_mismatch" in w for w in res.warnings)


def test_rejected_invalid_boolean():
    row = {
        "observation_id": "1234",
        "observation_date": "2026-07-31",
        "crop_type": "rice",
        "latitude": "16.8",
        "longitude": "96.1",
        "flood_event_observed": "maybe"
    }
    res = validate_row(row)
    assert res.status == "rejected"
    assert any("Invalid boolean for flood_event_observed" in e for e in res.errors)

def test_flood_duration_null_warning():
    row = {
        "observation_id": "1234",
        "observation_date": "2026-07-31",
        "crop_type": "rice",
        "latitude": "16.8",
        "longitude": "96.1",
        "flood_event_observed": "true",
        "extreme_weather_type": "river_flood",
        "flood_duration_days": ""
    }
    res = validate_row(row)
    # Should not be rejected, just warning
    # Wait, missing extreme_weather_type? Included it.
    assert "duration_unknown" in res.warnings
    assert res.status != "rejected"

def test_gps_outside_myanmar():
    row = {
        "observation_id": "1234",
        "observation_date": "2026-07-31",
        "crop_type": "rice",
        "latitude": "35.0", # Way outside Myanmar
        "longitude": "100.0",
    }
    res = validate_row(row)
    assert res.status == "quarantine"
    assert "outside_myanmar" in res.warnings
