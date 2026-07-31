import pandas as pd
import ast
import json
from pathlib import Path

def parse_class_areas(val):
    if pd.isna(val) or not val:
        return {}
    try:
        val_str = str(val).replace('=', ':')
        val_str = val_str.replace('class:', '"class":').replace('sum:', '"sum":')
        data = json.loads(val_str)
        return {int(item['class']): item['sum'] for item in data}
    except Exception as e:
        try:
            data = ast.literal_eval(str(val))
            if isinstance(data, list):
                return {int(item.get('class', -1)): item.get('sum', 0) for item in data}
        except:
            pass
        return {}

def process_landcover():
    base_dir = Path(__file__).resolve().parents[1]
    landcover_dir = base_dir / "data" / "raw" / "gee_landcover_v2" # using a new folder for v2
    
    csv_files = list(landcover_dir.glob("*.csv"))
    if not csv_files:
        print("No CSV files found in data/raw/gee_landcover_v2/")
        return
        
    print(f"Loading {len(csv_files)} landcover v2 CSV files...")
    dfs = [pd.read_csv(f) for f in csv_files]
    lc_df = pd.concat(dfs, ignore_index=True)
    
    lc_df = lc_df.drop_duplicates(subset=['grid_id'])
    
    print("Parsing landcover fractions...")
    # Calculate total area of 2.5km buffer in sq meters approx = 19634954
    TOTAL_AREA_M2 = 19634954.0
    TOTAL_AREA_SQKM = 19.63
    
    lc_df['parsed_areas'] = lc_df['class_areas'].apply(parse_class_areas)
    
    # Area sums are in sq meters
    lc_df['builtup_fraction'] = lc_df['parsed_areas'].apply(lambda x: x.get(50, 0) / TOTAL_AREA_M2)
    lc_df['urban_fraction'] = lc_df['builtup_fraction'] # Keep alias just in case
    
    lc_df['cropland_fraction'] = lc_df['parsed_areas'].apply(lambda x: x.get(40, 0) / TOTAL_AREA_M2)
    
    # Non-cropland is 1 - cropland
    lc_df['non_cropland_fraction'] = 1.0 - lc_df['cropland_fraction']
    
    # JRC Permanent Water fraction
    lc_df['permanent_water_area_m2'] = lc_df['permanent_water_area_m2'].fillna(0)
    lc_df['permanent_water_fraction'] = lc_df['permanent_water_area_m2'] / TOTAL_AREA_M2
    
    # Population density
    lc_df['pop_sum'] = lc_df['pop_sum'].fillna(0)
    lc_df['population_density'] = lc_df['pop_sum'] / TOTAL_AREA_SQKM
    
    # Valid Agriculture Mask
    # Cropland > 0 and Builtup < 0.3 and Permanent Water < 0.5
    lc_df['valid_agriculture_mask'] = (
        (lc_df['cropland_fraction'] > 0.05) & 
        (lc_df['builtup_fraction'] < 0.3) & 
        (lc_df['permanent_water_fraction'] < 0.3)
    ).astype(int)
    
    # Add landcover year
    lc_df['landcover_source_year'] = 2021
    
    features = lc_df[['grid_id', 'urban_fraction', 'builtup_fraction', 'cropland_fraction', 
                      'non_cropland_fraction', 'permanent_water_fraction', 'population_density',
                      'valid_agriculture_mask', 'landcover_source_year']]
    
    name_map = {
        'gee_2018_2026': 'ayeyawaddy',
        'gee_bago_2018_2026': 'bago',
        'gee_mandalay_2018_2026': 'mandalay',
        'gee_sagaing_2018_2026': 'sagaing',
        'gee_magway_2018_2026': 'magway',
        'gee_yangon_2018_2026': 'yangon'
    }
    
    regions = name_map.keys()
    
    for reg in regions:
        reg_name = name_map[reg]
        p_file = base_dir / "data" / "output" / reg / f"{reg_name}_agri_suitability_with_infra.parquet"
        
        if not p_file.exists():
            continue
            
        csv_file = p_file.with_suffix('.csv')
        
        print(f"Merging landcover v2 features for {reg}...")
        df = pd.read_parquet(p_file)
        
        # Drop old landcover columns if they exist
        old_cols = ['urban_fraction', 'builtup_fraction', 'cropland_fraction', 'non_cropland_fraction', 
                    'permanent_water_fraction', 'population_density', 'valid_agriculture_mask', 'landcover_source_year']
        existing = [c for c in old_cols if c in df.columns]
        if existing:
            df = df.drop(columns=existing)
            
        df = df.merge(features, on='grid_id', how='left')
        
        df.to_parquet(p_file, index=False)
        df.to_csv(csv_file, index=False)
        print(f"Saved {p_file.name} and CSV")

if __name__ == "__main__":
    process_landcover()
