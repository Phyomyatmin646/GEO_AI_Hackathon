# Phase 0 Report — Verified Ayeyawaddy January 2018 Pilot

Completed: 2026-07-28  
Scope: Real regional export retrieval, integrity verification, assembly, QA and provenance only  
Status: **COMPLETE — QA valid with documented warnings**

## 1. Outcome

The two successful Earth Engine Drive exports were downloaded into immutable raw storage, verified against Google Drive byte sizes and MD5 checksums, joined by stable 5 km grid ID, enriched with the cached final CHIRPS v3 January 2018 rainfall layer, and assembled into CSV.gz, plain CSV and Parquet.

This is now a **real regional environmental-feature release**. It is not:

- a full-Myanmar 2018–2025 dataset,
- a real observed crop-label dataset,
- a trained AI model,
- or evidence of model accuracy.

## 2. Earth Engine and Drive receipt

Cloud project: `gen-lang-client-0956667941`  
Drive folder ID: `1x3mowaHTYnzcc_21VwNPRPYcIiFEw8pW`

| Export | Earth Engine task | Drive file ID | Bytes | Drive/local MD5 | Local SHA-256 |
| --- | --- | --- | ---: | --- | --- |
| Static Ayeyawaddy | `M4O3FGF4MZQ45LJDMP5LWTE7` (`SUCCEEDED`) | `1nJY7jEgmWCd2tWNqRXwd5O0tlxZazKFx` | 739,486 | `83ec77a31d94cdc595aae94299ee1327` | `150d3e08481c9f6fec65f381b26bf99d84253ce36d1fb83480e020fbcc8750d2` |
| Dynamic 2018-01 | `E77YYD3M2ILMHCWZJ2K6IASL` (`SUCCEEDED`) | `1IjIARV9M6FnHRe80IitArXOw-96AiRyp` | 970,279 | `95ad44c0729c332e341cde72456e5b67` | `a79a7dda614463015dd86e80d57cefe9dbee79d18e213cceb20a85d8c53624ef` |

The old long-running pilot `PTDUQNEEJBV7QS7V5DUMFDNH` is `CANCELLED`. The earlier CRS task `GR2RX6EGWSHIO52KCS7HNE3A` is `FAILED`; neither contributed data.

Machine-readable Drive receipt:

- `data/output/pilot_ayeyawaddy_2018_01/drive_export_download_manifest.json`

## 3. Raw-data verification

| Check | Result |
| --- | --- |
| Static rows | 1,344 |
| Dynamic rows | 1,344 |
| Static unique grid IDs | 1,344 |
| Dynamic unique grid/month keys | 1,344 |
| Duplicate keys | 0 |
| Shared grid IDs | 1,344 |
| Dynamic-only/static-only grid IDs | 0 / 0 |
| Month | `2018-01` |
| Grid cell area | exactly 25 km² in the export |
| Coordinate range | 94.2362–96.0499 E, 15.7319–18.4765 N |
| Final CHIRPS source | cached CHIRPS v3 January 2018 GeoTIFF |
| CHIRPS raw source status | present and checksummed |
| Soil source | GEE SoilGrids community assets; no fallback download needed |

Raw CSVs were not edited. The downloader now:

- rejects absolute/traversal/nested/symlink-escaping Drive filenames,
- downloads to `.part`,
- verifies Drive size and MD5 before atomic publication,
- verifies existing files instead of silently skipping them,
- records local MD5, SHA-256, byte size and remote file metadata.

## 4. Final release

Output directory:

`data/output/pilot_ayeyawaddy_2018_01/`

Primary artifacts:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `myanmar_agri_suitability_ayeyawaddy_2018_01.csv.gz` | 275,179 | `814b173f8de95a1ffef5575dee26b95b44d1038108e2bf8614962ecc27d51210` |
| `myanmar_agri_suitability_ayeyawaddy_2018_01.csv` | 2,520,196 | `62badf87dbe909d83d9fbc7cb96fcd61964a4f4c144ec2b8cb1fec5875509a57` |
| `myanmar_agri_suitability_ayeyawaddy_2018_01.parquet` | 330,021 | `27655f337d87e68a2863ab547cbd47bde4a079ee05fcd497d1a62ed8466605ca` |
| `myanmar_agri_suitability_ayeyawaddy_2018_01_split_manifest.csv` | 59,199 | `fb7b550e8079c6fce78f57b53cc632d9bad39fe0aada1efec8fd1e1ba83784de` |

Supporting artifacts:

- `source_manifest.json`
- `drive_export_download_manifest.json`
- `qa_report.json`
- `qa_report_csv_strict.json`
- `qa_report_parquet_strict.json`
- `data_dictionary.md`
- `collabhub_resource_audit.csv`
- `external_feature_manifest.csv`

