# Myanmar Agricultural Geo-CSV Pipeline

Myanmar နိုင်ငံအတွက် crop-suitability research dataset တည်ဆောက်ရန် reproducible pipeline ဖြစ်ပါသည်။ Chat ထဲတွင် GB-size CSV အတု မထုတ်ပေးဘဲ၊ public geospatial sources ကို Google Earth Engine (GEE) နှင့် Python ဖြင့် စုစည်းပြီး provenance, QA, CSV, Parquet အဖြစ် ထုတ်ပေးသည်။

Code agent အခြားတစ်ခုကို တူညီသည့် pipeline တည်ဆောက်ခိုင်းလိုပါက [copy-paste Burmese prompt](PROMPT_MYANMAR_GEO_CSV.md) ကိုသုံးနိုင်သည်။

The project is mapped explicitly to the ASEAN GeoAI Solution Canvas in
[MYANMAR_GEOAI_SOLUTION_CANVAS.md](MYANMAR_GEOAI_SOLUTION_CANVAS.md), including
what is implemented today and what needs real-data/label validation next.
The checked end-to-end data, QA, API, and application path is documented in
[docs/SYSTEM_FLOW.md](docs/SYSTEM_FLOW.md).

> ဒီ dataset ၏ rule-based suitability labels များသည် **provisional research labels** သာဖြစ်သည်။ မြေစစ်ဆေးမှု၊ ဒေသခံ agronomist review, irrigation/flood/drainage, land tenure, pests, market conditions မပါဘဲ production crop recommendation အဖြစ် မသုံးပါနှင့်။

## What it builds

- Myanmar-wide 5 km equal-area grid; one record per grid cell per month, January 2018–December 2025.
- Sentinel-2 cloud-masked NDVI, McFeeters NDWI, and NDMI; Sentinel-1 VV/VH is retained for monsoon optical-cloud gaps.
- CHIRPS rainfall, ERA5-Land temperature/solar radiation/physical soil-water, terrain, JRC surface-water proxies, and SoilGrids 0–30 cm soil features.
- Suitability fields for monsoon rice, dry-season rice, maize, sugarcane, cassava, durian, mangosteen, longan, mango, chili, and tomato.
- `CSV.gz`, Parquet, split manifest, data dictionary, provenance manifest, and JSON QA report.
- A reproducible real-pilot web bundle, versioned cell API, true 5 km map
  geometry, honest insufficient-evidence abstention, and per-cell CSV reports.
- A CollabHub resource-audit CSV and a pending external-feature manifest. These
  are metadata, not a claim that a dashboard, tutorial, or model module is an
  observation source.

Large primary Geo-CSV/Parquet and source caches remain under git-ignored
`data/raw/` and `data/output/`. The checked web artifact is a deterministic
JSON representation generated from a QA-passed release; it is not a
replacement for the primary data products.

The default export architecture is optimized for pilot work:

- The 5 km equal-area grid is represented by cell centroids during Earth
  Engine sampling. This is much cheaper than reducing every raster over every
  polygon. Set `earth_engine.sampling_geometry: "cell"` only when the slower
  polygon-mean production export is required.
- Static terrain, surface-water and soil features are exported once. Monthly
  satellite and climate features are exported separately and joined by
  `grid_id` during assembly.
- The capped JRC surface-water distance is an approximate 1 km-grid proximity
  proxy. Computing the same 50 km search at native 30 m resolution was the
  main static-task bottleneck.
- `--admin1` can restrict a smoke test to one GAUL state/region before any
  country-wide task is submitted.
- A regional release config must declare an exact
  `earth_engine.admin1_scope`; the CLI fails closed instead of silently
  submitting a nationwide task. Bago uses the separate exact `Bago (E)` and
  `Bago (W)` export configs before combined assembly.

## Real Myanmar data status

The current workspace contains QA-approved January 2018 releases for
Ayeyawaddy, Bago (East and West combined), Magway, Mandalay, and Sagaing:
**9,971 distinct 5 km cells in total**. Each region has a primary CSV, CSV.gz,
Parquet, QA report, source manifest, and full deterministic web bundle. The
environmental feature rows are real source-derived evidence; their crop
rankings remain provisional rules.

All five releases contain **zero observed crop labels** and therefore do not
claim trained-model accuracy. Monthly weather fields are present. Optional
1991–2020 same-calendar-month rainfall and temperature normals/anomalies are
implemented and unit-tested in the export pipeline, but a live climate-context
export and the regional re-exports are still required before those columns can
be published for every cell.

The observed-label validator is ready for real reviewed records and verifies
that each submitted longitude/latitude belongs to its declared 5 km
EPSG:6933 `grid_id`. The current web bundle remains a rule-only `v1` contract;
publishing observed-calibrated or trained-model predictions requires a new
versioned bundle/API contract after spatial validation and the 2025 holdout.

