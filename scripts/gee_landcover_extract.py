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
    
    print("Collecting unique grid points from assembled data...")
    regions = [
        "gee_2018_2026", "gee_bago_2018_2026", "gee_mandalay_2018_2026", 
        "gee_sagaing_2018_2026", "gee_magway_2018_2026", "gee_yangon_2018_2026"
    ]
    
    all_points = pd.DataFrame()
    for reg in regions:
        # Check for both parquet names
        parquet_path = base_dir / "data" / "output" / reg / f"{reg.replace('gee_', '').replace('_2018_2026', '') if reg != 'gee_2018_2026' else 'ayeyawaddy'}_agri_suitability_with_infra.parquet"
        if not parquet_path.exists():
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
        
        # JRC Global Surface Water
        jrc_water = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
        seasonality = jrc_water.select('seasonality')
        # Permanent water is seasonality == 12
        permanent_water = seasonality.eq(12)
        
        def calculate_features(feature):
            buffer = feature.geometry().buffer(2500) # 2.5km radius
            
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
            
            # Permanent water area
            water_area_image = ee.Image.pixelArea().updateMask(permanent_water)
            water_area = water_area_image.reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=buffer,
                scale=30,
                maxPixels=1e9
            ).get('area')
            
            return feature.set('pop_sum', pop_sum, 'class_areas', areas.get('groups'), 'permanent_water_area_m2', water_area)

        processed_fc = fc.map(calculate_features)
        
        task_name = f'Export_Infrastructure_v2_Grid_Chunk_{i//chunk_size}'
        task = ee.batch.Export.table.toDrive(
            collection=processed_fc,
            description=task_name,
            folder='Myanmar_Agri_Infrastructure_v2',
            fileFormat='CSV'
        )
        task.start()
        print(f"Started GEE Task: {task_name}")

if __name__ == "__main__":
    extract_landcover_features()
