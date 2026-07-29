import pandas as pd
from pathlib import Path

def get_top_crops(parquet_path, region_name):
    if not parquet_path.exists():
        return f"{region_name}: Data not found"
        
    df = pd.read_parquet(parquet_path)
    
    # Filter for a recent year, e.g. 2025
    df = df[df['year_month'].str.startswith('2025')]
    if len(df) == 0:
        df = pd.read_parquet(parquet_path) # Fallback to all years if 2025 is empty
        
    crops = [
        'monsoon_rice', 'dry_season_rice', 'maize', 'sugarcane', 'cassava', 
        'durian', 'mangosteen', 'longan', 'mango', 'chili', 'tomato'
    ]
    
    results = {}
    for crop in crops:
        col = f'is_suitable__{crop}'
        if col in df.columns:
            suitable_count = df[col].sum()
            total = len(df)
            pct = (suitable_count / total) * 100 if total > 0 else 0
            results[crop] = pct
            
    # Sort and get top 3
    sorted_crops = sorted(results.items(), key=lambda x: x[1], reverse=True)
    top_3 = sorted_crops[:3]
    
    res_str = f"{region_name}:\n"
    for crop, pct in top_3:
        res_str += f"  - {crop.replace('_', ' ').title()} ({pct:.1f}% suitable area)\n"
    return res_str

def main():
    regions = {
        "Ayeyawaddy": "data/output/gee_2018_2026/myanmar_agri_suitability.parquet",
        "Bago": "data/output/gee_bago_2018_2026/myanmar_agri_suitability.parquet",
        "Mandalay": "data/output/gee_mandalay_2018_2026/myanmar_agri_suitability.parquet",
        "Sagaing": "data/output/gee_sagaing_2018_2026/myanmar_agri_suitability.parquet",
        "Magway": "data/output/gee_magway_2018_2026/myanmar_agri_suitability.parquet",
        "Yangon": "data/output/gee_yangon_2018_2026/myanmar_agri_suitability.parquet",
    }
    
    base_dir = Path("/Users/phyomyatmin/Desktop/myanmar-agri-geo-csv-pipeline")
    
    for name, path in regions.items():
        full_path = base_dir / path
        print(get_top_crops(full_path, name))

if __name__ == "__main__":
    main()