Random synthetic training CSVs, mock forecast models, unsourced macro
generators, and manifest-editing one-off scripts are deliberately excluded
from this product flow.

Myanmar-wide 2018–2025 export and observed-label acquisition remain pending.
The supplied generic flood/COVID CSVs remain excluded because they are not
verified Myanmar agricultural observations. See the [Phase 0
report](docs/PHASE0_REPORT.md), [Phase 1 report](docs/PHASE1_REPORT.md), and
[real-data export plan](REAL_MYANMAR_DATA_EXPORT_PLAN.md).

For genuine Myanmar crop-area/production statistics, use the separate
[official-statistics side-table guide](OFFICIAL_MYANMAR_CROP_STATS.md). Those
annual admin-level data calibrate/evaluate aggregate predictions; they never
become 5 km crop labels or model-input features.

## Quick start

Use Python 3.10+ in an isolated environment:

```bash
python -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e '.[full,dev]'
earthengine authenticate

# This must return earth_engine_ready: true before submitting exports.
myanmar-agri-geo ee-auth-check --config config/default.yaml
```

Review or copy [`config/default.yaml`](config/default.yaml), then perform the workflow:

```bash
# Inspect country/time/grid/crop settings without calling any external service.
myanmar-agri-geo plan --config config/default.yaml

# Write CollabHub resource decisions and conditional feature contracts. This is
# metadata-only; it needs neither Earth Engine nor a source download.
myanmar-agri-geo resource-audit --config config/default.yaml

# Download/cache the official CHIRPS v3 monthly files required for final
# rainfall values. The GEE CHIRPS collection is only a staging fallback.
myanmar-agri-geo prepare-chirps --config config/default.yaml --download

# A year-sized slice is useful when a connection is interrupted; repeat for
# the remaining years and the manifest will still describe the full period.
myanmar-agri-geo prepare-chirps --config config/default.yaml --start-month 2018-01 --end-month 2018-12 --download

# Inspect the full country plan only. It is deliberately too large for one
# submission; use bounded, versioned regional/month batches as shown below.
myanmar-agri-geo gee-export --config config/default.yaml --dry-run

# Recommended first pilot: use one versioned regional contract end to end.
# The split plan creates one static task plus one monthly-dynamic task.
myanmar-agri-geo gee-export \
  --config config/pilot_ayeyawaddy_2018_01.yaml \
  --feature-set split --dry-run
myanmar-agri-geo gee-export \
  --config config/pilot_ayeyawaddy_2018_01.yaml \
  --feature-set split --start-tasks

# After both regional tasks succeed, sync only their CSVs from the task's
# Destination URI folder into the raw GEE staging directory.
myanmar-agri-geo download-drive-exports \
  --config config/pilot_ayeyawaddy_2018_01.yaml \
  --folder-id DRIVE_FOLDER_ID \
  --prefix myanmar_agri_suitability_ayeyawaddy

# If the GEE SoilGrids community assets are unavailable, make an auditable
# local/WebDAV fallback manifest. Download or clip VRT/GeoTIFF layers to the
# configured soil cache before assembly if this fallback is needed. Set
# soilgrids.use_gee_community_assets=false before running the GEE export.
myanmar-agri-geo prepare-soil \
  --config config/pilot_ayeyawaddy_2018_01.yaml

# After both Drive export CSVs are downloaded into the regional raw directory:
myanmar-agri-geo assemble \
  --config config/pilot_ayeyawaddy_2018_01.yaml
myanmar-agri-geo validate \
  --config config/pilot_ayeyawaddy_2018_01.yaml --strict

# Publish a web bundle only from the QA-approved CSV and its matching
# provenance files. The default includes every cell in the regional release.
myanmar-agri-geo build-web-pilot \
  --input data/output/pilot_ayeyawaddy_2018_01/myanmar_agri_suitability_ayeyawaddy_2018_01.csv \
  --qa-report data/output/pilot_ayeyawaddy_2018_01/qa_report.json \
  --source-manifest data/output/pilot_ayeyawaddy_2018_01/source_manifest.json \
  --output web/data/output/pilot_ayeyawaddy_2018_01/pilot_ayeyawaddy_2018_01.json

# Create the field/official-record contract. The template contains headers only;
# it never creates or suggests fake observations.
myanmar-agri-geo observed-label-template

# Keep only real, approved, provenance-backed records. This writes separate
# accepted/rejected CSVs and observed_labels_qa_report.json.
myanmar-agri-geo validate-observed-labels \
  --config config/default.yaml \
  --input data/raw/observed/field_observations.csv

# Compare aggregate predictions with a separately downloaded official table.
# The official values remain evaluation-only and never become 5 km labels.
myanmar-agri-geo official-stats-template
myanmar-agri-geo compare-official-stats \
  --config config/default.yaml \
  --predictions data/evaluation/admin1_predictions.csv \
  --official data/raw/official/myanmar_crop_statistics.csv
```

