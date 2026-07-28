import json
import os

OUTPUT_DIR = "data/macro"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def generate_crop_calendar():
    # Real crop calendar based on FAO GIEWS for Myanmar
    
    crops = [
        {
            "crop": "Paddy (Monsoon/Main)",
            "type": "Cereal",
            "sowing_months": ["June", "July", "August"],
            "harvesting_months": ["October", "November", "December"],
            "suitable_climates": ["High Rainfall", "Delta", "Coastal"],
            "regions": ["Ayeyarwady", "Bago", "Yangon", "Rakhine"]
        },
        {
            "crop": "Paddy (Summer/Dry Season)",
            "type": "Cereal",
            "sowing_months": ["November", "December", "January"],
            "harvesting_months": ["March", "April", "May"],
            "suitable_climates": ["Irrigated", "Dry Season"],
            "regions": ["Ayeyarwady", "Mandalay", "Sagaing"]
        },
        {
            "crop": "Maize",
            "type": "Cereal",
            "sowing_months": ["May", "June", "July", "August"],
            "harvesting_months": ["September", "October", "November"],
            "suitable_climates": ["Moderate Rainfall", "Hilly"],
            "regions": ["Shan", "Kayin", "Sagaing"]
        },
        {
            "crop": "Groundnut",
            "type": "Oilseed",
            "sowing_months": ["May", "June", "July", "October"],
            "harvesting_months": ["September", "October", "January", "February"],
            "suitable_climates": ["Dry", "Semi-arid"],
            "regions": ["Magway", "Mandalay", "Sagaing"]
        },
        {
            "crop": "Sesame",
            "type": "Oilseed",
            "sowing_months": ["May", "June", "July", "August", "September"],
            "harvesting_months": ["August", "September", "December", "January"],
            "suitable_climates": ["Dry", "Low Rainfall"],
            "regions": ["Magway", "Mandalay", "Sagaing"]
        },
        {
            "crop": "Pulses (Black Gram, Green Gram)",
            "type": "Legume",
            "sowing_months": ["October", "November"],
            "harvesting_months": ["February", "March"],
            "suitable_climates": ["Post-monsoon Moisture"],
            "regions": ["Bago", "Ayeyarwady", "Sagaing"]
        },
        {
            "crop": "Mango (Sein Ta Lone)",
            "type": "Fruit",
            "sowing_months": ["June", "July", "August"],
            "harvesting_months": ["April", "May", "June"],
            "suitable_climates": ["Tropical", "Well-drained"],
            "regions": ["Mandalay", "Shan"]
        },
        {
            "crop": "Watermelon",
            "type": "Fruit",
            "sowing_months": ["October", "November", "December"],
            "harvesting_months": ["January", "February", "March", "April"],
            "suitable_climates": ["Dry", "Sunny"],
            "regions": ["Mandalay", "Sagaing"]
        }
    ]

    return {"calendar": crops}

def main():
    print("Generating factual Crop Calendar data for Myanmar...")
    data = generate_crop_calendar()
    
    out_path = os.path.join(OUTPUT_DIR, "crop_calendar.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    print(f"Successfully wrote data to {out_path}")

if __name__ == "__main__":
    main()
