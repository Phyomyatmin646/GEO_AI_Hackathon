import ee
import os

ee.Initialize(project=os.environ.get("GEE_PROJECT", "gen-lang-client-0956667941"))
col = ee.ImageCollection("UCSB-CHC/CHIRPS/DAILY")
latest = col.limit(1, "system:time_start", False).first()
date = ee.Date(latest.get("system:time_start")).format("YYYY-MM-dd").getInfo()
print("Latest CHIRPS DAILY date:", date)
