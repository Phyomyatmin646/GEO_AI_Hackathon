import pandas as pd
import ast
import json
from pathlib import Path

def parse_class_areas(val):
    if pd.isna(val) or not val:
        return {}
    try:
        # GEE lists often export as string like "[{class=10.0, sum=450.0}, ...]"
        # Replace '=' with ':' and add quotes to keys to make it valid JSON
        # A safer way is to use regex or string manipulation
        val_str = str(val).replace('=', ':')
        # Add quotes to keys (class, sum)
        val_str = val_str.replace('class:', '"class":').replace('sum:', '"sum":')
        data = json.loads(val_str)
        return {int(item['class']): item['sum'] for item in data}
    except Exception as e:
        # Fallback if eval works (if it's a python dict string)
        try:
            data = ast.literal_eval(str(val))
            if isinstance(data, list):
                return {int(item.get('class', -1)): item.get('sum', 0) for item in data}
        except:
            pass
        return {}

def process_landcover():
    base_dir = Path(__file__).resolve().parents[1]
    landcover_dir = base_dir / "data" / "raw" / "gee_landcover"
    
    csv_files = list(landcover_dir.glob("*.csv"))
    if not csv_files:
        print("No CSV files found in data/raw/gee_landcover/")
        return
        
    print(f"Loading {len(csv_files)} landcover CSV files...")
    dfs = [pd.read_csv(f) for f in csv_files]
    lc_df = pd.concat(dfs, ignore_index=True)
    
    # Remove duplicates just in case
    lc_df = lc_df.drop_duplicates(subset=['grid_id'])
    
    print("Parsing landcover fractions...")
    # Calculate total area of 2.5km buffer in sq meters approx = 19634954
    TOTAL_AREA_M2 = 19634954.0
    TOTAL_AREA_SQKM = 19.63
    
    lc_df['parsed_areas'] = lc_df['class_areas'].apply(parse_class_areas)
    
    # Area sums are in sq meters (scale=10 for ESA, reducer sum of pixel area)
    lc_df['urban_fraction'] = lc_df['parsed_areas'].apply(lambda x: x.get(50, 0) / TOTAL_AREA_M2)
    lc_df['builtup_fraction'] = lc_df['urban_fraction'] # Same for ESA
    lc_df['cropland_fraction'] = lc_df['parsed_areas'].apply(lambda x: x.get(40, 0) / TOTAL_AREA_M2)
    lc_df['permanent_water_fraction'] = lc_df['parsed_areas'].apply(lambda x: x.get(80, 0) / TOTAL_AREA_M2)
    
    # non_cropland is roughly 1 - cropland
    lc_df['non_cropland_fraction'] = 1.0 - lc_df['cropland_fraction']
    
    # Population density = pop_sum / area in sq km
    lc_df['pop_sum'] = lc_df['pop_sum'].fillna(0)
    lc_df['population_density'] = lc_df['pop_sum'] / TOTAL_AREA_SQKM
    
    # Keep only needed columns
    features = lc_df[['grid_id', 'urban_fraction', 'builtup_fraction', 'cropland_fraction', 
                      'non_cropland_fraction', 'permanent_water_fraction', 'population_density']]
    
    # Now merge into all region files
    regions = [
        "gee_2018_2026", "gee_bago_2018_2026", "gee_mandalay_2018_2026", 
        "gee_sagaing_2018_2026", "gee_magway_2018_2026", "gee_yangon_2018_2026"
    ]
    
    for reg in regions:
        # We named them region_agri_suitability_with_infra.parquet
        # Let's find it dynamically
        reg_dir = base_dir / "data" / "output" / reg
        parquet_files = list(reg_dir.glob("*_agri_suitability_with_infra.parquet"))
        if not parquet_files:
            continue
            
        p_file = parquet_files[0]
        csv_file = p_file.with_suffix('.csv')
        
        print(f"Merging features for {reg}...")
        df = pd.read_parquet(p_file)
        
        # Merge
        df = df.merge(features, on='grid_id', how='left')
        
        # Save back
        df.to_parquet(p_file, index=False)
        df.to_csv(csv_file, index=False)
        print(f"Saved {p_file.name} and CSV")

if __name__ == "__main__":
    process_landcover()
