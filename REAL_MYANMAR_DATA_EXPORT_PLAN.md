# Real Myanmar-only data export plan

This project is prepared to create a large, clean training table, but it does
**not** currently contain a completed primary Geo-CSV. The two CSV files in
`data/output/` are resource-audit metadata only. This distinction prevents a
demo file from being mistaken for real Myanmar observations.

## What will be real

Every final primary-table row will describe a 5 km grid cell whose centroid is
inside Myanmar, for one calendar month from `2018-01` through `2025-12`.
Global products are clipped or sampled inside Myanmar only; they are not
treated as observations from another country.

| Feature family | Myanmar-area data source | Main fields | Status / limitation |
| --- | --- | --- | --- |
| Satellite optical | Sentinel-2 SR Harmonized | NDVI, McFeeters NDWI, NDMI, optical scene/cloud QA | Real 10–20 m imagery; 2017–18 availability must be measured, and cloudy pixels stay null. |
| Satellite radar | Sentinel-1 GRD | VV/VH, scene count | Real SAR support in cloud-heavy months; it does not fill an optical value invisibly. |
| Rain | CHIRPS v3 monthly final GeoTIFF | monthly and trailing-12-month rainfall | Real monthly rainfall extract; the cache contains global rasters but only Myanmar centroid samples enter the table. |
| Climate / solar / soil water | ERA5-Land Daily Aggregated | temperature, solar radiation, volumetric soil-water | Modelled reanalysis in physical units. `NDWI`/`NDMI` must never be called soil-moisture measurements. |
| Soil | SoilGrids 0–30 cm | pH, sand/silt/clay, SOC, CEC, pH uncertainty | Global model sampled only in Myanmar; local laboratory results supersede it. |
| Terrain / water history | SRTM + JRC Global Surface Water | elevation, slope, aspect, historical water occurrence/distance | JRC is historical and ends in 2021; do not present it as 2022–25 monthly water truth. |
| Crop-label calibration | Official Myanmar MMSIS / CSO / MOALI statistics and permitted field records | aggregate sown/harvested area, production, crop records | Aggregate statistics are evaluated at their true admin/year level only; they are never copied into every 5 km row. |

The project excludes the supplied `flood.csv`, `train.csv`, and
`CovidDeaths.csv` from training because they are not traceable Myanmar
crop/soil/climate observations. A syntactically clean CSV is not necessarily a
valid agricultural training dataset.

## Expected size — naturally, not artificially

Myanmar has roughly 26,000–30,000 5 km pilot cells. At 96 monthly records per
cell, the finished table will normally have about **2.5–2.9 million rows** and
roughly 75–100 columns. The actual size depends on the final grid edge cells,
null values, compression and Parquet encoding:

| Deliverable | Expected natural size | Use |
| --- | --- | --- |
| `myanmar_agri_suitability.csv.gz` | approximately 0.3–1.2 GB | Compatibility with ordinary CSV tools. |
| Expanded `.csv` after decompression | approximately 1–4 GB | Inspection only; do not duplicate it to make it larger. |
| `myanmar_agri_suitability.parquet` | approximately 0.2–0.8 GB | Preferred model-training format. |
| Raw CHIRPS v3 cache | about 2 GB for 96 global monthly TIFFs | Required local source cache; only Myanmar samples are used in output. |

These are planning estimates, not a promise to pad a file to a particular
number of gigabytes. Accuracy comes from source/label quality, leakage-safe
validation and coverage—not file size.

## Current export architecture

The Earth Engine account and Cloud project are authorized. The original
country-wide one-month polygon reduction proved too expensive for a pilot.
The default has therefore been changed to a split, regional-first
architecture:

- 5 km equal-area cell centroids for the fast pilot sampling path;
- static soil, terrain and water features exported once;
- the capped JRC water-distance proxy calculated on a documented 1 km mask
  instead of a 1,667-pixel native-resolution neighbourhood;
- dynamic satellite and climate features exported once per month;
- explicit `--admin1` regional smoke tests before a Myanmar-wide run.

This preserves stable 5 km grid IDs but treats the feature values as
centroid samples, not polygon-wide means. For a later production-quality
polygon-mean export, change `earth_engine.sampling_geometry` from `centroid`
to `cell` and budget substantially more Earth Engine compute.

Confirm saved authorization before creating a new task:

```bash
.venv/bin/python -m myanmar_agri_geo.cli ee-auth-check --config config/default.yaml
```

## Reproducible production sequence

1. Confirm a one-month, one-region pilot without changing external state:

   ```bash
   myanmar-agri-geo gee-export --config config/default.yaml \
     --admin1 Ayeyawaddy --start 2018-01 --end 2018-02 \
     --feature-set split --dry-run
   ```

   This should report one static task plus one monthly-dynamic task. Only
   after reviewing that plan should the same command be run with
   `--start-tasks`.