The defaults write these artefacts under `data/output/`:

```text
myanmar_agri_suitability.csv.gz
myanmar_agri_suitability.parquet
myanmar_agri_suitability_split_manifest.csv
data_dictionary.md
source_manifest.json
qa_report.json
collabhub_resource_audit.csv
external_feature_manifest.csv
```

Use compressed CSV for broad compatibility and Parquet for training at scale. The implementation does not pad or duplicate records to manufacture a target file size.
If a program genuinely requires an uncompressed `.csv`, request it explicitly:

```bash
myanmar-agri-geo assemble --config config/default.yaml --plain-csv
```

That writes the same validated rows as an additional, potentially multi-GB
compatibility file. The final assembly stops before publishing CSV/Parquet if
the configured row-level missingness gate fails; its QA report records the
reason rather than silently filling source values.

## CollabHub resource audit

The [CollabHub audit](COLLABHUB_RESOURCE_AUDIT.md) preserves the public-source
contract. HYDRAFloods, Mekong Drought & Crop Watch, and the Regional Land
Cover Mapping System are only **conditional sidecar candidates**: an official
downloadable Myanmar-appropriate release must first pass license, coverage,
date, CRS, unit, checksum, missingness, and leakage checks.

OpenGeoAI water, field-delineation, land-cover, training-data, and export
examples are optional processors or implementation references that operate on
the project's own inputs. They are not source data. The site’s telecom/open
network datasets, mapping libraries, MLOps tools, learning material, and
unreviewed project pages are excluded from primary-table ingestion.

Never place arbitrary external CSVs in `data/raw/gee/`; it is reserved for
completed GEE exports. Stage a vetted source in `data/raw/external/<source_id>/`
and retain its provenance in the external-feature manifest before writing an
adapter.

## Data contract

Every primary-table row contains `grid_id`, `year_month`, centroid coordinates, terrain, soil, water, climate/solar, remote-sensing features, source-quality flags, and four labels for every crop:

```text
suitability_score__<crop>   # 0–100; null when feature coverage is insufficient
is_suitable__<crop>         # default: score >= 70
label_source__<crop>        # rule_based | hybrid_rule_observed | observed
label_confidence__<crop>    # rules-only labels are deliberately low-confidence (default cap: 0.45)
```

Physical values are not globally normalized. The split manifest assigns 0.5-degree spatial blocks for five-fold spatial cross-validation and reserves 2025 as a temporal holdout. Fit scaling/imputation only on each training fold.

`NDWI` and `NDMI` are surface/canopy-moisture proxies; they are **not** physical soil-moisture measurements. The physical soil-water field comes from ERA5-Land and is explicitly named `era5_soil_moisture_m3_m3`.

## Labels and observed records

The bundled profiles are broad, transparent agronomic thresholds—not measured crop outcomes. They are automatically marked `rule_based` with limited confidence.

To calibrate with permitted, geocoded Myanmar observations, first copy
[`data/templates/observed_labels_template.csv`](data/templates/observed_labels_template.csv).
One row represents one reviewed `grid_id + year_month + crop_id` target. It must
contain a real crop-presence, suitability, yield, planting, or harvest
observation plus:

- source type, organization and traceable source reference;
- agronomist/extension/crop-scientist/data-steward approval;
- informed consent, official-public basis, approved research basis, or a data
  sharing agreement;
- Myanmar coordinates and a stated location precision of 5 km or better;
- `is_synthetic=false`.

Direct farmer identifiers are forbidden. Synthetic, pending-review,
out-of-bounds, duplicate, or untraceable rows are written to a rejected file
and cannot enter calibration. Accepted 2018–2024 rows receive deterministic
0.5-degree spatial folds; all 2025 rows are locked to `temporal_holdout`.

Only after `validate-observed-labels` passes should
`project.observed_labels_path` point to
`data/output/observed_labels_accepted.csv`. Observed records are label targets,
never model inputs, and missing observed labels never trigger synthetic values.

## Interactive application

The `web/` application serves the five QA-approved January 2018 regional
releases through `/api/v1/cells?region=<region>`. Selecting a true 5 km
EPSG:6933-derived cell shows real measured features, provisional crop scores,
positive/limiting factors, missingness, uncertainty, source links, release/QA
hashes, and a downloadable UTF-8 CSV report. Cells below the evidence threshold
display an abstention instead of a fabricated recommendation.

The UI states that environmental features are real while recommendations are
rule-based and not observed/trained-AI results. Device-local feedback is never
auto-merged into training labels. The old `/api/cells` endpoint remains only
as a truthfully deprecated compatibility route.

Run it locally with:

```bash
cd web
npm install
npm run dev
```

Verify it with:

```bash
npm run lint
npm test
```

## Source notes

