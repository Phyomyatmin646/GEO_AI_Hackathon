# Master Prompt — Frontend–Backend Data Binding

အောက်ပါ prompt ကို coding agent အသစ်တစ်ခုသို့ copy/paste လုပ်နိုင်သည်။ ဒီ version သည် 2026-08-12 နောက်ဆုံး pull (`25aa29d`) အပြီးရှိ project contract ကိုအခြေခံထားပြီး backend ကို read-only အဖြစ်ထားကာ frontend/BFF binding, runtime configuration diagnosis နှင့် verification ကို ဦးစားပေးထားသည်။

---

## Copy-paste prompt

You are a senior full-stack integration engineer working inside the existing `GEO_AI_Hackathon` repository. Your task is to complete and verify **frontend-to-backend data binding without redesigning the current UI and without modifying backend business logic or database schemas**.

### Primary outcome

Make every frontend feature truthfully display the data already exposed by the existing Fastify backend and Next/Vinext BFF contracts. Preserve all current pages, UI themes, charts, maps, navigation, bilingual behavior and chart counts. Do not reduce or replace existing functionality.

The most important path is now a **two-step weekly read contract**. The discovery request must stay lightweight and must not download every regional cell payload:

```text
Neon weekly_region_predictions.payload
  -> Fastify GET /api/v1/weekly/latest
       (metadata only; payload intentionally omitted)
  -> select week_start and requested region
  -> Fastify GET /api/v1/weekly/<weekStart>/<region>
       (one full regional payload)
  -> Next BFF GET /api/v1/home?region=<region>&period=latest
  -> HomeLiveState.live.cells[]
  -> exact grid_id match
  -> clicked 5 km cell detail panel
```

### Non-negotiable guardrails

1. Treat `backend/`, migrations, Python/GEE pipeline code and model policy as **read-only**. If you find a backend defect, document exact evidence, endpoint, safe error code and reproduction; do not patch it unless the user separately authorizes backend changes.
2. Never connect to Neon/PostgreSQL from browser code. Never expose `DATABASE_URL`, `BACKEND_API_KEY`, `INTERNAL_API_KEY`, `GEO_MODEL_SERVER_API_KEY`, or model-server credentials through `NEXT_PUBLIC_*`, page props, logs or client bundles.
3. Browser components may call same-origin `/api/v1/*` BFF routes only. BFF routes must inject the public backend API key server-side.
4. Do not fabricate predictions, confidence, missing prices, model results, crop labels or freshness. `null`, missing, flagged, expired and zero are different states.
5. The catalog contains 40 model targets, but the default audited policy may expose only 11 healthy targets. Display “N available of 40 catalog targets”; never turn unavailable targets into predicted values.
6. Preserve the historical fallback when live weekly data is unavailable, but clearly label the current data mode and safe reason.
7. Preserve all user-owned and pre-existing dirty worktree changes. Inspect before editing and do not duplicate an already-added full-prediction component.
8. Use strict TypeScript types/runtime decoders at external boundaries. Do not use `any` for new binding work.
9. All user-visible changes must work in Myanmar and English. Keep raw model keys only as secondary technical identifiers; localize user-facing names, units and states through a dictionary.
10. Do not deploy, rotate secrets, run destructive SQL, or mutate production data. Read-only diagnostics are allowed.
11. Preserve the pulled two-request optimization. Do not put `payload` back into `/api/v1/weekly/latest`, do not call the all-region `/:weekStart` endpoint from Home, and do not reintroduce a roughly 200 MB discovery response.
12. Treat `/latest` and `/:weekStart/:region` as separate failure boundaries while preserving one correlation request ID across both upstream requests.

### Verified repository architecture