2. Download the official final CHIRPS v3 cache. This is an explicit download
   because the pipeline must not silently substitute the Earth Engine CHIRPS
   staging layer for v3:

   ```bash
   .venv/bin/python -m myanmar_agri_geo.cli prepare-chirps --config config/default.yaml --download
   ```

   If an Internet connection interrupts a long download, retrieve one year at
   a time instead; the cache manifest still records the whole configured
   project period:

   ```bash
   .venv/bin/python -m myanmar_agri_geo.cli prepare-chirps --config config/default.yaml \
     --start-month 2018-01 --end-month 2018-12 --download
   ```

3. Start the two regional pilot tasks:

   ```bash
   myanmar-agri-geo gee-export --config config/default.yaml \
     --admin1 Ayeyawaddy --start 2018-01 --end 2018-02 \
     --feature-set split --start-tasks
   ```

   Inspect both task IDs and the resulting Drive CSVs. Confirm unique
   `grid_id` values and expected row counts before increasing the region or
   date range. A full 2018–2025 country export should be the final scale-up,
   not the first validation run.

4. Download every completed GEE CSV to `data/raw/gee/`. Do not add unrelated
   CSVs to this directory.

5. Assemble, validate and retain provenance:

   ```bash
   .venv/bin/python -m myanmar_agri_geo.cli assemble --config config/default.yaml
   .venv/bin/python -m myanmar_agri_geo.cli validate --config config/default.yaml --strict
   ```

The final files appear in `data/output/`: compressed CSV, Parquet, split
manifest, data dictionary, source manifest and QA report. Train from Parquet
when possible; use CSV.gz only where a tool requires CSV. If a program truly
requires a plain `.csv` like the example files, append `--plain-csv` to the
`assemble` command; it explicitly writes the same clean rows as a multi-GB
uncompressed compatibility file.

## Label truth and achievable accuracy

The environmental feature table can be completely real and Myanmar-only.
That does **not** mean all 11 crop-suitability labels are observed ground
truth. Until legitimate Myanmar field records are added, the current crop
labels are transparent `rule_based` screening labels with confidence capped at
0.50.

| Crop group | Legitimate calibration route | What must not be claimed yet |
| --- | --- | --- |
| Rice, maize, sugarcane, cassava, chilli | Official Myanmar state/region or township statistics where coverage/date/crop identity are verified; consented field records | 5 km crop-presence truth derived from an admin total. |
| Tomato, mango, durian | Verify official record granularity and crop definition before using aggregate evaluation; collect field labels for strong evaluation | A verified nationwide grid label from aggregate reports. |
| Mangosteen, longan | Acquire permitted, dated Myanmar field/crop observations first | High-accuracy model performance or observed labels. |

Use the official statistics as **aggregate calibration/evaluation side tables**.
Never use a crop area, harvested area, production value or yield observation as
a feature for a recommendation model. Never use a random-row split: reserve
2025 for temporal holdout and use 0.5-degree spatial blocks for the remaining
cross-validation.

## Release gates before calling it “clean”

- No duplicate `grid_id + year_month`; coordinates inside the Myanmar boundary.
- 2018-01 through 2025-12 coverage reported explicitly, including any missing
  month/cell records.
- Source name, version, resolution, unit, processing time and raw-file checksum
  in the manifest; per-row cloud/scene/missingness flags preserved.
- No hidden cloud-gap, rainfall, soil or label imputation. Null remains null
  with a quality reason.
- Physical-unit ranges pass QA: pH 0–14, non-negative rain/radiation, valid
  coordinate/date ranges and score/boolean consistency.
- Train-only scaling and imputation; no global normalization before splits.
- Model report broken down by crop, state/region, label source and missingness;
  never report an overall accuracy alone.

## Primary source links

- [Sentinel-2 SR Harmonized Earth Engine catalog](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED)
- [Sentinel-1 GRD Earth Engine catalog](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD)
- [CHIRPS v3 official data](https://www.chc.ucsb.edu/data/chirps3)
- [ERA5-Land daily aggregates Earth Engine catalog](https://developers.google.com/earth-engine/datasets/catalog/ECMWF_ERA5_LAND_DAILY_AGGR)
- [SoilGrids documentation](https://docs.isric.org/globaldata/soilgrids/index.html)
- [Myanmar MMSIS crop-statistics table](https://mmsis.gov.mm/statHtml/statHtml.do?conn_path=I2&orgId=195&tblId=DT_YAE_0032_NEW)
