import pandas as pd
from pathlib import Path

def aggregate_township_stats():
    base_dir = Path(__file__).resolve().parents[1]
    
    regions = [
        "gee_2018_2026", "gee_bago_2018_2026", "gee_mandalay_2018_2026", 
        "gee_sagaing_2018_2026", "gee_magway_2018_2026", "gee_yangon_2018_2026"
    ]
    
    all_data = []
    
    for reg in regions:
        parquet_path = base_dir / "data" / "output" / reg / "myanmar_agri_suitability_with_infra.parquet"
        if parquet_path.exists():
            df = pd.read_parquet(parquet_path)
            
            # Drop duplicates by grid_id so we only count spatial features once per grid point
            unique_grid = df.drop_duplicates(subset=['grid_id'])
            
            # Group by admin2_name (Township)
            # A 5km grid cell is approx 25 sq km.
            
            stats = unique_grid.groupby(['admin1_name', 'admin2_name']).agg(
                total_grid_cells=('grid_id', 'count'),
                avg_distance_to_main_road_km=('distance_to_main_road_km', 'mean'),
                avg_road_density=('main_road_density_km_per_sqkm', 'mean'),
                avg_distance_to_railway_km=('distance_to_railway_km', 'mean'),
                avg_distance_to_river_km=('distance_to_river_km', 'mean'),
                avg_population_density=('population_density', 'mean'),
                avg_urban_fraction=('urban_fraction', 'mean'),
                avg_cropland_fraction=('cropland_fraction', 'mean')
            ).reset_index()
            
            # Estimate area (1 cell = 25 sq km approx)
            stats['estimated_area_sqkm'] = stats['total_grid_cells'] * 25.0
            
            all_data.append(stats)
            
    if all_data:
        final_stats = pd.concat(all_data, ignore_index=True)
        
        # Save to macro data folder for dashboard
        out_dir = base_dir / "web" / "data" / "macro"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "township_infrastructure_stats.csv"
        final_stats.to_csv(out_path, index=False)
        print(f"Aggregated Township Statistics saved to {out_path}")
        
if __name__ == "__main__":
    aggregate_township_stats()
