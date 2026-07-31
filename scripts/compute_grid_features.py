import os
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
from pathlib import Path

# EPSG:6933 (WGS 84 / NSIDC EASE-Grid 2.0 Global) is an equal-area projection
# This ensures that distances and areas computed are consistent across the entire country
# overcoming the boundary issue of UTM Zones 46N and 47N.
PROJECTED_CRS = "EPSG:6933" 

def compute_distances(grid_gdf, target_gdf, name_prefix):
    """
    Computes the distance from each point in grid_gdf to the nearest geometry in target_gdf.
    Also computes line density within a 2.5km buffer.
    """
    print(f"Computing {name_prefix} distances using {PROJECTED_CRS}...")
    
    # Reproject both to projected CRS for accurate metric distances across zones
    grid_proj = grid_gdf.to_crs(PROJECTED_CRS)
    target_proj = target_gdf.to_crs(PROJECTED_CRS)
    
    # 1. Distance to nearest
    nearest_idx = target_proj.sindex.nearest(grid_proj.geometry, return_all=False, return_distance=True)
    distances_m = nearest_idx[1]
    grid_gdf[f'distance_to_{name_prefix}_km'] = distances_m / 1000.0
    
    # 2. Density in 2.5km buffer (Area = pi * 2.5^2 = 19.63 sq km)
    print(f"Computing {name_prefix} density...")
    
    buffers = grid_proj.copy()
    buffers['geometry'] = buffers.geometry.buffer(2500) # 2.5km radius
    
    joined = gpd.sjoin(buffers, target_proj, how="left", predicate="intersects")
    joined = joined.join(target_proj['geometry'], on='index_right', rsuffix='_target')
    
    valid_joins = joined.dropna(subset=['index_right'])
    
    if len(valid_joins) > 0:
        valid_joins['intersected_geom'] = valid_joins.geometry.intersection(gpd.GeoSeries(valid_joins['geometry_target'], crs=PROJECTED_CRS))
        valid_joins['length_km'] = valid_joins['intersected_geom'].length / 1000.0
        
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
    roads = gpd.read_file(infra_dir / "gis_osm_roads_free_1.shp")
    main_roads = roads[roads['fclass'].isin(['trunk', 'primary', 'secondary', 'tertiary'])]
    print(f"Loaded {len(main_roads)} main roads.")
    
    railways = gpd.read_file(infra_dir / "gis_osm_railways_free_1.shp")
    # Only keep actual rail lines (exclude abandoned, miniature, etc.)
    railways = railways[railways['fclass'].isin(['rail', 'light_rail', 'narrow_gauge', 'subway', 'tram'])]
    print(f"Loaded {len(railways)} valid railways.")
    
    rivers = gpd.read_file(infra_dir / "gis_osm_waterways_free_1.shp")
    # Only keep major rivers and canals
    rivers = rivers[rivers['fclass'].isin(['river', 'canal'])]
    print(f"Loaded {len(rivers)} valid rivers/canals.")
    
    regions = [
        "gee_2018_2026", "gee_bago_2018_2026", "gee_mandalay_2018_2026", 
        "gee_sagaing_2018_2026", "gee_magway_2018_2026", "gee_yangon_2018_2026"
    ]
    
    name_map = {
        'gee_2018_2026': 'ayeyawaddy',
        'gee_bago_2018_2026': 'bago',
        'gee_mandalay_2018_2026': 'mandalay',
        'gee_sagaing_2018_2026': 'sagaing',
        'gee_magway_2018_2026': 'magway',
        'gee_yangon_2018_2026': 'yangon'
    }
    
    for reg in regions:
        print(f"\nProcessing grid for {reg}...")
        
        # Load the parquet file
        reg_name = name_map[reg]
        parquet_path = base_dir / "data" / "output" / reg / f"{reg_name}_agri_suitability_with_infra.parquet"
        if not parquet_path.exists():
            parquet_path = base_dir / "data" / "output" / reg / "myanmar_agri_suitability.parquet"
            
        if not parquet_path.exists():
            print(f"Data not found for {reg}")
            continue
            
        df = pd.read_parquet(parquet_path)
        
        unique_points = df.drop_duplicates(subset=['grid_id']).copy()
        geometry = [Point(xy) for xy in zip(unique_points.longitude, unique_points.latitude)]
        grid_gdf = gpd.GeoDataFrame(unique_points, geometry=geometry, crs="EPSG:4326")
        
        grid_gdf = compute_distances(grid_gdf, main_roads, "road") # Changed to 'road' to align with target naming
        grid_gdf = compute_distances(grid_gdf, railways, "railway")
        grid_gdf = compute_distances(grid_gdf, rivers, "river")
        
        cols_to_keep = [
            'grid_id', 
            'distance_to_road_km', 'road_density_km_per_sqkm',
            'distance_to_railway_km', 'railway_density_km_per_sqkm',
            'distance_to_river_km', 'river_density_km_per_sqkm'
        ]
        
        # Drop old columns if they exist
        old_cols = ['distance_to_main_road_km', 'main_road_density_km_per_sqkm', 
                    'distance_to_road_km', 'road_density_km_per_sqkm',
                    'distance_to_railway_km', 'railway_density_km_per_sqkm',
                    'distance_to_river_km', 'river_density_km_per_sqkm']
        existing_old = [c for c in old_cols if c in df.columns]
        if existing_old:
            df = df.drop(columns=existing_old)
            
        features_df = grid_gdf[cols_to_keep]
        df = df.merge(features_df, on='grid_id', how='left')
        
        # Add metadata columns
        df['data_source'] = "ERA5, CHIRPS, SoilGrids, OpenStreetMap, ESA WorldCover v200, JRC GSW1_4, WorldPop"
        df['source_date'] = "2024-07"
        df['source_version'] = "v1.1"
        df['quality_flag'] = 1 # Valid
        
        out_path = base_dir / "data" / "output" / reg / f"{reg_name}_agri_suitability_with_infra.parquet"
        out_csv = out_path.with_suffix('.csv')
        df.to_parquet(out_path, index=False)
        df.to_csv(out_csv, index=False)
        print(f"Saved updated dataset to {out_path.name}")

if __name__ == "__main__":
    main()
