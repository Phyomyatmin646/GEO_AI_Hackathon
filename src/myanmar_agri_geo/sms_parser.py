"""
SMS Parser for Flood & Storm Impact Ground Truth.
Handles parsing V1 SMS formats and creating standard schema dictionaries.
"""
import uuid
import datetime
import hashlib
from typing import Dict, Any, List, Optional
from .flood_impact_labels import ValidationResult, validate_row

V1_EXPECTED_FIELDS = 13

class SMSParser:
    def __init__(self):
        # Time window config could be added here
        self.parsed_hashes = {}  # In-memory mock for dup check
        
    def hash_phone(self, phone: str) -> str:
        """Hash sender ID for privacy and deduplication."""
        return hashlib.sha256(phone.encode('utf-8')).hexdigest()

    def check_duplicate(self, source_message_id: str, sender_hash: str, raw_text: str, received_at: datetime.datetime) -> str:
        """Returns empty string if not dup, 'exact_duplicate' or 'suspected_duplicate'."""
        text_hash = hashlib.md5(raw_text.encode('utf-8')).hexdigest()
        
        # Check exact msg ID dup
        for key, val in self.parsed_hashes.items():
            if val.get('msg_id') == source_message_id and source_message_id:
                return 'exact_duplicate'
                
            # Check suspected
            if val.get('sender') == sender_hash and val.get('text') == text_hash:
                # time window check - e.g., within 24h
                dt = val.get('received_at')
                if dt and received_at:
                    diff = abs((received_at - dt).total_seconds())
                    if diff < 86400:
                        return 'suspected_duplicate'
        
        # Register
        self.parsed_hashes[str(uuid.uuid4())] = {
            'msg_id': source_message_id,
            'sender': sender_hash,
            'text': text_hash,
            'received_at': received_at
        }
        return ""

    def parse_v1(self, raw_text: str, sender_phone: str, source_message_id: str, received_at: datetime.datetime) -> ValidationResult:
        parts = [p.strip() for p in raw_text.split(',')]
        
        if len(parts) != V1_EXPECTED_FIELDS:
            # Reject immediately
            return ValidationResult(
                status="rejected",
                row={"raw_source_text": raw_text},
                errors=[f"V1 SMS must contain exactly {V1_EXPECTED_FIELDS} fields. Found {len(parts)}."],
                warnings=[]
            )
            
        prefix, version, farm_id, crop_type, obs_date, lat, lon, evt_type, fdur, fdepth, dmg, gs, area = parts
        
        if prefix.upper() != "AGRI" or version.upper() != "V1":
            return ValidationResult(
                status="rejected",
                row={"raw_source_text": raw_text},
                errors=["Invalid SMS prefix or version. Expected AGRI,V1"],
                warnings=[]
            )

        sender_hash = self.hash_phone(sender_phone)
        dup_status = self.check_duplicate(source_message_id, sender_hash, raw_text, received_at)
        
        if dup_status == "exact_duplicate":
            return ValidationResult(
                status="rejected",
                row={"raw_source_text": raw_text},
                errors=["exact_duplicate"],
                warnings=[]
            )

        row = {
            "observation_id": str(uuid.uuid4()),
            "observation_date": obs_date,
            "crop_type": crop_type,
            "latitude": lat,
            "longitude": lon,
            "farm_id": farm_id,
            "extreme_weather_type": evt_type,
            "flood_duration_days": fdur,
            "maximum_flood_depth_cm": fdepth,
            "crop_damage_percent": dmg,
            "crop_growth_stage": gs,
            "affected_area_ha": area,
            
            # Defaults
            "data_collection_method": "sms",
            "verification_status": "unverified",
            "evidence_photo_available": "false",
            "parser_version": "v1",
            "schema_version": "flood-impact-v1.0",
            "quality_flag": "pending_verification",
            "raw_source_text": raw_text,
            "source_message_id": source_message_id,
            "sms_received_at": received_at.isoformat() if received_at else "",
            "sender_id_hash": sender_hash,
            "ingested_at": datetime.datetime.now().isoformat()
        }
        
        # Add warning if suspected
        warnings_pre = []
        if dup_status == "suspected_duplicate":
            warnings_pre.append("suspected_duplicate")
            row["quality_flag"] = row["quality_flag"] + "|suspected_duplicate"
            
        # Specific V1 Event Type Mapping
        evt_lower = evt_type.lower()
        if evt_lower in ["river_flood", "flash_flood", "coastal_flood"]:
            row["flood_event_observed"] = "true"
            row["storm_event_observed"] = "false"
            row["primary_damage_mechanism"] = "flooding"
        elif evt_lower == "cyclone":
            row["storm_event_observed"] = "true"
            row["flood_event_observed"] = "false"
            row["primary_damage_mechanism"] = "unknown"
            row["maximum_wind_speed_kmh"] = ""
            row["wind_damage_percent"] = ""
            row["quality_flag"] = row["quality_flag"] + "|storm_detail_missing"
            
        # Let flood_impact_labels handle the rest
        res = validate_row(row)
        
        # Combine pre-warnings if any
        if warnings_pre:
            res.warnings.extend(warnings_pre)
            if res.status != "rejected":
                res.status = "quarantine"
                
        return res
