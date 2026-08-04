import pandas as pd
from pathlib import Path
from src.myanmar_agri_geo.daily.feature_builder import FeatureBuilder, ALL_75_FEATURES

parquet_path = Path("test_features_serving.parquet")
pd.DataFrame({
    "grid_id": ["1818,402"],
    "elevation_m": [15],
    "crop_area_pct_monsoon_rice": [80],
    "chirps_precipitation_mm_mean": [40],
}).to_parquet(parquet_path)

builder = FeatureBuilder(parquet_path)
builder._load_parquet()
grid_id = "1818,402"
static_row = builder._static_index.loc[grid_id]
print("Type of static_row:", type(static_row))
print("static_row contents:")
print(static_row)
print("Does it contain elevation_m?")
print("elevation_m" in static_row)
val = static_row.get("elevation_m")
print("Value of elevation_m from static_row:", val)

from src.myanmar_agri_geo.daily.feature_builder import _safe_float
print("safe_float result:", _safe_float(val))

