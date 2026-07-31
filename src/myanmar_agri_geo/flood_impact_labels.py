"""
Flood & Storm Impact Ground Truth Validator.
This module defines the schema, controlled vocabulary, and strict validation logic
for crop damage from floods and storms.
"""

import os
import csv
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
import datetime

# Schema Constants
REQUIRED_FIELDS = [
    "observation_id",
    "observation_date",
    "crop_type",
    "latitude",
    "longitude",
]

ALL_FIELDS = REQUIRED_FIELDS + [
    "farm_id", "village_id", "event_id",
    "state_region", "district", "township", "village_tract",
    "flood_event_observed", "flood_duration_days", "maximum_flood_depth_cm",
    "storm_event_observed", "primary_damage_mechanism", "maximum_wind_speed_kmh", 
    "wind_damage_percent", "crop_damage_percent", "extreme_weather_type",
    "event_start_date", "event_end_date",
    "crop_growth_stage", "planted_area_ha", "affected_area_ha", "harvested_area_ha",
    "expected_yield_ton_per_ha", "actual_yield_ton_per_ha", "crop_loss_ton",
    "replanting_required", "harvest_status",
    "data_collection_method", "reported_by_role", "verification_status", 
    "verified_by", "verification_date", "evidence_photo_available", 
    "source_message_id", "sms_received_at", "sender_id_hash", 
    "parser_version", "ingested_at", "quality_flag", "notes", 
    "raw_source_text", "schema_version"
]

# Controlled Vocabularies
ALLOWED_PRIMARY_DAMAGE = {
    "flooding", "wind", "storm_surge", "waterlogging", 
    "erosion", "crop_lodging", "multiple", "other", "unknown"
}

ALLOWED_HARVEST_STATUS = {
    "not_started", "in_progress", "completed", 
    "crop_destroyed", "not_applicable", "unknown"
}

ALLOWED_CROP_GROWTH_STAGE = {
    "land_preparation", "seedling", "transplanting", "vegetative", 
    "tillering", "flowering", "grain_filling", "maturity", "harvest", 
    "post_harvest", "unknown"
}

ALLOWED_EXTREME_WEATHER = {
    "river_flood", "flash_flood", "coastal_flood", "cyclone", 
    "storm_surge", "heavy_rainfall", "waterlogging", "multiple_events", 
    "other", "none", "unknown"
}

BOOLEAN_TRUE = {"true", "1", "yes"}
BOOLEAN_FALSE = {"false", "0", "no"}

@dataclass
class ValidationResult:
    status: str  # "validated", "rejected", "quarantine"
    row: Dict[str, Any]
    errors: List[str]
    warnings: List[str]

def _parse_bool(val: str) -> Optional[bool]:
    if not val:
        return None
    val_lower = str(val).strip().lower()
    if val_lower in BOOLEAN_TRUE:
        return True
    if val_lower in BOOLEAN_FALSE:
        return False
    raise ValueError(f"Invalid boolean string: {val}")

def _parse_float(val: str) -> Optional[float]:
    if not val:
        return None
    return float(val)

def _parse_date(val: str) -> Optional[datetime.date]:
    if not val:
        return None
    try:
        # Assuming YYYYMMDD or YYYY-MM-DD
        s = str(val).strip().replace("-", "")
        if len(s) == 8:
            return datetime.datetime.strptime(s, "%Y%m%d").date()
    except ValueError:
        pass
    raise ValueError(f"Invalid date string: {val}")

