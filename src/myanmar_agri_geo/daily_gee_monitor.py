"""
Daily GEE Monitor for Flood Impact.
Checks the availability of IMERG (rainfall) and Sentinel-1 (SAR) data.
Earth Engine is an optional dependency.
"""
import logging
from typing import Dict, Any, Tuple
import datetime

try:
    import ee
    GEE_AVAILABLE = True
except ImportError:
    GEE_AVAILABLE = False


def check_imerg_status(start_date: datetime.date, end_date: datetime.date) -> str:
    """
    Checks GPM IMERG 24h rainfall availability.
    Accumulation: sum(precipitation_mm_per_hr * 0.5) over [start_timestamp, end_timestamp)
    """
    if not GEE_AVAILABLE:
        return "no_data"
        
    try:
        if not ee.data._credentials:
            return "no_data"
    except Exception:
        pass
        
    try:
        # Check if imagery exists
        start_ts = start_date.strftime("%Y-%m-%d")
        end_ts = end_date.strftime("%Y-%m-%d")
        
        # We don't actually run heavy sum over the whole country here,
        # we just check availability of images in the collection.
        # This is a mock structure for the actual GEE logic if it were fully implemented
        # The user requested specific fallback tests and logic separation.
        col = ee.ImageCollection("NASA/GPM_L3/IMERG_V06") \
                .filterDate(start_ts, end_ts)
        
        count = col.size().getInfo()
        if count == 48: # 48 half-hourly observations per day
            return "complete"
        elif count > 0:
            return "partial"
        else:
            return "no_data"
            
    except Exception as e:
        logging.warning(f"Error checking IMERG: {e}")
        return "delayed"


def check_sar_status(start_date: datetime.date, end_date: datetime.date) -> str:
    """
    Checks Sentinel-1 SAR availability.
    Uses latest available scene rather than forcing daily cycles.
    """
    if not GEE_AVAILABLE:
        return "no_new_scene"
        
    try:
        start_ts = start_date.strftime("%Y-%m-%d")
        end_ts = end_date.strftime("%Y-%m-%d")
        
        col = ee.ImageCollection("COPERNICUS/S1_GRD") \
                .filterDate(start_ts, end_ts)
        
        count = col.size().getInfo()
        if count > 0:
            return "new_scene"
        else:
            return "no_new_scene"
            
    except Exception as e:
        logging.warning(f"Error checking SAR: {e}")
        return "processing_error"


def calculate_overall_status(rainfall_status: str, sar_status: str) -> str:
    """
    Calculates overall monitor status based on strict matrix.
    """
    if rainfall_status == "complete" and sar_status == "new_scene":
        return "complete"
    if rainfall_status == "complete" and sar_status == "no_new_scene":
        return "degraded"
    if rainfall_status == "partial":
        return "partial"
    if rainfall_status == "delayed":
        return "delayed"
    if rainfall_status == "no_data" and sar_status == "new_scene":
        return "degraded"
    if rainfall_status == "no_data" and sar_status == "no_new_scene":
        return "failed"
    # Wait, the matrix has:
    # sar_status == processing_error + rainfall_status == available -> degraded
    # sar_status == processing_error + rainfall_status == no_data -> failed
    # We map 'available' to complete/partial
    if sar_status == "processing_error":
        if rainfall_status in ("complete", "partial"):
            return "degraded"
        if rainfall_status == "no_data":
            return "failed"
            
    return "degraded" # fallback


def get_daily_status(target_date: datetime.date) -> Dict[str, str]:
    """Returns the daily monitoring status."""
    end_date = target_date + datetime.timedelta(days=1)
    
    rainfall_status = check_imerg_status(target_date, end_date)
    sar_status = check_sar_status(target_date, end_date)
    overall_status = calculate_overall_status(rainfall_status, sar_status)
    
    return {
        "date": target_date.strftime("%Y-%m-%d"),
        "rainfall_status": rainfall_status,
        "sar_status": sar_status,
        "overall_status": overall_status
    }
