"""
Early Warning SMS Broadcaster for Flood & Storms.
Uses Open-Meteo (Forecast & Flood) and GEE Daily Monitor outputs.
"""
import os
import json
import logging
import datetime
import hashlib
from typing import Dict, Any, List
import requests

try:
    import yaml
except ImportError:
    yaml = None


def load_thresholds(region: str) -> Dict[str, Any]:
    """Loads early warning thresholds from config."""
    config_path = "config/early_warning_thresholds.yaml"
    if not os.path.exists(config_path) or yaml is None:
        return {}
    with open(config_path, "r", encoding="utf-8") as f:
        thresholds = yaml.safe_load(f)
        
    region_key = region.lower()
    return thresholds.get(region_key, thresholds.get("default", {}))


def check_forecast(lat: float, lon: float, days: int = 3) -> Dict[str, Any]:
    """
    Fetch forecast from Open-Meteo.
    Uses daily precipitation_sum, precipitation_probability_max, wind_gusts_10m_max, weather_code.
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,weather_code",
        "timezone": "Asia/Yangon",
        "forecast_days": days
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        # Max over the forecast period
        daily = data.get("daily", {})
        max_rain = sum(daily.get("precipitation_sum", [0])[:2]) # 24h-48h sum approx
        max_prob = max(daily.get("precipitation_probability_max", [0]))
        max_wind = max(daily.get("wind_gusts_10m_max", [0]))
        
        return {
            "status": "available",
            "rainfall_48h_mm": max_rain,
            "max_probability": max_prob,
            "max_wind_gust_kmh": max_wind,
            "raw_daily": daily
        }
    except Exception as e:
        logging.error(f"Forecast API error: {e}")
        return {"status": "data_unavailable"}


def check_flood_forecast(lat: float, lon: float) -> Dict[str, Any]:
    """
    Fetch river discharge forecast from Open-Meteo GloFAS API.
    """
    url = "https://flood-api.open-meteo.com/v1/flood"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "river_discharge",
        "forecast_days": 3
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        daily = data.get("daily", {})
        discharge = max(daily.get("river_discharge", [0]))
        return {
            "status": "available",
            "max_river_discharge_m3s": discharge
        }
    except Exception as e:
        logging.error(f"Flood API error: {e}")
        return {"status": "data_unavailable"}


def check_realtime_gee(max_age_hours: int = 12) -> Dict[str, Any]:
    """
    Read the latest completed GEE monitor output.
    Does not trigger GEE processing directly.
    """
    log_file = "data/output/gee_monitor_latest.json"
    if not os.path.exists(log_file):
        return {"status": "no_data"}
        
    try:
        with open(log_file, "r") as f:
            data = json.load(f)
            
        generated_at = datetime.datetime.fromisoformat(data.get("generated_at", "2000-01-01T00:00:00"))
        age = (datetime.datetime.now() - generated_at).total_seconds() / 3600
        
        if age > max_age_hours:
            return {"status": "stale_data"}
            
        return {
            "status": "available",
            "rainfall_status": data.get("rainfall_status"),
            "sar_status": data.get("sar_status"),
            "flood_detected": data.get("sar_status") == "new_scene" and data.get("rainfall_status") == "complete"
        }
    except Exception as e:
        logging.error(f"Error reading GEE monitor output: {e}")
        return {"status": "error"}


def evaluate_and_trigger(region: str, forecast: Dict, flood: Dict, gee: Dict, dmh_warning: bool, thresholds: Dict) -> Dict:
    """
    Evaluates rule-based triggers and returns severity.
    Levels: NORMAL, WATCH, WARNING, EMERGENCY
    """
    if not thresholds:
        return {"severity": "NORMAL", "reason": "No thresholds configured"}

    # Priority 1: DMH Official Warning
    if dmh_warning:
        return {"severity": "EMERGENCY", "reason": "DMH Official Warning", "confidence": "official"}

    severity = "NORMAL"
    reasons = []
    confidence = "low"
    
    # Priority 2/3: Forecast & GEE
    forecast_rain = forecast.get("rainfall_48h_mm", 0)
    forecast_wind = forecast.get("max_wind_gust_kmh", 0)
    forecast_prob = forecast.get("max_probability", 0)
    
    flood_disc = flood.get("max_river_discharge_m3s", 0)
    
    gee_flood = gee.get("flood_detected", False)
    
    has_forecast = forecast.get("status") == "available"
    has_gee = gee.get("status") == "available"
    
    # Check Wind/Storm
    if has_forecast and forecast_prob >= thresholds.get("forecast_probability_min", 70):
        if forecast_wind >= thresholds.get("wind_gust_warning_kmh", 90):
            severity = "WARNING"
            reasons.append("high_wind_forecast")
        elif forecast_wind >= thresholds.get("wind_gust_watch_kmh", 60) and severity == "NORMAL":
            severity = "WATCH"
            reasons.append("moderate_wind_forecast")
            
    # Check Rainfall/Flood
    if has_forecast and forecast_prob >= thresholds.get("forecast_probability_min", 70):
        if forecast_rain >= thresholds.get("rainfall_24h_warning_mm", 90):
            severity = "WARNING"
            reasons.append("high_rainfall_forecast")
        elif forecast_rain >= thresholds.get("rainfall_24h_watch_mm", 50) and severity in ("NORMAL", "WATCH"):
            severity = "WATCH"
            reasons.append("moderate_rainfall_forecast")
            
    if flood.get("status") == "available":
        if flood_disc >= thresholds.get("discharge_warning_m3s", 20000):
            severity = "WARNING"
            reasons.append("high_river_discharge")
            
    # Check GEE observed
    if has_gee and gee_flood:
        if severity == "WARNING":
            severity = "EMERGENCY" # Both forecast and observed agree
            reasons.append("gee_observed_flooding")
        elif severity == "NORMAL":
            severity = "WARNING" # Observed but not forecasted
            reasons.append("gee_observed_flooding_unforecasted")
            
    # Determine confidence
    if has_forecast and has_gee and gee_flood:
        confidence = "high"
    elif has_forecast or has_gee:
        confidence = "medium"
        if not has_gee and gee.get("status") == "stale_data":
            confidence = "low_stale_gee"
            
    return {
        "severity": severity,
        "reason": ",".join(reasons),
        "confidence": confidence,
        "region": region,
        "timestamp": datetime.datetime.now().isoformat()
    }


def format_message(eval_result: Dict) -> str:
    """Formats the SMS message to be sent."""
    severity = eval_result["severity"]
    if severity == "NORMAL":
        return f"[TEST MESSAGE] {eval_result['region']} တိုင်း/ပြည်နယ်အတွက် စမ်းသပ်ပေးပို့ခြင်းဖြစ်ပါသည်။ ရာသီဥတု သာယာနေပါသည်။"
        
    region_mm = eval_result["region"] # Basic mapping can be added
    reason = eval_result["reason"]
    
    msg = f"[{severity} ALERT] {region_mm} တိုင်း/ပြည်နယ်အတွက် သတိပေးချက်။\n"
    if "wind" in reason:
        msg += "လေပြင်းတိုက်ခတ်နိုင်ခြေရှိပါသည်။\n"
    if "rain" in reason or "discharge" in reason or "flood" in reason:
        msg += "မိုးသည်းထန်ပြီး ရေကြီးနိုင်ခြေရှိပါသည်။\n"
        
    msg += "နိမ့်ကျသောနေရာများနှင့် ရေစီးကြောင်းအနီးမှ ရှောင်ကြဉ်ပါ။\n"
    msg += f"ထုတ်ပြန်ချိန်: {datetime.datetime.now().strftime('%d-%m-%Y %H:%M')}\n"
    msg += "(ဤသတိပေးချက်သည် အလိုအလျောက်စနစ်ဖြင့် တွက်ချက်ထားခြင်းဖြစ်ပါသည်။ DMH တရားဝင်ထုတ်ပြန်ချက်ကိုလည်း စစ်ဆေးပါ။)"
    return msg


def deduplicate_alert(eval_result: Dict, history_file: str = "data/output/early_warning/alert_history.json") -> bool:
    """
    Checks if we should send the alert based on cooldown and escalation rules.
    Returns True if we should SEND, False to SKIP.
    """
    # Simple cooldown logic
    # Real implementation should use SQLite or proper persistent storage
    if not os.path.exists(os.path.dirname(history_file)):
        os.makedirs(os.path.dirname(history_file), exist_ok=True)
        
    history = {}
    if os.path.exists(history_file):
        with open(history_file, "r") as f:
            try:
                history = json.load(f)
            except json.JSONDecodeError:
                pass
                
    key = f"{eval_result['region']}_{eval_result['reason']}"
    last_alert = history.get(key, {})
    
    current_time = datetime.datetime.now()
    should_send = True
    
    if last_alert:
        last_time = datetime.datetime.fromisoformat(last_alert.get("timestamp", "2000-01-01T00:00:00"))
        last_severity = last_alert.get("severity")
        
        hours_diff = (current_time - last_time).total_seconds() / 3600
        
        # Cooldown is 12 hours for same severity
        if hours_diff < 12 and last_severity == eval_result["severity"]:
            should_send = False
            
        # Escalation: WATCH -> WARNING -> EMERGENCY (always send)
        severity_rank = {"NORMAL": 0, "WATCH": 1, "WARNING": 2, "EMERGENCY": 3}
        if severity_rank.get(eval_result["severity"], 0) > severity_rank.get(last_severity, 0):
            should_send = True # Escalation
            
    if should_send:
        history[key] = eval_result
        with open(history_file, "w") as f:
            json.dump(history, f)
            
    return should_send


import csv

def get_subscribers_by_region(region: str, csv_path: str = "data/subscribers.csv") -> List[str]:
    """Reads the subscribers CSV and returns a list of phone numbers for the given region."""
    if not os.path.exists(csv_path):
        return []
    
    phones = []
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("region", "").strip().lower() == region.lower():
                    phone = row.get("phone", "").strip()
                    if phone:
                        phones.append(phone)
    except Exception as e:
        logging.error(f"Error reading subscribers CSV: {e}")
        
    return phones


def broadcast_sms(message: str, phone_numbers: List[str], dry_run: bool = True) -> bool:
    """Send SMS alerts or write a dry-run audit record.

    Live delivery is fail-closed unless the provider credentials are supplied
    through the process environment. Secrets must never be committed to source.
    """
    if not message or not phone_numbers:
        return False
        
    log_dir = "data/output/early_warning/broadcast_logs"
    os.makedirs(log_dir, exist_ok=True)
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = os.path.join(log_dir, f"broadcast_{timestamp}.log")
    
    def write_audit_log(mode: str, provider_result: str) -> bool:
        try:
            with open(log_file, "w", encoding="utf-8") as f:
                f.write(f"{mode} Broadcasting Message:\n{message}\n\nTo:\n")
                for num in phone_numbers:
                    f.write(f"- {num}\n")
                if provider_result:
                    f.write(f"\n--- Provider Result ---\n{provider_result}\n")
            return True
        except Exception as e:
            failed_dir = "data/output/early_warning/failed"
            os.makedirs(failed_dir, exist_ok=True)
            try:
                with open(
                    os.path.join(failed_dir, f"fail_{timestamp}.log"),
                    "w",
                    encoding="utf-8",
                ) as f:
                    f.write(f"Could not write broadcast audit log: {e}")
            except Exception:
                logging.exception("Could not write SMS broadcast failure log")
            return False

    if dry_run:
        return write_audit_log("[DRY-RUN]", "No provider request was sent.")

    api_key = os.getenv("SMSPOH_API_KEY", "").strip()
    api_secret = os.getenv("SMSPOH_API_SECRET", "").strip()
    sender_id = os.getenv("SMSPOH_SENDER_ID", "SMSPoh Demo").strip()
    if not api_key or not api_secret:
        write_audit_log(
            "[SMSPOH-API:NOT-SENT]",
            "Provider credentials are not configured; no SMS was sent.",
        )
        return False

    import base64

    encoded_auth = base64.b64encode(f"{api_key}:{api_secret}".encode()).decode()
    headers = {
        "Authorization": f"Bearer {encoded_auth}",
        "Content-Type": "application/json",
    }
    formatted_phones = []
    for phone_number in phone_numbers:
        phone = phone_number.strip()
        if phone.startswith("959"):
            formatted_phones.append("09" + phone[3:])
        else:
            formatted_phones.append(phone)

    responses = []
    all_delivered = True
    for phone in formatted_phones:
        try:
            response = requests.post(
                "https://v3.smspoh.com/api/rest/send",
                headers=headers,
                json={"from": sender_id, "to": phone, "message": message},
                timeout=15,
            )
            delivered = 200 <= response.status_code < 300
            all_delivered = all_delivered and delivered
            responses.append(
                f"To {phone}: HTTP {response.status_code} - {response.text[:2000]}"
            )
        except requests.RequestException as exc:
            all_delivered = False
            responses.append(f"To {phone}: provider request failed ({type(exc).__name__})")

    audit_written = write_audit_log("[SMSPOH-API]", "\n".join(responses))
    return all_delivered and audit_written