The decompressed CSV.gz content has the exact same SHA-256 as the plain CSV. CSV.gz and Parquet both have 1,344 rows, 132 columns, matching keys and matching representative numeric values.

## 5. QA result

Overall strict QA: **valid**

| Metric | Result |
| --- | ---: |
| Final rows / 5 km cells | 1,344 |
| Months | 1 |
| Duplicate grid/month keys | 0 |
| Rows usable for training | 1,330 |
| Rows retained but not usable for training | 14 |
| Usable-row fraction | 98.9583% |
| Required release fraction | 95% |
| Feature-missingness median | 6.67% |
| Feature-missingness maximum | 46.67% |
| Sentinel-2 available rows | 1,128 |
| Sentinel-2 missing rows | 216 |
| Sentinel-1 available rows | 1,344 |
| CHIRPS v3 final-cache rows | 1,344 |
| Observed crop labels | **0** |

The 14 low-coverage rows are intentionally retained for map coverage and missing-data analysis. They have `usable_for_training=false`; no feature was imputed.

Rule scores exist for 1,288 cells per configured crop. These columns remain:

- provisional agronomic rule outputs,
- confidence-capped,
- not observed labels,
- and not model accuracy evidence.

## 6. Documented warnings and limitations

1. Fourteen cells exceed the 35% per-row feature-missingness threshold. The dataset-level 95% usable-row gate still passes.
2. January 2018 has 216 optical Sentinel-2-missing cells; Sentinel-1 remains available for all cells.
3. A one-month pilot cannot calculate an honest trailing 12-month rainfall total, so `annual_rainfall_mm` remains null.
4. Three optional alternative-unit range checks are skipped because their raw alternative columns are not present; canonical CHIRPS rainfall and MJ/m²/day solar columns are present and validated.
5. `admin0_name=Myanmar` is attached from the trusted ISO3 MMR project scope for these older exports and recorded as `admin0_source=project_scope_config`. Admin-1/admin-2 names/codes remain missing rather than invented.
6. This release contains no real observed crop/yield/planting/harvest labels.
7. The recommendations are rule-based; no supervised model has been trained.
8. Climate inputs are historical/reanalysis features, not climate-change projections.

## 7. Narrow engineering changes

- Added a reproducible pilot config:
  - `config/pilot_ayeyawaddy_2018_01.yaml`
- Hardened Drive download containment and integrity checks:
  - `src/myanmar_agri_geo/drive_exports.py`
- Added a machine-readable Drive download receipt:
  - `src/myanmar_agri_geo/cli.py`
- Ensured future grids always carry deterministic Myanmar country context:
  - `src/myanmar_agri_geo/gee_backend.py`
- Added audited project-context attachment for the existing exports:
  - `src/myanmar_agri_geo/pipeline.py`
- Replaced the all-rows-perfect missingness rule with:
  - per-row `usable_for_training`, plus
  - a configurable dataset-level usable-row release gate.
- Added focused regression tests.

No synthetic rows, fake observations or imputed source features were added.

## 8. Reproduction commands

```bash
source .venv/bin/activate

PYTHONPATH=src python -m myanmar_agri_geo.cli download-drive-exports \
  --config config/pilot_ayeyawaddy_2018_01.yaml \
  --folder-id 1x3mowaHTYnzcc_21VwNPRPYcIiFEw8pW \
  --prefix myanmar_agri_suitability_ayeyawaddy

PYTHONPATH=src python -m myanmar_agri_geo.cli assemble \
  --config config/pilot_ayeyawaddy_2018_01.yaml \
  --plain-csv

PYTHONPATH=src python -m myanmar_agri_geo.cli validate \
  --config config/pilot_ayeyawaddy_2018_01.yaml \
  --input data/output/pilot_ayeyawaddy_2018_01/myanmar_agri_suitability_ayeyawaddy_2018_01.csv.gz \
  --report data/output/pilot_ayeyawaddy_2018_01/qa_report_csv_strict.json \
  --strict
```

## 9. Verification results

- Full Python suite: **39 passed**
- Focused Phase 0 downloader/pipeline/validation suite: **27 passed**
- Python dependency check: **no broken requirements**
- Web lint: **passed**
- Web production build: **passed**
- Existing web rendered/API tests: **2 passed**
- Installed-wheel smoke test: pilot plan command works and strict CSV QA is **valid**
- `git diff --check`: **passed**

The web build still emits the previously documented unresolved Leaflet marker/layer image warnings. The current polygon flow builds, but Phase 1 browser E2E must cover any marker/layer controls.

## 10. Phase exit decision

Phase 0 completion criteria are satisfied:

- Drive exports obtained,
- remote/local integrity verified,
- static/dynamic keys reconciled,
- real regional CSV.gz/plain CSV/Parquet published,
- strict QA passes,
- provenance and limitations recorded.

Recommended next gate: **Phase 1 — replace the web fixture with this QA-approved regional release through a versioned real-data API.**
