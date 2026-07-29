import os
import time
import ee
import pandas as pd
from pathlib import Path

# Initialize Earth Engine
try:
    ee.Initialize()
except Exception as e:
    print("Please authenticate Earth Engine first using 'earthengine authenticate'")
    raise e

def extract_landcover_features():
    base_dir = Path(__file__).resolve().parents[1]
    
    # 1. Collect all grid points from assembled datasets
    print("Collecting unique grid points from assembled data...")
    regions = [
        "gee_2018_2026", "gee_bago_2018_2026", "gee_mandalay_2018_2026", 
        "gee_sagaing_2018_2026", "gee_magway_2018_2026", "gee_yangon_2018_2026"
    ]
    
    all_points = pd.DataFrame()
    for reg in regions:
        parquet_path = base_dir / "data" / "output" / reg / "myanmar_agri_suitability.parquet"
        if parquet_path.exists():
            df = pd.read_parquet(parquet_path, columns=['grid_id', 'longitude', 'latitude'])
            all_points = pd.concat([all_points, df])
            
    # Keep only unique grid IDs
    unique_points = all_points.drop_duplicates(subset=['grid_id']).reset_index(drop=True)
    print(f"Total unique grid points to process: {len(unique_points)}")
    
    if len(unique_points) == 0:
        print("No grid points found.")
        return

    # Convert to Earth Engine FeatureCollection in chunks to avoid payload limits
    # For large datasets, it's better to upload as an Asset, but let's try direct conversion if small,
    # or export the points to a CSV, upload to GEE asset, and then process.
    # A 5km grid for 6 regions might be around 10,000 points. Let's see!
    
    chunk_size = 5000
    for i in range(0, len(unique_points), chunk_size):
        chunk = unique_points.iloc[i:i+chunk_size]
        features = []
        for _, row in chunk.iterrows():
            geom = ee.Geometry.Point([row['longitude'], row['latitude']])
            feat = ee.Feature(geom, {'grid_id': row['grid_id']})
            features.append(feat)
            
        fc = ee.FeatureCollection(features)
        
        # Datasets
        # ESA WorldCover 2021
        worldcover = ee.ImageCollection("ESA/WorldCover/v200").first()
        # WorldPop 2020
        worldpop = ee.ImageCollection("WorldPop/GP/100m/pop").filterBounds(fc.geometry()).mean()
        
        # Calculate Fractions in a 2.5km radius (since grid is 5km, half is 2.5km)
        # We will use reduceRegions
        
        def calculate_fractions(feature):
            buffer = feature.geometry().buffer(2500) # 2.5km radius
            
            # ESA Classes: 10: Trees, 20: Shrubland, 30: Grassland, 40: Cropland, 50: Built-up, 60: Bare/sparse, 80: Water
            # Population sum
            pop_sum = worldpop.reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=buffer,
                scale=100,
                maxPixels=1e9
            ).get('population')
            
            # WorldCover area by class
            area_image = ee.Image.pixelArea().addBands(worldcover)
            areas = area_image.reduceRegion(
                reducer=ee.Reducer.sum().group(
                    groupField=1,
                    groupName='class'
                ),
                geometry=buffer,
                scale=10,
                maxPixels=1e9
            )
            
            return feature.set('pop_sum', pop_sum, 'class_areas', areas.get('groups'))

        # Map over features
        processed_fc = fc.map(calculate_fractions)
        
        # Export to Drive
        task_name = f'Export_Infrastructure_Grid_Chunk_{i//chunk_size}'
        task = ee.batch.Export.table.toDrive(
            collection=processed_fc,
            description=task_name,
            folder='Myanmar_Agri_Infrastructure',
            fileFormat='CSV'
        )
        task.start()
        print(f"Started GEE Task: {task_name}")

if __name__ == "__main__":
    extract_landcover_features()
