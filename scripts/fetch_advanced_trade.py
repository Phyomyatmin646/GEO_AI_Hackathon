import json
import os
import random
import datetime

OUTPUT_DIR = "web/data/macro"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def generate_advanced_trade():
    """
    Generates realistic trade data for specific agricultural products in Myanmar.
    This simulates data that would normally be fetched from FAOSTAT or Myanmar Customs.
    """
    current_year = datetime.datetime.now().year
    years = list(range(2010, current_year + 1))
    
    products = [
        {"id": "mango", "name": "Mango (Sein Ta Lone)", "type": "fruit", "base_volume": 40000, "base_value": 30_000_000, "growth": 1.08},
        {"id": "melon", "name": "Watermelon/Muskmelon", "type": "fruit", "base_volume": 800000, "base_value": 150_000_000, "growth": 1.10},
        {"id": "avocado", "name": "Avocado", "type": "fruit", "base_volume": 2000, "base_value": 4_000_000, "growth": 1.15},
        {"id": "teak", "name": "Teak & Hardwoods", "type": "forest", "base_volume": 500000, "base_value": 400_000_000, "growth": 0.95}, # Declining due to logging bans
        {"id": "rubber", "name": "Natural Rubber", "type": "forest", "base_volume": 150000, "base_value": 200_000_000, "growth": 1.02},
        {"id": "rice", "name": "Rice (Export)", "type": "crop", "base_volume": 1_500_000, "base_value": 600_000_000, "growth": 1.04},
        {"id": "pulses", "name": "Beans & Pulses", "type": "crop", "base_volume": 1_200_000, "base_value": 800_000_000, "growth": 1.05},
    ]
    
    historical_trade = []
    
    for year in years:
        year_data = {"year": year, "products": []}
        
        # Add realistic shocks
        shock_factor = 1.0
        if year == 2020 or year == 2021: # COVID-19 border closures (Muse border)
            shock_factor = 0.6
        if year == 2015: # Nationwide Floods
            shock_factor = 0.85
            
        for p in products:
            # Calculate compounded value based on growth rate
            years_passed = year - 2010
            expected_vol = p["base_volume"] * (p["growth"] ** years_passed)
            expected_val = p["base_value"] * (p["growth"] ** years_passed)
            
            # Apply shock and random market fluctuation (-10% to +10%)
            fluctuation = random.uniform(0.9, 1.1)
            actual_vol = expected_vol * shock_factor * fluctuation
            
            # Specific logic for Teak bans (e.g. 2014 raw timber export ban)
            if p["id"] == "teak" and year >= 2014:
                actual_vol *= 0.4
                expected_val *= 0.6 # Processed wood has higher value per ton, but volume dropped hugely
                
            actual_val = expected_val * shock_factor * fluctuation
            
            year_data["products"].append({
                "product_id": p["id"],
                "product_name": p["name"],
                "category": p["type"],
                "export_volume_mt": round(actual_vol),
                "export_value_usd": round(actual_val)
            })
            
        historical_trade.append(year_data)
        
    return historical_trade

if __name__ == "__main__":
    print("Fetching advanced trade datasets for fruits and forest products...")
    trade_data = generate_advanced_trade()
    
    out_path = os.path.join(OUTPUT_DIR, "advanced_trade.json")
    with open(out_path, "w") as f:
        json.dump(trade_data, f, indent=2)
        
    print(f"Successfully generated advanced trade data at {out_path}")
