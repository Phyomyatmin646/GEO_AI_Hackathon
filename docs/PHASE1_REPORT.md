# Phase 1 Report — Real-data Map and API

Date: 2026-07-28  
Scope: Ayeyawaddy, 2018-01-01 through 2018-02-01 (exclusive)  
Status: local implementation complete; private production deployment awaits
explicit source/data egress approval

## Outcome

The web application no longer serves the eight-cell illustrative fixture.
It serves a deterministic bundle generated from the Phase 0 QA-approved
regional CSV.

| Measure | Result |
| --- | ---: |
| Real 5 km cells | 1,344 |
| Rule-scored cells | 1,288 |
| Insufficient-evidence abstentions | 56 |
| Feature rows marked QA-usable | 1,330 |
| Observed crop labels | 0 |
| QA errors | 0 |

The environmental values are real source features. Crop rankings remain a
transparent provisional rule baseline; they are not a trained-model prediction
or an observed crop outcome.

## Reproducible publication gate

`myanmar-agri-geo build-web-pilot` now:

1. refuses a failed QA report;
2. verifies the source CSV SHA-256 against `source_manifest.json`;
3. validates required columns and one row per `grid_id`;
4. recomputes all 11 crop rule scores and confidence values and compares them
   with the release CSV;
5. reconstructs each true 5 km equal-area polygon from `grid_x`, `grid_y`,
   `grid_cell_size_m`, and EPSG:6933, then checks its transformed centre against
   the exported longitude/latitude;
6. retains missing values and emits an explicit abstention when scoring
   coverage is insufficient;
7. publishes release, source, QA, limitation, and hash metadata;
8. writes byte-reproducible JSON atomically.

Published web bundle:

- file: `web/data/pilot_ayeyawaddy_2018_01.json`
- bytes: 7,736,666
- bundle SHA-256:
  `aafb9c6885bb7a5677a5413985fb7a0ded8f6df9616b8ad6733fd0c87fcf469e`
- source CSV SHA-256:
  `62badf87dbe909d83d9fbc7cb96fcd61964a4f4c144ec2b8cb1fec5875509a57`
- QA report SHA-256:
  `3e5f84a6d2c8956175d9dec8e7f4568a4aa23a2c24166184e9b7840c8cce2df7`
- source manifest SHA-256:
  `ef2576e970de029d6e0e11087c9eef40d93139571ecc8898f0cc00b91cfb4ab2`

## API and product behavior

- `GET /api/v1/cells` provides a versioned, filtered, paginated contract.
- `GET /api/v1/cells?limit=2000` returns all 1,344 map cells.
- `GET /api/v1/cells/{cell_id}/report.csv` downloads UTF-8 evidence,
  recommendations, sources, and provenance hashes for one selected cell.
- `/api/cells` remains a truthfully deprecated compatibility route.
- Runtime validation rejects malformed bundles before publication.
- Invalid filters return stable JSON errors; unknown cells return `404`.
- API headers identify the contract, mode, release, source CSV hash, QA report
  hash, and source-manifest hash.
- The map uses the reconstructed polygons, not approximate degree rectangles.
- Scored cells show the top three provisional crops, confidence (explicitly not
  accuracy), measured factors, missingness, and source trace.
- Low-evidence cells show an abstention and no crop recommendation.
- Device-local review is explicitly excluded from automatic training-data
  ingestion.

## CollabHub decision

CollabHub resources may be used only after the same provenance gate applied to
other external inputs. No CollabHub dataset was silently added in Phase 1.

- RLCMS is the highest-value conditional annual cropland/land-cover sidecar
  after license, coverage, observation-year, taxonomy, and leakage review.
- HYDRAFloods and Mekong Drought & Crop Watch are potential flood/drought
  context sidecars or processors, not observed crop/yield labels.
- Collect Earth Online is a useful workflow for creating reviewed image-
  interpretation labels; it does not supply field-observed labels by itself.

All three data candidates remain separate from the primary table until their
downloaded artifacts pass license, date, CRS, unit, checksum, missingness, and
join-key checks.

## Verification

- Python full suite: **55 passed**
- Pilot-bundle focused suite: **16 passed**
- Rule drift audit: **14,784 comparisons**, maximum score serialization drift
  `0.01`, zero confidence drift, zero comparisons above the `0.05` tolerance
- Web lint: **passed**
- Web production build: **passed**
- Web server/API/download integration suite: **8 passed**
- `git diff --check`: **passed**

The build retains non-blocking Leaflet CSS warnings for unused default marker
and layer image paths. This product renders polygons and does not use those
marker assets.

## Remaining boundary

Phase 1 does not add:

- field-observed crop presence, yield, planting, or harvest labels;
- a trained AI model or accuracy claim;
- Myanmar-wide 2018–2025 rows;
- the bilingual FAQ system;
- external CollabHub sidecar values.

Those remain explicit later-phase gates.