| Source | Role |
| --- | --- |
| Sentinel-2 SR Harmonized | 10 m surface reflectance and vegetation/water indices |
| Sentinel-1 GRD | SAR VV/VH support during cloud-heavy months |
| CHIRPS v3 monthly | final rainfall cache, sampled locally at grid centroids; GEE CHIRPS v2 is staging-only unless an explicit fallback is allowed |
| ERA5-Land Daily Aggregated | temperature, downward solar radiation, and physical soil water |
| SoilGrids 2.0 | 0–30 cm pH, texture, SOC, CEC; GEE community assets first, WebDAV VRT/local cache fallback |
| SRTM | elevation, slope, and aspect |
| JRC Global Surface Water | static surface-water occurrence/distance proxy |
| FAO GAUL | Myanmar boundary/context |

The GEE backend records source identifiers in each row and writes detailed source and file hashes into `source_manifest.json`. Observe each provider's license, attribution, and access terms before distributing any derived data.

## QA gates

`validate` checks unique `grid_id + year_month` keys, Myanmar coordinates, the 2018–2025 time window, units/ranges, quality metadata, suitability score/boolean consistency, label provenance/confidence, missingness, and the final shared schema. It does not silently impute cloud-missing satellite records.

Run the included tests with:

```bash
python -m pytest
```

## Early Warning and Impact Analysis

The pipeline includes an active early warning system for predicting severe weather and flood impacts, and directly alerting farmers via SMS.

- **Flood Impact Analysis**: `flood_impact_join.py` and `flood_impact_labels.py` combine grid features with flood risk data to assess potential impact on specific crops.
- **Daily Monitoring**: `daily_gee_monitor.py` tracks near-real-time weather parameters (like CHIRPS precipitation) via Google Earth Engine to detect anomalies.
- **SMS Broadcasting**: `early_warning_sms.py` integrates with **SMSPoh** (and optionally EasySendSMS) to send customized, localized alerts directly to registered farmers in affected regions.

Trigger the SMS broadcast pipeline manually or via cron:

```bash
# Check conditions and broadcast SMS for a specific region
myanmar-agri-geo send-early-warning --region Yangon --send --severity-min NORMAL
```

## Scope boundary

This release builds the geo-suitability dataset, validates real observed-label
contracts, compares official aggregate statistics, and serves an explainable
map/API pilot. It does not yet claim a trained production model or measured
accuracy. Planting/harvest calendar prediction still needs sufficient verified
crop-stage event time series beyond accepting those dates in the label contract.

---

# မြန်မာနိုင်ငံ စိုက်ပျိုးရေးနှင့် ဘူမိ-ပထဝီဝင် ဒေတာပိုက်လိုင်း (Myanmar Agricultural Geo-CSV Pipeline) - အသေးစိတ် စနစ်လမ်းညွှန်

ဤမှတ်တမ်းသည် **Myanmar Agricultural Geo-CSV Pipeline** ဟုခေါ်သော မြန်မာနိုင်ငံတစ်ဝှမ်းလုံးအတွက် သီးနှံစိုက်ပျိုးရန် သင့်တော်မှု (Crop Suitability) ၊ ရာသီဥတုဘေးအန္တရာယ် (ရေကြီးမှု/မုန်တိုင်း) ထိခိုက်နိုင်ခြေများ နှင့် စိုက်ပျိုးရေးကဏ္ဍဆိုင်ရာ ခန့်မှန်းချက်ပေါင်း (၄၀) ခုကို အလိုအလျောက် တွက်ချက်ပေးသည့် ခေတ်မီ Machine Learning Data Pipeline စနစ်ကြီးတစ်ခုလုံး၏ အသေးစိတ် အလုပ်လုပ်ပုံကို အစအဆုံး ရှင်းလင်းတင်ပြထားသော မှတ်တမ်းဖြစ်ပါသည်။ 

## ၁။ စီမံကိန်း၏ နောက်ခံသမိုင်းကြောင်းနှင့် ရည်ရွယ်ချက် (Background and Objectives)