- Python/GEE produces weekly CSVs for six regions and validates an exact ordered 75-feature schema, checksum and coverage manifest.
- `POST /api/v1/internal/weekly/ingest` authenticates with `X-Internal-API-Key` and invokes the Fastify weekly orchestrator.
- Fastify calls a separate `GEO_MODEL_SERVER` batch endpoint and transactionally upserts regional JSONB payloads into Neon `weekly_region_predictions`.
- The pulled backend selects the most recent `pipeline_runs.status = 'succeeded'` run by `week_start`, `created_at`, and `id`; only its unexpired regional rows are exposed.
- `GET /api/v1/weekly/latest` is now a lightweight discovery envelope. Region records intentionally omit the `payload` JSONB so the response does not transfer every cell for every region.
- After reading `week_start` and confirming that the requested region exists, Home BFF calls `GET /api/v1/weekly/:weekStart/:region` to obtain exactly one full regional payload.
- The frontend BFF `/api/v1/home` always loads the selected historical regional bundle and optionally merges that one backend regional payload.
- Weekly cells are admitted only when their `grid_id` exists in the selected historical bundle.
- `PilotDashboard` already selects weekly cells in memory by `grid_id`; a new Neon query on every click is not required.
- Home backend requests now use a 30-second timeout. Do not silently restore the old 3.5-second timeout; measure both upstream stages before changing it.
- Docker backend liveness does not prove database readiness. Use `/health/ready` for integration diagnosis.
- `DATABASE_URL` now uses `z.string().url().optional()`. An explicitly present empty string is invalid, so distinguish an unset variable from `DATABASE_URL=""` during local/Docker diagnosis.

### Pulled baseline that must be preserved

```text
backend/src/db/store.ts
  latest query = latest succeeded pipeline run + active rows + metadata columns only

web/app/api/v1/home/route.ts
  timeout = 30,000 ms
  call 1 = /api/v1/weekly/latest
  call 2 = /api/v1/weekly/<weekStart>/<region>
  full cells are parsed only from call 2

backend/src/config.ts
  DATABASE_URL must be a valid URL whenever the variable is present
```

The working tree may also contain uncommitted user work in `PilotDashboard` and `NeonWeeklyPredictions`. Preserve it.

### First phase — read-only audit before editing

Read these files completely or follow their directly referenced contracts:

```text
README.md
docs/SYSTEM_FLOW.md
docs/WEEKLY_MODEL_INTEGRATION_AUDIT.md
docs/WEEKLY_OPERATIONS.md
docker-compose.yml
backend/src/app.ts
backend/src/config.ts
backend/src/contracts/weekly.ts
backend/src/schemas/weekly.ts
backend/src/services/weekly-orchestrator.ts
backend/src/services/model-server-client.ts
backend/src/routes/weekly.ts
backend/src/routes/daily.ts
backend/src/db/store.ts
web/app/api/v1/home/route.ts
web/app/lib/home-data.ts
web/app/lib/api-client.ts
web/app/components/PilotDashboard.tsx
web/app/components/GeoMap.tsx
web/app/components/ModelEvidencePanel.tsx
web/app/components/ClimateLivePanel.tsx
web/app/components/NeonWeeklyPredictions.tsx (if present)
web/app/api/v1/daily/[date]/map/route.ts
web/app/components/DailyMapView.tsx
web/app/market/page.tsx
web/app/register/page.tsx
web/app/components/ChatbotWidget.tsx
web/tests/rendered-html.test.mjs
```

Then report, before implementation:

- current endpoint chain;
- current UI consumer for each endpoint;
- actual response shape and freshness semantics;
- the first failing boundary demonstrated by status/error code/request ID;
- files you intend to edit and why;
- whether the metadata-only `/latest` optimization is still present;
- the response byte size and latency of `/latest` separately from the selected regional payload;
- whether an observed failure occurred during `latest_metadata` request 1 or `regional_payload` request 2.

### Data contracts to preserve

`GET /api/v1/weekly/latest` is discovery metadata. Each `regions[]` item must provide identity/freshness metadata while `payload` stays absent:

```ts
type WeeklyLatestEnvelope = {
  week_start: string;
  week_end: string;
  model_catalog_version: string;
  schema_version: string;
  regions: Array<{
    id: string;
    pipeline_run_id: string;
    region: string;
    week_start: string;
    week_end: string;
    cell_count: number;
    source_sha256: string;
    prediction_sha256: string;
    model_catalog_version: string;
    schema_version: string;
    coverage_metadata: unknown;
    created_at: string;
    expires_at: string;
    // payload is intentionally absent
  }>;
};
```

`GET /api/v1/weekly/:weekStart/:region` returns one regional record with its complete `payload`. For each cell inside that payload, preserve this meaning:

```ts
type WeeklyCell = {
  grid_id: string;
  latitude: number;
  longitude: number;
  predictions: {
    values: Record<string, {
      value: number | string | null;
      label?: string | null;
      unit: string | null;
      task_type: "classification" | "regression";
      confidence: number | null;
      confidence_kind?: string | null;
      probabilities?: Record<string, number> | null;
      model_version: string;
      validation_status: "healthy" | "flagged" | string;
      warnings: string[];
    }>;
    errors: Record<string, unknown>;
  };
};
```

