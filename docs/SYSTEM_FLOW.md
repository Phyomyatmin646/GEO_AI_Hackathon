# System Flow and Release Gates

Last checked: 2026-07-29

This document describes the implemented path from public geospatial sources to
the bilingual map. It also separates what is already published from work that
is only prepared or still missing.

## End-to-end flow

```text
Official remote sources
  ├─ Sentinel-2 / Sentinel-1
  ├─ CHIRPS v3 precipitation
  ├─ ERA5-Land weather and physical soil-water
  ├─ SRTM terrain
  ├─ JRC surface-water history
  └─ SoilGrids soil properties
          │
          ▼
Google Earth Engine processing
  ├─ EPSG:6933 equal-area 5 km grid
  ├─ one static export per regional job
  └─ one dynamic export per month
          │ asynchronous Export.table.toDrive tasks
          ▼
Authenticated user's Google Drive
  └─ myanmar_agri_geo_exports/
          │ explicit download/sync
          ▼
Region-isolated raw staging
  └─ data/raw/gee/pilot_<region>_<period>/
          │
          ▼
Python assembly
  ├─ join static and monthly rows by grid_id
  ├─ replace staging rainfall from the official CHIRPS v3 cache
  ├─ attach source and quality fields
  ├─ calculate transparent rule-based crop scores
  └─ assign spatial folds and the 2025 temporal holdout
          │
          ▼
QA publication gate
  ├─ schema, uniqueness, coordinate and missingness checks
  ├─ source/provenance manifest and artifact hashes
  └─ fail closed: a failed release cannot become a web bundle
          │
          ▼
Versioned regional release
  ├─ primary CSV / CSV.gz / Parquet
  ├─ split manifest
  ├─ qa_report.json
  └─ source_manifest.json
          │ deterministic build-web-pilot command
          ▼
Validated web JSON bundle
          │ runtime validation
          ▼
Versioned API
  ├─ GET /api/v1/cells?region=<region>
  └─ GET /api/v1/cells/<cell_id>/report.csv?region=<region>
          │
          ▼
Myanmar / English application
  ├─ true 5 km cell polygons
  ├─ measured feature evidence
  ├─ provisional crop rankings and reasons
  ├─ uncertainty / missing-data state
  └─ selected-cell evidence CSV download
```

Earth Engine performs a submitted export on Google's infrastructure. Closing
the terminal, switching off Wi-Fi, or shutting down the submitting laptop does
not cancel a running task. A successful task stops by itself after it writes
the export to Drive. The local Python assembly is a separate step and only
runs while the local machine or chosen server is running.

## Current release inventory

All rows below are real January 2018 environmental feature rows derived from
the documented remote sources. They are not observed crop-presence or yield
labels.

| Region | QA-approved 5 km cells | QA errors | Publication status |
| --- | ---: | ---: | --- |
| Ayeyawaddy | 1,344 | 0 | Primary release and web bundle |
| Bago (East + West combined) | 1,549 | 0 | Primary release and web bundle |
| Magway | 1,781 | 0 | Primary release and web bundle |
| Mandalay | 1,531 | 0 | Primary release and web bundle |
| Sagaing | 3,766 | 0 | Primary release and web bundle |
| **Total** | **9,971** | **0** | Five-region pilot |

## Evidence status

| Capability | Current status | Meaning |
| --- | --- | --- |
| Monthly weather | Available in the regional releases | CHIRPS precipitation plus ERA5-Land temperature, solar radiation, and physical soil-water fields |
| Historical climate context | Pipeline implemented; regional re-export pending | Optional 1991–2020 same-calendar-month rainfall and temperature normals/anomalies; these are not attribution, forecasts, or future scenarios |
| Crop recommendation | Available as rules | A transparent research baseline; it is not a trained AI prediction and confidence is not model accuracy |
| Observed crop ground truth | Missing | Current observed-label count is zero |
| Observed-label QA | Implemented, no records supplied | Rejects synthetic/unreviewed/PII-bearing records and verifies each coordinate maps to its declared EPSG:6933 grid ID |
| Model training and accuracy | Not started | Training must wait for accepted, traceable crop-presence/yield/planting/harvest observations |
| Spatial validation | Split contract implemented | Deterministic spatial blocks/folds are emitted for non-holdout years |
| 2025 holdout | Contract implemented | 2025 and later rows are excluded from spatial CV and marked temporal holdout |
| FAQ | 1,053 Myanmar seed records available | English interface is available; verified English FAQ translations are still pending and the UI falls back honestly |
| Macro, trade, disaster figures | Withheld pending verification | They are outside the QA-approved regional release until source, dates, units, license, and method pass provenance checks |