မြန်မာနိုင်ငံသည် စိုက်ပျိုးရေးကို အဓိကထားသော နိုင်ငံဖြစ်သော်လည်း၊ နေရာဒေသအလိုက် မြေဆီလွှာအခြေအနေ၊ ရာသီဥတု ပြောင်းလဲမှု၊ သီးနှံစိုက်ပျိုးရန် သင့်တော်မှု အချက်အလက်များ (Data) မှာ အလွန် ရှားပါးနေဆဲ ဖြစ်ပါသည်။ ထို့ကြောင့် ဤပရောဂျက်ကို အောက်ပါ ရည်ရွယ်ချက်များဖြင့် တည်ဆောက်ခဲ့ခြင်း ဖြစ်ပါသည် -
1. **Machine Learning Model များအတွက် Data တည်ဆောက်ခြင်း:** AI/ML မော်ဒယ် ၄၀ ခုကို လေ့ကျင့်ရာတွင် လိုအပ်သည့် အရည်အသွေးမြင့်မားသော မြေပြင်နှင့် ဂြိုဟ်တု ဒေတာ (Training Datasets) များကို 5-fold Cross-Validation စနစ်ဖြင့် တိကျစွာ ဖန်တီးပေးရန်။
2. **5km အကွက်ငယ်လေးများအဖြစ် ပိုင်းခြားတွက်ချက်ခြင်း:** တစ်နိုင်ငံလုံးကို ၅ ကီလိုမီတာ (5km) အကျယ်အဝန်းရှိသော Grid အကွက်ငယ်လေးများအဖြစ် (EPSG:6933 Equal-area Projection) ပိုင်းခြားပြီး ၂၀၁၈ ခုနှစ်မှစ၍ ယနေ့အထိ လစဉ် အချက်အလက်များကို တိကျစွာ မှတ်တမ်းတင်ရန်။
3. **ရာသီဥတုဘေးအန္တရာယ် ကြိုတင်သတိပေးခြင်း:** တောင်သူများအနေဖြင့် ရေကြီးမှု၊ လေပြင်းတိုက်မှု စသည့် သဘာဝဘေးအန္တရာယ်များကို ကြိုတင်သိရှိနိုင်ရန် ဂြိုဟ်တုအချက်အလက်များနှင့် မိုးလေဝသခန့်မှန်းချက်များကို အလိုအလျောက်ချိတ်ဆက်ပြီး Early Warning SMS များ အချိန်မီ ပေးပို့ရန်။

## ၂။ တွက်ချက်ပေးနေသော Machine Learning မော်ဒယ် (၄၀) မျိုး (40 ML Targets)

စနစ်သည် Random Forest Algorithm (Classifier & Regressor) များကို အသုံးပြုပြီး သီးနှံသင့်တော်မှု၊ ရာသီဥတုဘေးအန္တရာယ်နှင့် စီးပွားရေးဆိုင်ရာ အညွှန်းကိန်းပေါင်း (၄၀) ခု (Models 40) ကို အရေးပါမှုအဆင့်အလိုက် (High, Medium, Low) ခွဲခြားတွက်ချက်ပေးပါသည်။

### (က) အလွန်အရေးပါသော မော်ဒယ် (၁၁) ခု (HIGH IMPORTANCE)
1. **မိုးစပါး စိုက်ပျိုးရန် သင့်တော်မှု** (crop_suitability_monsoon_rice) - Classification
2. **နွေစပါး စိုက်ပျိုးရန် သင့်တော်မှု** (crop_suitability_dry_season_rice) - Classification
3. **မတ်ပဲ စိုက်ပျိုးရန် သင့်တော်မှု** (crop_suitability_black_gram) - Classification
4. **မြေပဲ စိုက်ပျိုးရန် သင့်တော်မှု** (crop_suitability_groundnut) - Classification
5. **သီးနှံကျန်းမာရေး အခြေအနေ** (crop_health_score) - Regression
6. **တစ်ဟက်တာ အထွက်နှုန်း ခန့်မှန်းချက်** (crop_yield_t_ha) - Regression
7. **ရေသွင်းရန် လိုအပ်မှု** (irrigation_need) - Classification
8. **ရေကြီးနိုင်ခြေ အဆင့်** (flood_risk_level) - Classification
9. **မိုးခေါင်နိုင်ခြေ ရမှတ်** (drought_risk_score) - Regression
10. **အပူဒဏ်ခံရနိုင်ခြေ** (heat_stress_risk) - Classification
11. **စိုက်ပျိုးရေး GDP ခန့်မှန်းချက်** (agricultural_gdp_forecast) - Regression

### (ခ) အလတ်စား အရေးပါသော မော်ဒယ် (၂၅) ခု (MEDIUM IMPORTANCE)
**သီးနှံသင့်တော်မှုများ (Crop Suitability):**
12. **ပြောင်း** (crop_suitability_maize)
13. **ကြံ** (crop_suitability_sugarcane)
14. **ပီလောပီနံ** (crop_suitability_cassava)
15. **ငရုတ်** (crop_suitability_chili)
16. **ခရမ်းချဉ်** (crop_suitability_tomato)
17. **ပဲတီစိမ်း** (crop_suitability_green_gram)
18. **ပဲစဉ်းငုံ** (crop_suitability_pigeon_pea)
19. **နှမ်း** (crop_suitability_sesame)
20. **ရော်ဘာ** (crop_suitability_rubber)

**ရာသီဥတုနှင့် သဘာဝပတ်ဝန်းကျင် (Climate & Environment):**
21. ယခုလ မိုးရေချိန် (current_month_precipitation_mm)
22. ယခုလ ပျမ်းမျှအပူချိန် (current_month_mean_temperature_c)
23. ယခုလ နေရောင်ခြည်ရရှိမှု (current_month_solar_rad_mj_m2_day)
24. မြေဆီလွှာ တိုက်စားခံရနိုင်ခြေ (soil_erosion_risk)
25. မျက်နှာပြင် ရေရရှိနိုင်မှု (surface_water_occurrence)
26. ရေရှားပါးနိုင်ခြေ (water_scarcity_risk)