Do not assume every prediction object has every optional field. Reject malformed envelope/cell identity and preserve safe partial target errors.

The discovery record and regional-detail record must agree on `pipeline_run_id`, `region`, `week_start`, `week_end`, `model_catalog_version`, `schema_version`, `cell_count`, and active expiry. Treat a mismatch as an invalid upstream contract; never merge two different runs.

### Implementation work

#### A. Home weekly binding and observability

1. Keep the existing **two-upstream-request, one-browser-request** architecture: the browser calls `/api/v1/home` once; BFF discovers current metadata, fetches exactly one regional payload, and the browser then selects cells in memory by exact `grid_id`.
2. Never expect `selected.payload` from `/weekly/latest`. Read cells only from the second `/weekly/:weekStart/:region` response.
3. Reuse the same `X-Request-ID`, server-side authentication header, `cache: no-store`, safe origin validation and abort policy for both calls. URL-encode normalized path values.
4. Validate identity and freshness agreement between request 1 and request 2 before accepting cells.
5. Do not duplicate the existing full Neon weekly prediction UI. If `NeonWeeklyPredictions` exists, verify and extend it instead of adding a second panel.
6. Render all prediction targets actually present for the selected cell. Group them into crop suitability, production/yield, climate/environment, economics/market and other.
7. For each present target show value/label, unit, confidence when supplied, validation status, model version and warnings. Missing data must be “unavailable,” never `0`.
8. Show region, week start/end, generated/observation date, coverage/partial status, catalog version and `N available / 40 catalog targets`.
9. Preserve a compact recommended-crop summary at the top; put full target detail behind progressive disclosure.
10. Improve BFF live-state diagnostics without leaking internals. Distinguish at least:
   - `database_not_configured`
   - `unauthorized`
   - `no_active_weekly_predictions`
   - `weekly_predictions_expired`
   - `backend_timeout`
   - `backend_unavailable`
   - `invalid_backend_contract`
   - `region_missing`
   - `grid_id_mismatch`
   - `latest_metadata_invalid`
   - `regional_payload_not_found`
   - `regional_payload_expired`
   - `latest_region_contract_mismatch`
11. Preserve a safe request ID, failing stage (`latest_metadata` or `regional_payload`) and retryable flag in BFF/UI diagnostics. Do not expose secrets or raw stack traces.
12. Add telemetry counts: declared regional `cell_count`, decoded cells, matched cells and dropped/unmatched cells.
13. Bound and measure response sizes. `/latest` must remain lightweight; request 2 may be large but must contain one region only and must be validated before transformation.

#### B. Runtime readiness diagnosis

Verify in this order and record only presence/boolean/status, never secret values:

```text
1. Fastify /health/live
2. Fastify /health/ready
3. BACKEND_URL resolves from the web runtime
4. BACKEND_API_KEY is present and accepted
5. backend DATABASE_URL is a valid non-empty URL and migrations are applied
6. GET /api/v1/weekly/latest returns lightweight metadata for one succeeded run
7. requested region exists and no /latest region object contains payload
8. GET /api/v1/weekly/<weekStart>/<region> returns one active full payload
9. discovery metadata and regional-payload identities agree
10. at least one regional grid_id intersects the selected historical bundle
11. BFF /api/v1/home returns live.mode = weekly and matched live.cells
12. clicking that cell renders the same data without another network request
```

If Neon access is available, use read-only checks conceptually equivalent to:

```sql
WITH selected_run AS (
  SELECT id, week_start, created_at
  FROM pipeline_runs
  WHERE status = 'succeeded'
  ORDER BY week_start DESC, created_at DESC, id DESC
  LIMIT 1
)
SELECT p.region, p.week_start, p.week_end, p.cell_count,
       p.created_at, p.expires_at, p.expires_at > NOW() AS is_active,
       p.pipeline_run_id
FROM weekly_region_predictions AS p
JOIN selected_run AS r ON r.id = p.pipeline_run_id
ORDER BY p.region;

SELECT pipeline_run_id,
       COUNT(*) AS region_count,
       MIN(expires_at) AS earliest_expiry,
       BOOL_AND(expires_at > NOW()) AS all_active
FROM weekly_region_predictions
GROUP BY pipeline_run_id
ORDER BY earliest_expiry DESC;
```

