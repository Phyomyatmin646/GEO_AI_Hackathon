"""
Flood Impact Ground Truth to GEE Grid Join Logic.
Spatially joins ground truth observations with Earth Engine 5km grid cells.
"""
import logging

try:
    import pandas as pd
    import geopandas as gpd
    from shapely.geometry import Point
    HAS_GEOPANDAS = True
except ImportError:
    HAS_GEOPANDAS = False

def join_ground_truth_to_grid(ground_truth_csv: str, grid_geojson: str, output_csv: str) -> bool:
    """
    Joins the flood ground truth CSV to the 5km grid using Geopandas.
    """
    if not HAS_GEOPANDAS:
        logging.error("Geopandas is required for spatial join.")
        return False
        
    try:
        # Load ground truth
        df = pd.read_csv(ground_truth_csv)
        # Drop rows with invalid coordinates
        df = df.dropna(subset=['latitude', 'longitude'])
        
        # Create GeoDataFrame
        geometry = [Point(xy) for xy in zip(df.longitude, df.latitude)]
        gdf_obs = gpd.GeoDataFrame(df, geometry=geometry, crs="EPSG:4326")
        
        # Load grid
        gdf_grid = gpd.read_file(grid_geojson)
        # Reproject obs to match grid if necessary
        if gdf_obs.crs != gdf_grid.crs:
            gdf_obs = gdf_obs.to_crs(gdf_grid.crs)
            
        # Spatial join
        joined = gpd.sjoin(gdf_obs, gdf_grid, how="inner", predicate="within")
        
        # Save output
        joined.drop(columns=['geometry']).to_csv(output_csv, index=False)
        logging.info(f"Successfully joined and saved to {output_csv}")
        return True
    except Exception as e:
        logging.error(f"Join failed: {e}")
        return False
