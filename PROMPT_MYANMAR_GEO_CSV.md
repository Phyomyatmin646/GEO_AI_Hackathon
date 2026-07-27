# Copy-paste prompt: Myanmar စိုက်ပျိုးရေး Geo-CSV dataset

အောက်က prompt ကို Codex/ChatGPT code agent တစ်ခုတွင် ကူးထည့်အသုံးပြုနိုင်သည်။

```text
Myanmar နိုင်ငံအတွက် AI crop-suitability model train လုပ်ရန် real-data Geo-CSV pipeline တစ်ခု တည်ဆောက်ပေးပါ။ CSV အတု rows သို့မဟုတ် GB-size dummy data ကို chat ထဲတွင် မထုတ်ပါနှင့်။ အစား Google Earth Engine + Python code, config, tests, data dictionary, manifest, QA report ကို runnable project အဖြစ်ထုတ်ပေးပါ။

Scope
- Country: Myanmar (ISO3 MMR) only
- Spatial unit: EPSG:6933 equal-area 5 km × 5 km grid; centroid longitude/latitude ပါရမည်
- Time: monthly, 2018-01 through 2025-12
- One row = grid cell × month
- Target crops: monsoon_rice, dry_season_rice, maize, sugarcane, cassava, durian, mangosteen, longan, mango, chili, tomato

Data sources and transformations
1. Sentinel-2 `COPERNICUS/S2_SR_HARMONIZED`: cloud/shadow masked monthly median NDVI=(B8-B4)/(B8+B4), McFeeters NDWI=(B3-B8)/(B3+B8), NDMI=(B8-B11)/(B8+B11), valid scene count, cloud fraction. Leave cloud-missing indices null; never interpolate them.
2. Sentinel-1 `COPERNICUS/S1_GRD`: monthly median VV and VH (dB), optional support in monsoon cloud gaps.
3. `UCSB-CHG/CHIRPS/DAILY`: calendar-month rainfall and trailing-12-month rainfall in mm.
4. `ECMWF/ERA5_LAND/DAILY_AGGR`: monthly mean/min/max 2 m air temperature in °C, mean daily downward solar radiation in MJ m^-2 day^-1, layer-1 volumetric soil water in m³/m³.
5. SoilGrids 2.0: pH, sand, silt, clay, SOC, CEC at 0–5, 5–15, 15–30 cm. Produce thickness-weighted 0–30 cm values, applying SoilGrids unit conversions. Prefer official GEE community assets (`projects/soilgrids-isric/*_mean`). If unavailable, support local cached GeoTIFF or ISRIC WebDAV VRT fallback; do not depend on the unstable REST API. Preserve uncertainty availability/status, and do not invent uncertainty.
6. SRTM elevation, slope, aspect; JRC Global Surface Water occurrence and distance-to-recurrent-surface-water proxy. Clearly state that it is not a measured irrigation network.

Primary CSV schema
- Identity: sample_id, grid_id, year_month, longitude, latitude, admin0_name, admin1_name, admin2_name, spatial_block_id
- Terrain/soil/water: elevation_m, slope_degrees, aspect_degrees, surface_water_occurrence_pct, distance_to_surface_water_m, soil_ph_h2o_0_30cm, soil_sand_pct_0_30cm, soil_silt_pct_0_30cm, soil_clay_pct_0_30cm, soil_soc_g_kg_0_30cm, soil_cec_cmol_kg_0_30cm, soil_ph_h2o_uncertainty_pct
- Remote sensing and climate: ndvi_median, ndwi_mcf_median, ndmi_median, s2_valid_observation_count, s2_cloudy_pixel_fraction, s1_vv_db_median, s1_vh_db_median, chirps_precipitation_mm, monthly_rainfall_mm, annual_rainfall_mm, mean_temperature_c, min_temperature_c, max_temperature_c, solar_radiation_mj_m2_day, era5_soil_moisture_m3_m3, water_availability_score
- QA/provenance: s2_data_status, s1_data_status, soil_data_status, feature_missing_fraction, source_versions_json, processing_timestamp_utc
- For each crop: suitability_score__<crop> (0–100), is_suitable__<crop> (score >=70), label_source__<crop>, label_confidence__<crop>

Label policy
- Make transparent, provisional agronomic-rule scores using temperature, rainfall, pH, slope, solar radiation and water availability thresholds.
- Mark rules-only labels `rule_based`; their confidence must stay <=0.50.
- If an operator supplies real, geocoded, time-matched crop/yield evidence, blend it only into the label and mark `hybrid_rule_observed` or `observed` with provenance. Never use that observed label as a recommendation model feature. Never manufacture observed labels.
- NDWI/NDMI must be described as canopy/surface moisture proxies—not physical soil-moisture measurements.

Output and QA
- Produce `<name>.csv.gz`, `<name>.parquet`, `<name>_split_manifest.csv`, `data_dictionary.md`, `source_manifest.json`, `qa_report.json`.
- Preserve source ID/version/resolution/units and processing timestamp in rows/manifest.
- Do not globally normalize or impute features. Create five-fold spatial-block CV assignments and reserve 2025 as a temporal holdout.
- Test duplicate grid_id+year_month keys, Myanmar coordinate bounds, time range, pH/rainfall/radiation units/ranges, cloud-missing values, suitability score/boolean consistency, label provenance, source metadata and schema completeness.
- Include a dry-run GEE export command and require an explicit flag before actually starting cloud export tasks.
- If a resource catalog such as GeoAI CollabHub is supplied, classify every catalog group as data, processor, tutorial, dashboard, deployment tool, visualization tool, discovery portal, or excluded. A project page, dashboard, API/module, tutorial, or generic dataset directory is never a source observation by itself.
- Keep any approved external product in a separate provenance-controlled sidecar until its license, coverage, CRS, units, observation date, aggregation method, checksum, and leakage risk have been verified. Never place arbitrary external CSVs in the raw GEE export folder.
```