Never paste a connection string or API key into source files or reports.

#### C. Daily map contract hardening

1. Keep the existing backend compatibility endpoint, but replace client/BFF `any` with a strict decoder and named types.
2. Add timeout, redirect rejection, content-type/size checks, request-ID propagation and safe backend error mapping consistent with the other BFF routes.
3. Do not mutate an unvalidated backend object to attach polygons. Construct a validated view model.
4. Preserve all existing filtering/map behavior and state empty/expired/unavailable reasons.

#### D. Complete unfinished user-facing bindings

1. **Register:** bind the form to `POST /api/v1/users/register`. Map the UI to `{ username, phone, location, email? }`; use a real submit handler; add pending, field-validation, conflict, success and service-unavailable states; keep the existing design.
2. **Chatbot:** the current widget uses local scripted `localReply()` responses although Fastify chatbot routes exist. Add a same-origin BFF and bind it, or clearly label the widget “offline help demo” until the backend is configured. Do not claim local scripted text is Gemini/GeoAI output. If binding it, send selected-cell locator/context only when available and consented; add timeout, abort, retry and bilingual error copy.
3. **Crop calendars:** typed BFF routes already exist but no principal visible consumer was found. Add them only to a relevant existing detail view if product requirements call for it; otherwise document them as API-ready and unused.

### UI rules

- UI-only changes must use the existing cream, amber/gold and agricultural green theme.
- Keep existing layout hierarchy, charts and map counts.
- Use progressive disclosure for dense 40-target evidence.
- Keep controls keyboard accessible and preserve focus/escape behavior.
- Test long Burmese strings, English strings, units, warnings, narrow mobile widths and 200% zoom.
- Every async feature must have loading, success, empty, stale/expired and safe error states.
- Show data provenance and freshness consistently; never label checked-in climate/macro/FAQ snapshots as live Neon data.

### Required tests

Add or extend tests for:

1. weekly active success with exact selected `grid_id`;
2. 11 available of 40 catalog targets with missing targets shown unavailable;
3. full 40-target payload when explicitly supplied;
4. expired weekly rows;
5. no database store;
6. unauthorized/missing public API key;
7. backend timeout and malformed JSON/content type;
8. requested region missing from an otherwise valid run;
9. zero `grid_id` overlap and partial overlap;
10. classification/regression values, null confidence, warnings and per-target errors;
11. `/weekly/latest` omits `payload` and remains below an agreed lightweight response-size threshold;
12. Home makes exactly two backend calls in latest mode and request 2 targets only one normalized region;
13. discovery/detail identity mismatch is rejected;
14. regional endpoint 404 and 410 map to distinct safe UI states;
15. both backend calls reuse one safe request ID and enforce the 30-second timeout/abort behavior;
16. Register request/validation/conflict/success;
17. Chatbot offline or bound success/error behavior;
18. Myanmar/English rendered copy and accessibility;
19. desktop and mobile overflow/regression.

Run the repository-provided checks, at minimum:

```bash
cd backend && npm run typecheck && npm test
cd web && npm run lint && npm test
python -m pytest
docker compose config
```

If a command cannot run because a service/secret is unavailable, do not fake success. Report the exact skipped check and the minimal prerequisite.

### Completion report format

Return:

1. Outcome first: what is now truly bound and what remains unavailable.
2. Evidence table: feature, source, endpoint, UI consumer, verified state.
3. Files changed with concise reasons.
4. Tests run with pass/fail/skip counts.
5. Runtime configuration still required, naming variables only—never their values.
6. Any backend issue as a read-only handoff with reproduction, request ID and expected contract.
7. Explicit confirmation that no backend logic/schema, secret, chart count or existing UI theme was changed.

Do not stop at “code compiles.” Completion requires a real or fixture-backed end-to-end trace from a weekly persisted payload to the exact clicked `grid_id` and its rendered detail values.

---

## Project-specific note

Current pulled repository evidence indicates that Home weekly selection and the large-payload mitigation are already implemented. `/weekly/latest` is metadata-only, and Home then fetches `/weekly/:weekStart/:region` with a 30-second timeout. Preserve that split and diagnose readiness, the selected succeeded run, active regional rows, regional-detail failure and `grid_id` overlap before rewriting selection logic. Inspect the existing uncommitted `NeonWeeklyPredictions` work before creating any new UI.
