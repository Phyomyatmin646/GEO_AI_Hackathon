# စိုက်ပျိုးမိတ်ဆွေ — Myanmar Agriculture Intelligence

This vinext/Cloudflare application is the Phase 1 real-data pilot for the
Myanmar agricultural GeoAI project. It maps all 1,344 QA-approved Ayeyawaddy
5 km cells for January 2018.

The environmental features are real and provenance-backed. Crop rankings are
transparent provisional rules, not observed crop labels, a trained model, or
measured accuracy. The release contains 1,288 scored cells, 56
insufficient-evidence abstentions, and zero observed labels.

## Rebuild the data bundle

Run this from the repository root after the regional pipeline output passes QA:

```bash
myanmar-agri-geo build-web-pilot \
  --input data/output/pilot_ayeyawaddy_2018_01/myanmar_agri_suitability_ayeyawaddy_2018_01.csv \
  --qa-report data/output/pilot_ayeyawaddy_2018_01/qa_report.json \
  --source-manifest data/output/pilot_ayeyawaddy_2018_01/source_manifest.json \
  --output web/data/pilot_ayeyawaddy_2018_01.json
```

The generator refuses failed QA, verifies the CSV against the source manifest,
recomputes and drift-checks rule scores/confidence, reconstructs true
EPSG:6933 5 km polygons, and writes deterministic JSON.

## Local development

Node.js `>=22.13.0` is required.

```bash
npm install
cp .env.example .env.local
npm run dev
```

`BACKEND_URL` and `BACKEND_API_KEY` are server-only. Browser requests use
`POST /api/v1/predictions`; that same-origin BFF attaches the secret and calls
the separate Node gateway. The map's model panel is fail-closed and labels the
returned primary-artifact outputs as experimental, rule-engineered surrogate,
and not field-validated. It does not relabel the existing rule-based shortlist
as trained-model output.

## Verification

```bash
npm run lint
npm test
```

`npm test` performs a production build and exercises server rendering, the
runtime-validated API contract, full-map pagination, request errors, filtering,
provenance headers, and UTF-8 selected-cell CSV downloads.

## API

- `GET /api/v1/cells?limit=2000` — all real pilot cells for the map
- `GET /api/v1/cells?cell_id=mm_...` — one cell by ID
- `GET /api/v1/cells/{cell_id}/report.csv` — selected-cell evidence and crop
  shortlist as UTF-8 CSV
- `POST /api/v1/predictions` — server-side proxy to the authenticated Node
  gateway; never exposes the gateway key to browser JavaScript
- `GET /api/cells` — deprecated compatibility endpoint

The API always identifies the release, data contract, real-feature/rule-based
mode, source CSV SHA-256, QA report SHA-256, and source-manifest SHA-256. The
UI must never relabel this contract as observed or trained-AI output.

## Hosting

`.openai/hosting.json` binds this source to the existing Sites project.
Production builds are written to `dist/`; local Cloudflare state stays under
git-ignored `.wrangler/`.
