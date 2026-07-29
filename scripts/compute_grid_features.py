import os
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
from pathlib import Path

# EPSG:32646 is a UTM projection suitable for Myanmar (Zone 46N covers most, 47N covers East)
# Using EPSG:32646 for distance calculations in meters
PROJECTED_CRS = "EPSG:32646" 

def compute_distances(grid_gdf, target_gdf, name_prefix):
    """
    Computes the distance from each point in grid_gdf to the nearest geometry in target_gdf.
    Also computes line density within a 2.5km buffer.
    """
    print(f"Computing {name_prefix} distances...")
    
    # Reproject both to projected CRS for accurate metric distances
    grid_proj = grid_gdf.to_crs(PROJECTED_CRS)
    target_proj = target_gdf.to_crs(PROJECTED_CRS)
    
    # 1. Distance to nearest
    # sindex.nearest is very fast in GeoPandas
    nearest_idx = target_proj.sindex.nearest(grid_proj.geometry, return_all=False, return_distance=True)
    
    # nearest_idx returns a tuple: (indices_of_grid, indices_of_target), distances
    # Since return_all=False, it returns exactly one match per input geometry
    distances_m = nearest_idx[1]
    grid_gdf[f'distance_to_{name_prefix}_km'] = distances_m / 1000.0
    
    # 2. Density in 2.5km buffer (Area = pi * 2.5^2 = 19.63 sq km)
    print(f"Computing {name_prefix} density...")
    # This can be slow for many points. An alternative is spatial join.
    # For speed, we will skip precise line clipping and just do a spatial join to find lines intersecting buffer,
    # but actual density requires length. Let's do a fast spatial join.
    
    buffers = grid_proj.copy()
    buffers['geometry'] = buffers.geometry.buffer(2500) # 2.5km radius
    
    # Spatial join buffers with target lines
    joined = gpd.sjoin(buffers, target_proj, how="left", predicate="intersects")
    
    # For joined geometries, we should ideally clip the line to the buffer to get exact length.
    # To save time, we will just use the length of the intersecting segment?
    # This is an approximation. A true intersection is better but slow.
    # Let's do true intersection only for matching pairs.
    
    # We need the original target geometries
    joined = joined.join(target_proj['geometry'], on='index_right', rsuffix='_target')
    
    # Drop rows where there is no intersection
    valid_joins = joined.dropna(subset=['index_right'])
    
    if len(valid_joins) > 0:
        # Calculate intersection length
        valid_joins['intersected_geom'] = valid_joins.geometry.intersection(gpd.GeoSeries(valid_joins['geometry_target'], crs=PROJECTED_CRS))
        valid_joins['length_km'] = valid_joins['intersected_geom'].length / 1000.0
        
        # Group by grid index and sum lengths
        density_sums = valid_joins.groupby(valid_joins.index)['length_km'].sum()
        
        # Density = total length (km) / Area (19.63 sq km)
        grid_gdf[f'{name_prefix}_density_km_per_sqkm'] = 0.0
        grid_gdf.loc[density_sums.index, f'{name_prefix}_density_km_per_sqkm'] = density_sums / 19.63
    else:
        grid_gdf[f'{name_prefix}_density_km_per_sqkm'] = 0.0
        
    return grid_gdf

def main():
    base_dir = Path(__file__).resolve().parents[1]
    infra_dir = base_dir / "data" / "raw" / "infrastructure"
    
    print("Loading OSM infrastructure shapefiles...")
    # Load Roads (only main roads to speed up, e.g. trunk, primary, secondary)
    roads = gpd.read_file(infra_dir / "gis_osm_roads_free_1.shp")
    main_roads = roads[roads['fclass'].isin(['trunk', 'primary', 'secondary', 'tertiary'])]
    print(f"Loaded {len(main_roads)} main roads.")
    
    # Load Railways
    railways = gpd.read_file(infra_dir / "gis_osm_railways_free_1.shp")
    print(f"Loaded {len(railways)} railways.")
    
    # Load Waterways
    rivers = gpd.read_file(infra_dir / "gis_osm_waterways_free_1.shp")
    print(f"Loaded {len(rivers)} rivers.")
    
    regions = [
        "gee_2018_2026", "gee_bago_2018_2026", "gee_mandalay_2018_2026", 
        "gee_sagaing_2018_2026", "gee_magway_2018_2026", "gee_yangon_2018_2026"
    ]
    
    for reg in regions:
        parquet_path = base_dir / "data" / "output" / reg / "myanmar_agri_suitability.parquet"
        if not parquet_path.exists():
            continue
            
        print(f"\nProcessing grid for {reg}...")
        df = pd.read_parquet(parquet_path)
        
        # Since we have time series (multiple years per grid_id), we should compute 
        # spatial features only for unique grid points, then merge back to save time.
        
        unique_points = df.drop_duplicates(subset=['grid_id']).copy()
        
        # Convert to GeoDataFrame
        geometry = [Point(xy) for xy in zip(unique_points.longitude, unique_points.latitude)]
        grid_gdf = gpd.GeoDataFrame(unique_points, geometry=geometry, crs="EPSG:4326")
        
        # Compute distances and densities
        grid_gdf = compute_distances(grid_gdf, main_roads, "main_road")
        grid_gdf = compute_distances(grid_gdf, railways, "railway")
        grid_gdf = compute_distances(grid_gdf, rivers, "river")
        
        # Select only the new columns + grid_id
        cols_to_keep = [
            'grid_id', 
            'distance_to_main_road_km', 'main_road_density_km_per_sqkm',
            'distance_to_railway_km', 'railway_density_km_per_sqkm',
            'distance_to_river_km', 'river_density_km_per_sqkm'
        ]
        features_df = grid_gdf[cols_to_keep]
        
        # Merge back to original dataframe
        df = df.merge(features_df, on='grid_id', how='left')
        
        # Save updated parquet
        out_path = base_dir / "data" / "output" / reg / "myanmar_agri_suitability_with_infra.parquet"
        df.to_parquet(out_path, index=False)
        print(f"Saved updated dataset to {out_path.name}")

if __name__ == "__main__":
    main()
