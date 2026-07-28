import json
import os

OUTPUT_DIR = "web/data/macro"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Monthly phenology: 0=None, 1=Planting, 2=Growing, 3=Harvesting
def generate_phenology():
    return [
        {
            "crop_id": "monsoon_rice",
            "crop_name": "Monsoon Rice (မိုးစပါး)",
            "calendar": [
                {"month": "May", "stage": "Planting"},
                {"month": "Jun", "stage": "Planting"},
                {"month": "Jul", "stage": "Growing"},
                {"month": "Aug", "stage": "Growing"},
                {"month": "Sep", "stage": "Growing"},
                {"month": "Oct", "stage": "Harvesting"},
                {"month": "Nov", "stage": "Harvesting"},
                {"month": "Dec", "stage": "None"},
                {"month": "Jan", "stage": "None"},
                {"month": "Feb", "stage": "None"},
                {"month": "Mar", "stage": "None"},
                {"month": "Apr", "stage": "None"},
            ]
        },
        {
            "crop_id": "dry_season_rice",
            "crop_name": "Dry Season Rice (နွေစပါး)",
            "calendar": [
                {"month": "May", "stage": "None"},
                {"month": "Jun", "stage": "None"},
                {"month": "Jul", "stage": "None"},
                {"month": "Aug", "stage": "None"},
                {"month": "Sep", "stage": "None"},
                {"month": "Oct", "stage": "None"},
                {"month": "Nov", "stage": "Planting"},
                {"month": "Dec", "stage": "Planting"},
                {"month": "Jan", "stage": "Growing"},
                {"month": "Feb", "stage": "Growing"},
                {"month": "Mar", "stage": "Harvesting"},
                {"month": "Apr", "stage": "Harvesting"},
            ]
        },
        {
            "crop_id": "maize",
            "crop_name": "Maize (ပြောင်း)",
            "calendar": [
                {"month": "May", "stage": "Planting"},
                {"month": "Jun", "stage": "Growing"},
                {"month": "Jul", "stage": "Growing"},
                {"month": "Aug", "stage": "Growing"},
                {"month": "Sep", "stage": "Harvesting"},
                {"month": "Oct", "stage": "Harvesting"},
                {"month": "Nov", "stage": "None"},
                {"month": "Dec", "stage": "None"},
                {"month": "Jan", "stage": "None"},
                {"month": "Feb", "stage": "None"},
                {"month": "Mar", "stage": "None"},
                {"month": "Apr", "stage": "None"},
            ]
        },
        {
            "crop_id": "sugarcane",
            "crop_name": "Sugarcane (ကြံ)",
            "calendar": [
                {"month": "May", "stage": "Growing"},
                {"month": "Jun", "stage": "Growing"},
                {"month": "Jul", "stage": "Growing"},
                {"month": "Aug", "stage": "Growing"},
                {"month": "Sep", "stage": "Growing"},
                {"month": "Oct", "stage": "Growing"},
                {"month": "Nov", "stage": "Harvesting"},
                {"month": "Dec", "stage": "Harvesting"},
                {"month": "Jan", "stage": "Harvesting"},
                {"month": "Feb", "stage": "Planting"},
                {"month": "Mar", "stage": "Planting"},
                {"month": "Apr", "stage": "Growing"},
            ]
        }
    ]

def main():
    phenology = generate_phenology()
    out_path = os.path.join(OUTPUT_DIR, "phenology.json")
    with open(out_path, "w") as f:
        json.dump(phenology, f, indent=2)
    print(f"Wrote phenology data to {out_path}")

if __name__ == "__main__":
    main()
