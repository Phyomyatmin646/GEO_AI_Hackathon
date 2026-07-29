import os
import urllib.request
import zipfile
from pathlib import Path

def download_and_extract_geofabrik():
    """
    Downloads the latest OpenStreetMap shapefiles for Myanmar from Geofabrik
    and extracts them into the data/raw/infrastructure directory.
    """
    base_dir = Path(__file__).resolve().parents[1]
    output_dir = base_dir / "data" / "raw" / "infrastructure"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    zip_path = output_dir / "myanmar-latest-free.shp.zip"
    url = "https://download.geofabrik.de/asia/myanmar-latest-free.shp.zip"
    
    if not zip_path.exists():
        print(f"Downloading OSM Shapefiles for Myanmar from {url}...")
        urllib.request.urlretrieve(url, zip_path)
        print("Download complete.")
    else:
        print("OSM Shapefiles already downloaded.")
        
    print("Extracting shapefiles...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(output_dir)
        
    print(f"All infrastructure shapefiles extracted to {output_dir}")
    print("Important layers:")
    print("- gis_osm_roads_free_1.shp (Roads)")
    print("- gis_osm_railways_free_1.shp (Railways)")
    print("- gis_osm_water_a_free_1.shp / gis_osm_waterways_free_1.shp (Rivers & Water)")

if __name__ == "__main__":
    download_and_extract_geofabrik()
