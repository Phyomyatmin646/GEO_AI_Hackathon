# Myanmar Agricultural GeoAI Pipeline - Audit Report
**Date:** 2026-07-28
**Scope:** Step 1 Project Audit

## 1. Repository State & Git Status
- **Git Status:** Clean baseline with recent local modifications (i18n additions in `web/` and regional GEE exports). User changes have been preserved.
- **Codebase Integrity:** Working Python pipeline (`src/myanmar_agri_geo`), Next.js/vinext application (`web/`), and test suite (`tests/`).

## 2. Feature Implementation Status

| Feature / Component | Status | Notes |
| :--- | :--- | :--- |
| **Data Extraction Pipeline** | Implemented and verified | Connects to GEE, pulls Sentinel, CHIRPS, ERA5, SoilGrids |
| **Grid Generation** | Implemented and verified | 5 km equal-area EPSG:6933 grid |
| **Rule-based Recommendations** | Implemented and verified | Baseline rules present; NO trained model yet |
| **Real Observed Labels** | **Missing** | Template exists, but actual real labels are 0 |
| **Weak vs Observed separation**| Planned only | Architecture supports it, but data is empty |
| **AI Model Training** | **Missing** | Deep learning / calibration models not yet built |
| **Accuracy / Metrics Evaluation**| Cannot verify | Impossible to calculate without ground truth labels |
| **CSV / CSV.gz Export** | Implemented and verified | Produced for Ayeyawaddy pilot |
| **Parquet Export** | Implemented and verified | Produced for Ayeyawaddy pilot |
| **Myanmar/English Support** | Implemented and verified | Added via React Context in the web app |
| **FAQ CSV Integration** | **Missing** | Needs to be imported, schema validated, and served |
| **Interactive Map & API** | Partially implemented | Serves JSON pilot bundle, but needs dynamic backend |
| **Climate Change Risk Flags** | Planned only | UI placeholder exists; backend anomaly logic missing |

## 3. Strict Compliance Checks

1. **Real-data export:** ✅ Yes, physical environment variables (weather, soil) are real data.
2. **CSV/Parquet generation:** ✅ Yes, generated in `data/output/pilot_ayeyawaddy_2018_01/`.
3. **Real observed labels:** ❌ No. 0 records.
4. **Weak vs Observed separated:** ⚠️ Framework exists, but not populated.
5. **AI model trained:** ❌ No. Rule-based only.
6. **Myanmar/English support:** ✅ Yes (Basic UI strings translated).
7. **FAQ integration:** ❌ No.
8. **Hard-coded demo results:** ⚠️ The Web app uses a statically generated JSON pilot file. Not strictly hard-coded, but not dynamically querying a live DB yet.
9. **Automated high-risk decisions:** ✅ No. Stated explicitly as an advisory tool.

## 4. Blockers & Missing Evidence
- **Blocker 1 (Model Training):** Zero real observed ground-truth labels. Cannot train or evaluate an AI model until `data/raw/observed/field_observations.csv` is populated with real farmer/agronomic data.
- **Blocker 2 (Climate Change Data):** Need to implement the 30-year baseline normal calculation for CHIRPS and ERA5 to calculate true anomalies.
- **Missing Evidence (FAQ):** The `Agriculture.csv` FAQ dataset is external and needs ingestion.
- **Missing Evidence (Database):** Web app needs an actual database (like D1/SQLite or Postgres) to support dynamic querying for the 2018-2025 nationwide data, as static JSON will not scale.