**စိုက်ပျိုးရေး လိုအပ်ချက်နှင့် ထုတ်လုပ်မှု (Agri Requirements):**
27. အကောင်းဆုံး စိုက်ပျိုးရမည့်လ (optimal_planting_month)
28. နိုက်ထရိုဂျင် လိုအပ်မှုအဆင့် (nitrogen_requirement_level)
29. ဖော့စဖရပ်စ် လိုအပ်မှုအဆင့် (phosphorus_requirement_level)
30. ရေပေးဝေနိုင်မှု အလားအလာ (irrigation_potential)

**စီးပွားရေးနှင့် ဈေးကွက် (Economics & Market):**
31. ဈေးကွက် ချိတ်ဆက်နိုင်မှု ရမှတ် (market_integration_score)
32. ရိတ်သိမ်းပြီးနောက် လေလွင့်ဆုံးရှုံးနိုင်ခြေ (post_harvest_loss_risk)
33. ကုန်စည်စီးဆင်းမှု ကွန်ရက် အားကောင်းမှု (supply_chain_efficiency)
34. အအေးခန်း သိမ်းဆည်းနိုင်မှု အလားအလာ (cold_chain_potential)
35. စိုက်ပျိုးမြေ အသွင်ပြောင်းခံရနိုင်ခြေ (agricultural_land_conversion_risk)
36. မြို့ပြချဲ့ထွင်မှုကြောင့် ခြိမ်းခြောက်ခံရနိုင်ခြေ (urban_encroachment_risk)

### (ဂ) သာမန် အရေးပါသော မော်ဒယ် (၄) ခု (LOW IMPORTANCE)
37. **ဒူးရင်း** (crop_suitability_durian)
38. **မင်းကွတ်** (crop_suitability_mangosteen)
39. **တညင်း** (crop_suitability_longan)
40. **သရက်** (crop_suitability_mango)

## ၃။ အသုံးပြုထားသော ရင်းမြစ်များနှင့် အရေးပါမှု အလေးချိန် (Data Sources & Feature Weights)

အထက်ပါ မော်ဒယ် ၄၀ ခုကို တိကျစွာ တွက်ချက်နိုင်ရန် အောက်ပါ ဂြိုဟ်တုဒေတာများနှင့် အပင်စိုက်ပျိုးမှု ဒေတာများကို အလေးပေး (Feature Weights) တွက်ချက်ထားပါသည်။

**၁။ အပင်စိုက်ပျိုးမှုဆိုင်ရာ အချက်အလက်များ (Crop Area Features):**
မော်ဒယ်များ တွက်ချက်ရာတွင် သီးနှံစိုက်ပျိုးမှု ရာခိုင်နှုန်း (Crop Area Percentages) ကို အရေးအကြီးဆုံး (Weight အများဆုံး) အဖြစ် သတ်မှတ်ထားပါသည်။
* မိုးစပါး စိုက်ပျိုးမှု ရာခိုင်နှုန်း (Weight: 3.5)
* နွေစပါး စိုက်ပျိုးမှု ရာခိုင်နှုန်း (Weight: 3.0)
* နှမ်း၊ မြေပဲ၊ မတ်ပဲ၊ ပဲတီစိမ်း၊ ပဲစဉ်းငုံ စိုက်ပျိုးမှု (Weight: 2.5)
* ပြောင်း၊ ကြံ၊ ပီလောပီနံ စိုက်ပျိုးမှု (Weight: 2.0)

**၂။ ရာသီဥတုနှင့် မြေအောက်ရေ (Climate & Soil Moisture - CHIRPS & ERA5):**
* မြေအောက်ရေပါဝင်မှု (era5_soil_moisture_m3_m3_mean) ကို Weight 3.0 ဖြင့် အလွန်အရေးပါသော အချက်အဖြစ် သတ်မှတ်ထားပါသည်။
* မိုးရေချိန် (chirps_precipitation_mm_mean) Weight: 2.5
* ပျမ်းမျှအပူချိန် (mean_temperature_c_mean) Weight: 2.0

**၃။ မြေဆီလွှာ အခြေအနေ (SoilGrids 2.0):**
* မြေဆီဩဇာ (soil_soc_g_kg_0_30cm) ကို Weight 3.0 ဖြင့် သတ်မှတ်ထားသည်။
* မြေဆီလွှာ အချဉ်အငန်ဓာတ် (pH) နှင့် CEC ကို Weight 2.5 ဖြင့် တွက်ချက်ပါသည်။
* သဲ၊ ရွှံ့ ပါဝင်မှု (Sand, Clay, Silt) ကို Weight 1.2 မှ 1.5 အထိ ပေးထားပါသည်။

