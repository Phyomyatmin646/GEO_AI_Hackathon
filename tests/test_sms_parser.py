import pytest
import datetime
from myanmar_agri_geo.sms_parser import SMSParser

def test_parse_v1_valid():
    parser = SMSParser()
    raw_text = "AGRI,V1,FARM023,RICE,20260728,16.8000,96.1000,RIVER_FLOOD,5,65,80,FLOWERING,2.5"
    dt = datetime.datetime.now()
    res = parser.parse_v1(raw_text, "09123456789", "msg123", dt)
    assert res.status == "validated"
    assert res.row["flood_event_observed"] == "true"
    assert res.row["primary_damage_mechanism"] == "flooding"

def test_parse_v1_cyclone():
    parser = SMSParser()
    # Missing duration, depth, damage, area for cyclone is okay if we handle mapping correctly. 
    # But V1 requires 13 fields exactly.
    raw_text = "AGRI,V1,FARM023,RICE,20260728,16.8000,96.1000,CYCLONE,0,0,80,FLOWERING,2.5"
    dt = datetime.datetime.now()
    res = parser.parse_v1(raw_text, "09123456789", "msg124", dt)
    # The Cyclone mapping sets storm_detail_missing. It shouldn't be rejected.
    assert "storm_detail_missing" in res.row["quality_flag"]
    assert res.row["storm_event_observed"] == "true"

def test_parse_v1_exact_duplicate():
    parser = SMSParser()
    raw_text = "AGRI,V1,FARM023,RICE,20260728,16.8000,96.1000,RIVER_FLOOD,5,65,80,FLOWERING,2.5"
    dt = datetime.datetime.now()
    res1 = parser.parse_v1(raw_text, "09123456789", "msg123", dt)
    assert res1.status == "validated"
    
    # Send same message ID
    res2 = parser.parse_v1(raw_text, "09123456789", "msg123", dt)
    assert res2.status == "rejected"
    assert "exact_duplicate" in res2.errors

def test_parse_v1_invalid_field_count():
    parser = SMSParser()
    raw_text = "AGRI,V1,FARM023,RICE"
    dt = datetime.datetime.now()
    res = parser.parse_v1(raw_text, "09123456789", "msg123", dt)
    assert res.status == "rejected"
    assert "exactly 13 fields" in res.errors[0]
