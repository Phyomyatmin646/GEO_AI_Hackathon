import os
import shutil
import subprocess

regions = ["ayeyawaddy", "magway", "mandalay", "sagaing", "bago__e"]
base_dir = "/Users/phyomyatmin/Desktop/myanmar-agri-geo-csv-pipeline"
raw_gee = os.path.join(base_dir, "data/raw/gee")
temp_gee = os.path.join(base_dir, "data/raw/gee_temp")

# move all files to temp
os.makedirs(temp_gee, exist_ok=True)
for f in os.listdir(raw_gee):
    if f.endswith(".csv"):
        shutil.move(os.path.join(raw_gee, f), os.path.join(temp_gee, f))

for region in regions:
    print(f"Processing {region}...")
    # move this region's files back to raw_gee
    for f in os.listdir(temp_gee):
        if region in f:
            shutil.move(os.path.join(temp_gee, f), os.path.join(raw_gee, f))
    
    # run assemble
    subprocess.run([f"{base_dir}/.venv/bin/myanmar-agri-geo", "assemble"], cwd=base_dir, check=True)
    
    # we need to hack the manifest project scope_admin1 so build-web-pilot works
    import json
    manifest_path = os.path.join(base_dir, "data/output/source_manifest.json")
    with open(manifest_path, "r") as f:
        manifest = json.load(f)
    manifest["project"]["scope_admin1"] = region.capitalize()
    manifest["project"]["end_month"] = "2018-01"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f)
        
    # run build-web-pilot
    output_json = os.path.join(base_dir, f"data/output/pilot_{region}_2018_01.json")
    subprocess.run([
        f"{base_dir}/.venv/bin/myanmar-agri-geo", "build-web-pilot",
        "--input", os.path.join(base_dir, "data/output/myanmar_agri_suitability.csv.gz"),
        "--qa-report", os.path.join(base_dir, "data/output/qa_report.json"),
        "--source-manifest", manifest_path,
        "--output", output_json
    ], cwd=base_dir, check=True)
    
    # copy to web/data
    web_data_dir = os.path.join(base_dir, "web/data/output", f"pilot_{region}_2018_01")
    os.makedirs(web_data_dir, exist_ok=True)
    shutil.copy(output_json, os.path.join(web_data_dir, f"pilot_{region}_2018_01.json"))
    
    # move files back to temp_gee
    for f in os.listdir(raw_gee):
        if f.endswith(".csv"):
            shutil.move(os.path.join(raw_gee, f), os.path.join(temp_gee, f))

# restore all files to raw_gee
for f in os.listdir(temp_gee):
    shutil.move(os.path.join(temp_gee, f), os.path.join(raw_gee, f))
os.rmdir(temp_gee)
print("Done!")