**၄။ ဂြိုဟ်တုပုံရိပ်များ (Sentinel-1 & 2):**
* မြေပြင် စိမ်းလန်းမှု အညွှန်းကိန်း (ndvi_median_mean) ကို Weight 2.5 သတ်မှတ်ထားသည်။
* ရေငွေ့ပါဝင်မှု အညွှန်းကိန်း (ndwi_mcf_median_mean) Weight: 2.0
* SAR ရေဒါ (s1_vh_db_median_mean) ကို Weight 1.3 ဖြင့် တိမ်ထူသောအချိန်များတွင် တွက်ချက်ရန် သုံးပါသည်။

**၅။ မြေပြင် အနေအထား (SRTM & JRC):**
* ရေအရင်းအမြစ်နှင့် အကွာအဝေး (distance_to_surface_water_m) Weight: 1.8
* မြေပြင်အနိမ့်အမြင့် (elevation_m) Weight: 1.8
* ဆင်ခြေလျှော (slope_degrees) Weight: 1.5

## ၄။ စနစ်တစ်ခုလုံး၏ ပိုက်လိုင်း အဆင့်ဆင့် အလုပ်လုပ်ပုံ (System Architecture & Pipeline Flow)

System ကြီးတစ်ခုလုံး အလုပ်လုပ်ပုံကို အဓိက အပိုင်းကြီး (၄) ပိုင်း ခွဲခြားနိုင်ပါသည်။

### အပိုင်း (၁): Google Earth Engine (GEE) မှ ဒေတာများ ဆွဲယူခြင်း (Export Pipeline)
စနစ်သည် Google Earth Engine (GEE) သို့ အလိုအလျောက် ချိတ်ဆက်ပြီး 5km အကွက်ငယ်လေးများအဖြစ် တစ်နိုင်ငံလုံးကို ပိုင်းခြားကာ (Split Processing) လစဉ် ပြောင်းလဲနေသော မိုးလေဝသနှင့် ဂြိုဟ်တုပုံရိပ်များကို တွက်ချက်၍ Google Drive သို့ ထုတ်ပေး (Export) ပါသည်။

### အပိုင်း (၂): Data များကို ပေါင်းစပ်ခြင်းနှင့် Model Training (Assembly & Interactive Training)
`myanmar-agri-geo assemble` ဖြင့် ဂြိုဟ်တုဒေတာများနှင့် မြေဆီလွှာ ဒေတာများကို ပေါင်းစပ်ကာ Final CSV ထုတ်ပေးပါသည်။
ထို့နောက် `train_interactive.py` Script မှတဆင့် အဆိုပါ ဒေတာများကို ရယူကာ **မော်ဒယ် (၄၀) ခုလုံးကို (Trees 500 ပါဝင်သော Random Forest ဖြင့်) 5-fold Cross-Validation နည်းလမ်းသုံးပြီး အလိုအလျောက် လေ့ကျင့် (Train) ပေးပါသည်။**

### အပိုင်း (၃): [အသစ်] မြေပြင် ကောက်ယူမှုများနှင့် ရေကြီးမှု/မုန်တိုင်း အတည်ပြုစနစ် (Ground Truth & Flood Impact)
* **SMS Parser System (`sms_parser.py`):** 
  တောင်သူများက သတင်းပို့လာသော SMS များကို စနစ်က အလိုအလျောက် ဖတ်ရှုပြီး `flood_impact_template.csv` ထဲသို့ သပ်ရပ်စွာ ထည့်သွင်းပေးပါသည်။
* **GeoPandas Spatial Join (`flood_impact_labels.py`):**
  SMS မှရရှိလာသော မြေပြင်တည်နေရာသည် ဂြိုဟ်တုမှ တွက်ချက်ထားသော ရေကြီးသည့် 5km အကွက် (Grid) နှင့် ထပ်တူကျမှု ရှိ/မရှိ (Spatial Join) တွက်ချက်ပြီး၊ မှန်ကန်ပါက Verified (အတည်ပြု) စာရင်းအဖြစ် သတ်မှတ်ပါသည်။

### အပိုင်း (၄): [အသစ်] အလိုအလျောက် ကြိုတင်သတိပေး SMS စနစ် (Early Warning Broadcaster Module)
ရေကြီးမှုနှင့် မုန်တိုင်းအန္တရာယ်ကို အချိန်မီ သတိပေးနိုင်သော စနစ်ဖြစ်ပါသည်။ 
1. **မိုးလေဝသ ခန့်မှန်းချက်:** Open-Meteo API မှ လာမည့် ၃ ရက်စာ မိုးရေချိန်နှင့် လေတိုက်နှုန်း။
2. **ဂြိုဟ်တု စောင့်ကြည့်မှု:** GEE Monitor မှ လက်ရှိ ရေကြီးနေမှု အခြေအနေ (Sentinel-1)။
3. **DMH Priority:** မိုး/ဇလ ၏ တရားဝင် သတိပေးချက်။
အထက်ပါ အချက်အလက်များအပေါ် မူတည်ပြီး `NORMAL`, `WATCH`, `WARNING`, `EMERGENCY` အန္တရာယ်အဆင့် သတ်မှတ်ကာ တောင်သူများထံသို့ အချိန်မီ SMS သတိပေးချက်များ ပေးပို့ပေးပါသည်။