def generate_template(output_dir: str):
    """Generates the empty CSV template."""
    os.makedirs(output_dir, exist_ok=True)
    template_path = os.path.join(output_dir, "flood_impact_template.csv")
    with open(template_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(ALL_FIELDS)
    logging.info(f"Generated template at {template_path}")

def validate_row(row: Dict[str, str]) -> ValidationResult:
    """Validates a single row against the strict Flood/Storm schemas."""
    errors = []
    warnings = []
    status = "validated"
    
    # Required Fields Check
    for req in REQUIRED_FIELDS:
        if not row.get(req):
            errors.append(f"Missing required field: {req}")

    # Parse and validate booleans
    parsed_bools = {}
    for bfield in ["flood_event_observed", "storm_event_observed", "replanting_required", "evidence_photo_available"]:
        val = row.get(bfield)
        if val:
            try:
                parsed_bools[bfield] = _parse_bool(val)
            except ValueError:
                errors.append(f"Invalid boolean for {bfield}: {val}")
        else:
            parsed_bools[bfield] = None

    # Normalization & Controlled Vocabularies
    gs = row.get("crop_growth_stage", "").strip().lower()
    if gs:
        if gs in ["flower", "flowering_stage"]:
            gs = "flowering"
        if gs not in ALLOWED_CROP_GROWTH_STAGE:
            gs = "unknown"
            warnings.append("growth_stage_unrecognized")
        row["crop_growth_stage"] = gs

    wt = row.get("extreme_weather_type", "").strip().lower()
    if wt:
        wt = wt.replace(" ", "_")
        if wt not in ALLOWED_EXTREME_WEATHER:
            wt = "unknown"
            warnings.append("unrecognized_category")
        row["extreme_weather_type"] = wt

    pdm = row.get("primary_damage_mechanism", "").strip().lower()
    if pdm:
        if pdm not in ALLOWED_PRIMARY_DAMAGE:
            pdm = "unknown"
            warnings.append("unrecognized_category")
        row["primary_damage_mechanism"] = pdm

    hs = row.get("harvest_status", "").strip().lower()
    if hs:
        if hs not in ALLOWED_HARVEST_STATUS:
            hs = "unknown"
            warnings.append("unrecognized_category")
        row["harvest_status"] = hs

    flood_observed = parsed_bools.get("flood_event_observed")
    storm_observed = parsed_bools.get("storm_event_observed")

    # Hard Flood Rules
    if flood_observed is True:
        if not wt:
            errors.append("Flood is True but extreme_weather_type is Null.")
        
        fdur = row.get("flood_duration_days")
        if fdur:
            try:
                if float(fdur) == 0:
                    errors.append("Flood is True but flood_duration_days is 0.")
                elif float(fdur) < 0:
                    errors.append("Negative flood_duration_days.")
            except ValueError:
                errors.append("Invalid flood_duration_days.")
        else:
            warnings.append("duration_unknown")

    # Hard Storm Rules
    if storm_observed is True:
        if not wt:
            errors.append("Storm is True but extreme_weather_type is Null.")
        if not pdm:
            warnings.append("damage_mechanism_missing")
            
    # Floats / Percentages
    for pfield in ["crop_damage_percent", "wind_damage_percent"]:
        pval = row.get(pfield)
        if pval:
            try:
                fval = float(pval)
                if fval < 0 or fval > 100:
                    errors.append(f"{pfield} out of bounds: {pval}")
            except ValueError:
                errors.append(f"Invalid float {pfield}: {pval}")

    for nfield in ["maximum_wind_speed_kmh", "maximum_flood_depth_cm", "planted_area_ha", 
                   "affected_area_ha", "harvested_area_ha", "expected_yield_ton_per_ha", 
                   "actual_yield_ton_per_ha", "crop_loss_ton"]:
        nval = row.get(nfield)
        if nval:
            try:
                fval = float(nval)
                if fval < 0:
                    errors.append(f"Negative {nfield}: {nval}")
            except ValueError:
                errors.append(f"Invalid float {nfield}: {nval}")

    # Area Logic
    p_area = _parse_float(row.get("planted_area_ha"))
    a_area = _parse_float(row.get("affected_area_ha"))
    h_area = _parse_float(row.get("harvested_area_ha"))
    
    if p_area is not None:
        if a_area is not None and a_area > p_area:
            errors.append("affected_area_ha > planted_area_ha")
        if h_area is not None and h_area > p_area:
            errors.append("harvested_area_ha > planted_area_ha")
    else:
        if a_area is not None:
            warnings.append("affected_area_ha exists but planted_area_ha is Null")
        if h_area is not None:
            status = "quarantine"
            warnings.append("harvested_area_ha exists but planted_area_ha is Null")

    # Yield & Harvest
    a_yield = _parse_float(row.get("actual_yield_ton_per_ha"))
    e_yield = _parse_float(row.get("expected_yield_ton_per_ha"))
    if hs == "completed" and a_yield is None:
        errors.append("harvest_status completed but actual_yield_ton_per_ha is Null")
    if hs == "not_started" and a_yield is not None:
        warnings.append("harvest_status not_started but actual_yield_ton_per_ha exists")
    if e_yield is not None and a_yield is not None and a_yield > e_yield:
        warnings.append("actual_yield_ton_per_ha > expected_yield_ton_per_ha")

    # Date Logic
    sd = _parse_date(row.get("event_start_date"))
    ed = _parse_date(row.get("event_end_date"))
    od = _parse_date(row.get("observation_date"))
    
    if sd and ed and ed < sd:
        errors.append("event_end_date < event_start_date")
    if sd and od and od < sd:
        warnings.append("observation_date < event_start_date")

    # GPS Limits
    lat = _parse_float(row.get("latitude"))
    lon = _parse_float(row.get("longitude"))
    if lat is not None and (lat < -90 or lat > 90):
        errors.append("Latitude out of bounds")
    if lon is not None and (lon < -180 or lon > 180):
        errors.append("Longitude out of bounds")

    # Consistency Quarantine Rules
    if flood_observed is False:
        if _parse_float(row.get("flood_duration_days", "")) or _parse_float(row.get("maximum_flood_depth_cm", "")):
            status = "quarantine"
            warnings.append("event_flag_mismatch (Flood False but duration/depth > 0)")
    
    if storm_observed is False:
        if _parse_float(row.get("wind_damage_percent", "")) or _parse_float(row.get("maximum_wind_speed_kmh", "")):
            status = "quarantine"
            warnings.append("event_flag_mismatch (Storm False but wind metrics > 0)")
            
    if flood_observed is False and storm_observed is False:
        if wt and wt not in ["none", "unknown"]:
            status = "quarantine"
            warnings.append("event_flag_mismatch (Both events False but extreme_weather_type is not none)")

    # Myanmar GPS bounds check (Approximate box & buffer)
    if lat is not None and lon is not None:
        if lat < 8 or lat > 30 or lon < 91 or lon > 103:
            status = "quarantine"
            warnings.append("outside_myanmar")
        elif lat < 9.5 or lat > 28.5 or lon < 92.2 or lon > 101.2:
            warnings.append("near_border_buffer")
            
    if errors:
        status = "rejected"
        
    return ValidationResult(status, row, errors, warnings)


def process_csv(input_path: str, output_dir: str):
    """Reads a CSV, validates, and routes to validated/rejected/quarantine."""
    val_dir = os.path.join(output_dir, "validated")
    rej_dir = os.path.join(output_dir, "rejected")
    quar_dir = os.path.join(output_dir, "quarantine")
    
    os.makedirs(val_dir, exist_ok=True)
    os.makedirs(rej_dir, exist_ok=True)
    os.makedirs(quar_dir, exist_ok=True)
    
    base_name = os.path.basename(input_path)
    val_path = os.path.join(val_dir, base_name)
    rej_path = os.path.join(rej_dir, base_name)
    quar_path = os.path.join(quar_dir, base_name)
    
    with open(input_path, 'r', encoding='utf-8') as fin, \
         open(val_path, 'w', newline='', encoding='utf-8') as fval, \
         open(rej_path, 'w', newline='', encoding='utf-8') as frej, \
         open(quar_path, 'w', newline='', encoding='utf-8') as fquar:
         
        reader = csv.DictReader(fin)
        fieldnames = reader.fieldnames if reader.fieldnames else ALL_FIELDS
        out_fields = list(fieldnames) + ["validation_notes"]
        
        w_val = csv.DictWriter(fval, fieldnames=fieldnames)
        w_rej = csv.DictWriter(frej, fieldnames=out_fields)
        w_quar = csv.DictWriter(fquar, fieldnames=out_fields)
        
        w_val.writeheader()
        w_rej.writeheader()
        w_quar.writeheader()
        
        seen_obs = set()
        
        for row in reader:
            obs_id = row.get("observation_id", "")
            if obs_id in seen_obs and obs_id:
                row["validation_notes"] = "duplicate_observation"
                w_rej.writerow(row)
                continue
            seen_obs.add(obs_id)
            
            res = validate_row(row)
            
            if res.warnings:
                flag_str = "|".join([w.split(" ")[0] for w in res.warnings])
                qf = res.row.get("quality_flag", "")
                res.row["quality_flag"] = f"{qf}|{flag_str}" if qf else flag_str

            out_row = {k: res.row.get(k, "") for k in fieldnames}
            
            if res.status == "rejected":
                out_row["validation_notes"] = "; ".join(res.errors)
                w_rej.writerow(out_row)
            elif res.status == "quarantine":
                out_row["validation_notes"] = "; ".join(res.warnings)
                w_quar.writerow(out_row)
            else:
                w_val.writerow(out_row)