## Failure boundaries

- A Google Drive file is only a raw export. It is not automatically a clean,
  training-ready release.
- Assembly must not mix files from different regional jobs in one raw staging
  directory unless the release configuration explicitly combines them, as for
  Bago East and West.
- `qa_report.json.valid` must be true and release hashes must match before
  `build-web-pilot` publishes a bundle.
- Synthetic/demo records and real observations stay separate.
- Randomly generated “training” CSVs, mock forecast models, unsourced macro
  generators, and the old manifest-editing regional script are excluded from
  the product flow and have been removed from the deliverable.
- A FAQ record, annual administrative statistic, or rule score is not a 5 km
  observed crop label.
- Random row-level train/test splitting is prohibited. Spatial folds and the
  locked 2025 temporal holdout are the release contract.
- The map must show an insufficient-evidence state instead of inventing a crop
  recommendation when required factors are missing.
- The current `v1` web bundle intentionally accepts rule-only recommendations.
  A separate versioned observed/model prediction contract is required before
  calibrated labels or trained predictions can be published to the UI.

## Operational checks

Use these checks in order for a new regional/monthly release:

```bash
myanmar-agri-geo plan --config CONFIG.yaml
myanmar-agri-geo ee-auth-check --config CONFIG.yaml
myanmar-agri-geo gee-export --config CONFIG.yaml --dry-run
myanmar-agri-geo gee-export --config CONFIG.yaml --start-tasks
earthengine --project PROJECT_ID task list

myanmar-agri-geo download-drive-exports \
  --config CONFIG.yaml \
  --folder-id DRIVE_FOLDER_ID \
  --prefix RELEASE_PREFIX

myanmar-agri-geo assemble --config CONFIG.yaml
myanmar-agri-geo validate --config CONFIG.yaml --strict
myanmar-agri-geo build-web-pilot \
  --input RELEASE.csv \
  --qa-report qa_report.json \
  --source-manifest source_manifest.json \
  --output web/data/output/RELEASE/RELEASE.json
```

For the application:

```bash
cd web
npm run lint
npm test
```

Regional export configs must set an exact
`earth_engine.admin1_scope`. The CLI refuses a scoped release config that
would otherwise expand silently to a nationwide export. Bago is a composite
product region in this project, so export its exact GAUL parts with the Bago
East and Bago West configs and assemble them into the combined Bago release.
The CLI also refuses a single submission above 24 tasks. Country-scale,
multi-year extraction must be partitioned into versioned regional/month
batches; static evidence is exported once and dynamic evidence is submitted
separately. This avoids a single accidental quota-heavy 97-task launch.

The checked `scripts/export_ayeyawaddy.py` helper is plan-only by default and
reproduces only the versioned January 2018 Ayeyawaddy contract.
`--start-tasks` remains an explicit quota-consuming action. A wider date range
must first receive its own versioned regional config, raw/output directories,
and manifest/QA contract.

The production deployment is a separate controlled step. It should only
publish the exact locally validated source state and must not silently upload
unreviewed raw files, credentials, or unverified datasets.

## Pilot architecture versus long-term product

The checked JSON/API design is appropriate for this five-region, one-month
pilot. It is not the final storage/query design for nationwide monthly data
over 10–15 years. A production expansion should keep the same data and QA
contracts while replacing whole-region JSON responses with:

- partitioned Parquet or a spatial database for canonical feature storage;
- object storage for immutable, versioned release artifacts;
- bbox/month/zoom-aware queries or vector tiles for the map;
- asynchronous ingestion and model-training jobs with a release registry;
- twelve versioned calendar-month climate-normal assets/tables so later
  target-month exports reuse baselines instead of recomputing 1991–2020;
- monitoring for source freshness, schema drift, QA failure, and model drift;
- access control and audit logs for any non-public observed labels.

The present bundle uses one `grid_id` per cell and the dashboard loads one
regional month at a time. A multi-month product must key records by
`grid_id + year_month`, add an explicit month selector, and query/paginate by
space and time rather than loading a whole multi-year region into browser
memory.

This boundary prevents a successful hackathon pilot from being mistaken for a
national-scale operational architecture. The current release can be migrated
because its grid IDs, hashes, provenance, split policy, and API contract are
already explicit.