## ၅။ အသုံးပြုထားသော နည်းပညာများနှင့် Framework များ (Technologies Used)

ပရောဂျက်တစ်ခုလုံးကို လုံခြုံစိတ်ချရပြီး၊ မြန်ဆန်မှုရှိစေရန် အောက်ပါ ခေတ်မီနည်းပညာများဖြင့် ဖွဲ့စည်းတည်ဆောက်ထားပါသည်။

1. **Machine Learning & Data Processing:**
   * **Python 3.10+**: စနစ်တစ်ခုလုံး၏ အဓိက ဦးနှောက် (Core Logic)။
   * **Scikit-learn**: Random Forest Classifier နှင့် Regressor မော်ဒယ် (၄၀) ခုကို လေ့ကျင့်ရန်။
   * **Pandas & GeoPandas**: ကြီးမားသော CSV Data များကို တွက်ချက်ရန်နှင့် မြေပုံသြဒီနိတ်များ (Spatial Joins) တွက်ချက်ရန်။
2. **Geospatial Processing (မြေပုံ တွက်ချက်မှု):**
   * **Google Earth Engine (GEE API)**: ကမ္ဘာ့အကြီးဆုံး ဂြိုဟ်တုဒေတာ စုဆောင်းမှုစနစ်ကြီးကို လှမ်းချိတ်ပြီး တွက်ချက်ရန်။
3. **APIs (ပြင်ပ ချိတ်ဆက်မှုများ):**
   * **Open-Meteo API**: အခမဲ့နှင့် တိကျသော မိုးလေဝသ ခန့်မှန်းချက်များ ရယူရန်။
4. **Data Formats (ဖိုင် အမျိုးအစားများ):**
   * **CSV (.csv)** နှင့် **Parquet (.parquet)**: Machine Learning မော်ဒယ်များ အလွန်မြန်ဆန်စွာ Data ဖတ်နိုင်ရန်။
   * **Pickle (.pkl)**: Train လုပ်ပြီးသား မော်ဒယ်များကို သိမ်းဆည်းရန်။
5. **Quality Assurance (စမ်းသပ်စစ်ဆေးခြင်း):**
   * **Pytest**: Module အသစ်များ (Early Warning SMS, SMS Parser) ရေးသားပြီးတိုင်း စနစ်တစ်ခုလုံး မချို့ယွင်းသွားစေရန် Test Cases ပေါင်း (၁၀၀) ကျော်ဖြင့် အမြဲတမ်း စစ်ဆေးပေးသော စနစ်။

## ၆။ နိဂုံး (Conclusion)

**Myanmar Agricultural Geo-CSV Pipeline** သည် ရိုးရှင်းသော Data သိမ်းဆည်းသည့်စနစ် သက်သက်မဟုတ်ဘဲ၊ ကမ္ဘာ့အဆင့်မီ ဂြိုဟ်တုနည်းပညာများ (Earth Observation) နှင့် Data Science နည်းပညာများကို မြန်မာနိုင်ငံ၏ စိုက်ပျိုးရေးကဏ္ဍတွင် တိုက်ရိုက်အသုံးချနိုင်စေရန် တည်ဆောက်ထားသော **Comprehensive GeoAI Pipeline** ကြီးတစ်ခု ဖြစ်ပါသည်။ 

သီးနှံစိုက်ပျိုးမှု၊ ရာသီဥတုနှင့် စီးပွားရေးဆိုင်ရာ အချက်အလက် **၄၀ မျိုး (40 ML Models)** ကို တိကျစွာ တွက်ချက်ပေးရုံသာမက၊ ယခုအသစ် ထပ်မံဖြည့်စွက်လိုက်သော **"ရေကြီးမှု/မုန်တိုင်း အတည်ပြုစနစ်"** နှင့် **"အလိုအလျောက် သတိပေး SMS (Early Warning) စနစ်"** တို့ကြောင့်၊ မြန်မာတောင်သူများ၏ အသက်အိုးအိမ်စည်းစိမ်နှင့် စိုက်ပျိုးရေးကဏ္ဍကို လက်တွေ့ကျကျ ကာကွယ် အကျိုးပြုနိုင်မည့် အလွန်အရေးပါသော နည်းပညာ ပလက်ဖောင်းကြီး တစ်ခုဖြစ်ပါကြောင်း အသေးစိတ် မှတ်တမ်းတင် တင်ပြအပ်ပါသည်။
