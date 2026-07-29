import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "default.yaml"

def run_export(admin1: str, start_year: int, folder_prefix: str):
    start_month = f"{start_year}-01"
    end_month = f"{start_year + 1}-01"
    folder_name = f"{folder_prefix}_{start_year}"
    
    cmd = [
        sys.executable, "-m", "myanmar_agri_geo.cli",
        "gee-export",
        "--config", str(DEFAULT_CONFIG),
        "--admin1", admin1,
        "--start", start_month,
        "--end", end_month,
        "--destination", "drive",
        "--folder", folder_name,
        "--feature-set", "split",
        "--start-tasks"
    ]
    
    print(f"Queuing tasks for {admin1} ({start_year}) into folder '{folder_name}'...")
    env = os.environ.copy()
    env["PYTHONPATH"] = str(PROJECT_ROOT / "src")
    subprocess.run(cmd, cwd=PROJECT_ROOT, env=env, check=True)

def main():
    years = range(2018, 2027) # 2018 to 2026 inclusive
    for year in years:
        # Export Bago (E)
        run_export("Bago (E)", year, "bago")
        # Export Bago (W)
        run_export("Bago (W)", year, "bago")

    print("All tasks for Bago (2018-2026) have been successfully queued!")

if __name__ == "__main__":
    main()
