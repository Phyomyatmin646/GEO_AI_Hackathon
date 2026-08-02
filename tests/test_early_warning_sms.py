import os
import json
import pytest
import datetime
from unittest.mock import patch, mock_open
from myanmar_agri_geo.early_warning_sms import (
    load_thresholds,
    evaluate_and_trigger,
    deduplicate_alert,
    broadcast_sms,
    format_message
)
from myanmar_agri_geo.cli import main

@pytest.fixture
def sample_thresholds():
    return {
        "rainfall_24h_watch_mm": 50,
        "rainfall_24h_warning_mm": 100,
        "wind_gust_watch_kmh": 60,
        "wind_gust_warning_kmh": 90,
        "forecast_probability_min": 70,
        "discharge_watch_m3s": 15000,
        "discharge_warning_m3s": 20000
    }

def test_1_forecast_high_rainfall_warning(sample_thresholds):
    forecast = {"status": "available", "rainfall_48h_mm": 110, "max_probability": 80, "max_wind_gust_kmh": 30}
    res = evaluate_and_trigger("test", forecast, {}, {}, False, sample_thresholds)
    assert res["severity"] == "WARNING"
    assert "high_rainfall_forecast" in res["reason"]

def test_2_forecast_strong_wind_storm(sample_thresholds):
    forecast = {"status": "available", "rainfall_48h_mm": 10, "max_probability": 90, "max_wind_gust_kmh": 100}
    res = evaluate_and_trigger("test", forecast, {}, {}, False, sample_thresholds)
    assert res["severity"] == "WARNING"
    assert "high_wind_forecast" in res["reason"]

def test_3_forecast_api_timeout(sample_thresholds):
    forecast = {"status": "data_unavailable"}
    res = evaluate_and_trigger("test", forecast, {}, {}, False, sample_thresholds)
    assert res["severity"] == "NORMAL"

def test_4_gee_output_stale(sample_thresholds):
    gee = {"status": "stale_data", "flood_detected": True}
    forecast = {"status": "data_unavailable"}
    res = evaluate_and_trigger("test", forecast, {}, gee, False, sample_thresholds)
    assert res["severity"] == "NORMAL"

def test_5_gee_incomplete_reduces_confidence(sample_thresholds):
    gee = {"status": "available", "flood_detected": False}
    forecast = {"status": "available", "rainfall_48h_mm": 60, "max_probability": 80, "max_wind_gust_kmh": 30}
    res = evaluate_and_trigger("test", forecast, {}, gee, False, sample_thresholds)
    assert res["severity"] == "WATCH"
    assert res["confidence"] == "medium"

def test_6_forecast_high_but_gee_normal(sample_thresholds):
    gee = {"status": "available", "flood_detected": False}
    forecast = {"status": "available", "rainfall_48h_mm": 120, "max_probability": 80, "max_wind_gust_kmh": 30}
    res = evaluate_and_trigger("test", forecast, {}, gee, False, sample_thresholds)
    assert res["severity"] == "WARNING"

def test_7_gee_flood_detected_but_forecast_low(sample_thresholds):
    gee = {"status": "available", "flood_detected": True}
    forecast = {"status": "available", "rainfall_48h_mm": 10, "max_probability": 20, "max_wind_gust_kmh": 10}
    res = evaluate_and_trigger("test", forecast, {}, gee, False, sample_thresholds)
    assert res["severity"] == "WARNING"
    assert "gee_observed_flooding" in res["reason"]

def test_8_dmh_official_warning_highest_priority(sample_thresholds):
    res = evaluate_and_trigger("test", {}, {}, {}, True, sample_thresholds)
    assert res["severity"] == "EMERGENCY"
    assert res["confidence"] == "official"

def test_9_same_alert_within_cooldown(tmp_path):
    history_file = tmp_path / "history.json"
    history = {
        "test_high_rainfall_forecast": {
            "region": "test",
            "reason": "high_rainfall_forecast",
            "severity": "WARNING",
            "timestamp": datetime.datetime.now().isoformat()
        }
    }
    history_file.write_text(json.dumps(history))
    
    new_alert = {
        "region": "test",
        "reason": "high_rainfall_forecast",
        "severity": "WARNING",
        "timestamp": datetime.datetime.now().isoformat()
    }
    should_send = deduplicate_alert(new_alert, str(history_file))
    assert not should_send

def test_10_severity_increases_escalation(tmp_path):
    history_file = tmp_path / "history.json"
    old_time = (datetime.datetime.now() - datetime.timedelta(hours=2)).isoformat()
    history = {
        "test_high_rainfall_forecast": {
            "region": "test",
            "reason": "high_rainfall_forecast",
            "severity": "WATCH",
            "timestamp": old_time
        }
    }
    history_file.write_text(json.dumps(history))
    
    new_alert = {
        "region": "test",
        "reason": "high_rainfall_forecast",
        "severity": "WARNING",
        "timestamp": datetime.datetime.now().isoformat()
    }
    should_send = deduplicate_alert(new_alert, str(history_file))
    assert should_send

def test_11_no_recipients_log_do_not_crash():
    res = broadcast_sms("Test", [], dry_run=True)
    assert not res

def test_12_sms_mock_fails_retry_log(tmp_path):
    # Mock builtins.open to fail the first time, but succeed the second time for the failure log
    with (
        patch.dict(
            os.environ,
            {"SMSPOH_API_KEY": "", "SMSPOH_API_SECRET": ""},
        ),
        patch("myanmar_agri_geo.early_warning_sms.requests.post") as post,
        patch("builtins.open", side_effect=[IOError("Mock FS Error"), mock_open()()]),
    ):
        res = broadcast_sms("Test", ["09123456789"], dry_run=False)
        assert not res
        post.assert_not_called()

def test_13_dry_run_generate_message_but_send_nothing():
    res = broadcast_sms("Test msg", ["091"], dry_run=True)
    assert res

def test_14_existing_cli_commands_remain_unchanged():
    # Calling plan should return 0
    assert main(["plan", "--config", "config/default.yaml"]) == 0
        
@patch("myanmar_agri_geo.early_warning_sms.check_forecast")
@patch("myanmar_agri_geo.early_warning_sms.check_flood_forecast")
@patch("myanmar_agri_geo.early_warning_sms.check_realtime_gee")
def test_15_cli_send_early_warning(mock_gee, mock_flood, mock_forecast):
    mock_forecast.return_value = {"status": "available", "rainfall_48h_mm": 200, "max_probability": 90}
    mock_flood.return_value = {}
    mock_gee.return_value = {}
    
    # Run the new CLI
    assert main(["send-early-warning", "--region", "yangon", "--severity-min", "WATCH"]) == 0
        
def test_16_open_meteo_gee_dependencies_missing_old_pipeline_passes():
    with patch("requests.get", side_effect=Exception("No internet")):
        assert main(["plan", "--config", "config/default.yaml"]) == 0
