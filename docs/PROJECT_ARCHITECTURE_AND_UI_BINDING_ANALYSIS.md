# Project Architecture and Frontend–Backend Binding Analysis

စစ်ဆေးသည့် project: `GEO_AI_Hackathon`  
စစ်ဆေးသည့်ရက်: 2026-08-12  
Scope: Python/GEE pipeline, Fastify backend, Neon PostgreSQL persistence, Next/Vinext BFF, current frontend pages and UI data consumers

## 1. Executive finding

Project ရဲ့ core weekly prediction flow က architecture အရ ချိတ်ထားပြီးသားဖြစ်သည်။ Home map မှာ 5 km cell တစ်ခုကို click လုပ်သည့်အခါ Neon ကို browser ကနေ တိုက်ရိုက် query မလုပ်ဘဲ page load တုန်းက BFF မှတစ်ဆင့် ရောက်လာပြီးသား `live.cells[]` ထဲမှ တူညီသော `grid_id` ကိုရွေးကာ detail panel တွင်ပြသည်။ ဒီ trust boundary က မှန်ကန်သည်။

လက်ရှိ အဓိကပြဿနာက cell-click event သို့မဟုတ် Neon UI component မဟုတ်ဘဲ runtime data availability ဖြစ်နိုင်ခြေမြင့်သည်။ အထူးသဖြင့်:

- Backend သည် `DATABASE_URL` မရှိလျှင် PostgreSQL store မတည်ဆောက်ဘဲ `DATABASE_NOT_CONFIGURED` ပြန်သည်။
- Docker health check က `/health/live` ကိုသာစစ်သောကြောင့် database မချိတ်ထားသော်လည်း backend/web container တက်နိုင်သည်။
- `GET /api/v1/weekly/latest` က Neon ထဲတွင် row ရှိရုံနဲ့မပြန်ဘဲ `expires_at > NOW()` ဖြစ်သော latest successful run တစ်ခု၏ active regional rows များကိုသာပြန်သည်။
- Home BFF timeout သည် 3.5 seconds ဖြစ်ပြီး upstream error code/request ID များကို UI ဆီမထုတ်ဘဲ `backend_unavailable` အဖြစ်သာ collapse လုပ်သည်။
- Home BFF က backend cell များအား local historical pilot bundle ထဲရှိ `grid_id` များနှင့်သာ intersect လုပ်သည်။ ID မတူသော weekly cells များကို UI မပေါ်စေရန် drop လုပ်သည်။
- Default model policy မှာ audited healthy targets 11 ခုသာ serve/persist လုပ်သည်။ 40 targets အားလုံးထဲမှ flagged 29 ခုကို explicit policy မရှိဘဲ အတုဖြည့်မပြသင့်ပါ။
- Repository audit docs အရ serving feature `surface_water_seasonality_months` null ဖြစ်နေခြင်းသည် strict weekly inference အသစ်ကို fail-closed ဖြစ်စေနိုင်သည့် blocker ဖြစ်သည်။

အဓိပ္ပာယ်က Neon console ထဲ `weekly_region_predictions` row မြင်ရခြင်းတစ်ခုတည်းနဲ့ browser UI ဆီ ရောက်မည်ဟု မဆိုနိုင်ပါ။ Row သည် active/unexpired ဖြစ်ရမည်၊ correct run/region ဖြစ်ရမည်၊ BFF auth/runtime ကောင်းရမည်၊ `grid_id` သည် historical map bundle နှင့်တူရမည်။

## 2. Verified end-to-end architecture

### Historical/static pilot path

```text
Official geospatial sources
  -> Google Earth Engine 5 km EPSG:6933 grid/export
  -> raw staging
  -> Python feature assembly and QA/provenance
  -> versioned CSV/JSON pilot release
  -> Next BFF local bundle loader
  -> Leaflet map and historical detail/QA UI
```

### Weekly model path

```text
GEE weekly export (6 regions)
  -> Python exact 75-feature validation + checksum + coverage manifest
  -> POST /api/v1/internal/weekly/ingest (X-Internal-API-Key)
  -> Fastify WeeklyOrchestrator
  -> separate GEO_MODEL_SERVER batch inference
  -> transactional Neon upsert into weekly_region_predictions.payload JSONB
  -> GET /api/v1/weekly/latest (X-API-Key)
  -> Next BFF /api/v1/home
  -> payload.live.cells[]
  -> grid_id join with historical map cells
  -> selected 5 km cell detail, overlay, evidence and full prediction sections
```

### Market path

```text
Official/market adapters and scheduled refresh
  -> Fastify market service
  -> Neon market tables
  -> public market API
  -> typed server-side BFF with X-API-Key
  -> /market table UI
```

### Runtime trust boundaries

- Browser သည် Neon/PostgreSQL, internal ingest key သို့မဟုတ် model-server key ကို မသိရပါ။
- Browser က same-origin Next BFF ကိုသာခေါ်ရမည်။
- BFF က server-side `BACKEND_URL` နှင့် `BACKEND_API_KEY` သုံးရမည်။
- Weekly pipeline သည် `INTERNAL_API_KEY` သုံးပြီး public API key နှင့် မတူရပါ။
- Fastify က သီးခြား `GEO_MODEL_SERVER_API_KEY` ဖြင့် model server ကိုခေါ်သည်။

## 3. Frontend page and data-source matrix

| Page / feature | Current UI source | Backend/Neon binding | Current state | Main gap |
|---|---|---|---|---|
| `/` Home dashboard | `/api/v1/home` | Historical bundle + backend `/api/v1/weekly/latest` | Structurally bound | Runtime errors collapse to generic state; weekly freshness/ID intersection must be observable |
| Home 5 km cell click | In-memory `live.cells[]` map keyed by `grid_id` | Data originated from Neon weekly payload | Bound; no click-time query is needed | Must show actual stored targets only and explain missing/flagged targets truthfully |
| Home advanced/model evidence | `selectedWeeklyCell.predictions` | Neon JSONB via weekly API | Bound | 40-target catalog and persisted-target count must not be conflated |
| `/daily` weekly map | `/api/v1/daily/:date/map` BFF | Backend compatibility route reads same Neon weekly payload | Bound | BFF uses `any`, has no timeout/request-ID contract, mutates unknown response, and exposes weak error detail |
| `/market` | `/api/v1/market` BFF | Typed backend market API -> Neon | Bound | UI error says only database missing even when timeout/auth/upstream contract may be the cause |
| `/climate` | checked-in `climate_ayeyawaddy.json` | None at runtime | Intentionally static | UI should label snapshot date/scope clearly; do not describe it as live backend data |
| `/macro` | checked-in World Bank snapshot JSON | None at runtime | Intentionally static | Keep explicit “no forecast” provenance and snapshot timestamp |
| `/faq` | checked-in bilingual FAQ JSON | None at runtime | Intentionally static | Translation review is pending; UI does not surface that status |
| `/register` | Visual form only | BFF and backend POST route exist | **Not bound** | Button is `type="button"`; no submit handler; UI field `name` does not map to required backend `username`; no success/error states |
| Global chatbot | Local `localReply()` + 750 ms timer | Backend Gemini/chatbot routes exist | **Not bound** | UI appears to be AI but never calls `/api/v1/chatbot`; no selected-cell locator/context is sent |
| Crop calendars | Typed BFF routes exist | Backend + PostgreSQL dataset | API-ready, no visible consumer found | Needs a deliberate UI consumer or removal from advertised user flow |
| Legacy `/api/v1/predictions` BFF | Backend model prediction API | Separate model-server path | API-ready, no principal page consumer found | Avoid duplicating weekly cell flow without a specific interactive use case |

## 4. Current Home UI binding in detail

The Home flow is already designed as a historical-first, weekly-enhanced experience:

1. `PilotDashboard` requests `/api/v1/home?region=<region>&period=<pilot|latest>`.
2. BFF always loads and runtime-validates the selected regional historical pilot bundle.
3. For `period=latest`, BFF requests backend `/api/v1/weekly/latest` with the server-side API key.
4. BFF selects the requested regional payload, validates cells/predictions, and keeps only cells whose `grid_id` exists in the selected pilot bundle.
5. `PilotDashboard` builds a `grid_id -> HomeWeeklyCell` map.
6. `GeoMap` click changes `selectedId`; `selectedWeeklyCell` is an in-memory lookup.
7. Crop recommendations, live conditions, map overlay, model evidence and the Neon weekly prediction section render from that selected object.

ဒီအတွက် “cell click လုပ်တိုင်း Neon query အသစ်ခေါ်ရန်” မလိုပါ။ Page load payload အလွန်ကြီးလာပါက နောက်ပိုင်းမှာ cell-detail endpoint သီးခြားစဉ်းစားနိုင်သော်လည်း လက်ရှိ architecture ကိုပြောင်းရန် evidence မရှိသေးပါ။

## 5. Backend persistence and serving rules that affect the UI

### Neon payload shape

```json
{
  "schema_version": "weekly-model-input-v1",
  "model_catalog_version": "<sha256>",
  "model_input_schema_sha256": "<sha256>",
  "week_start": "YYYY-MM-DD",
  "week_end": "YYYY-MM-DD",
  "region": "sagaing",
  "cell_count": 123,
  "generated_at": "<ISO timestamp>",
  "coverage_metadata": {},
  "model_policy": {},
  "cells": [
    {
      "grid_id": "mm_1839_538",
      "latitude": 21.6008,
      "longitude": 95.3244,
      "predictions": {
        "values": {
          "crop_yield_t_ha": {
            "value": 2.608,
            "unit": "tonnes_per_hectare",
            "task_type": "regression",
            "confidence": null,
            "model_version": "sha256-...",
            "validation_status": "healthy",
            "warnings": []
          }
        },
        "errors": {}
      }
    }
  ]
}
```

### Serving semantics

- `weekly_region_predictions` rows have a seven-day retention window by default.
- Latest API chooses an active run, not an arbitrary latest row per region.
- All regional responses should belong to the same pipeline run.
- Expired data returns no active latest result; dated compatibility route may return `410 WEEKLY_PREDICTIONS_EXPIRED`.
- Backend has 40 target names in its audited catalog, but the default policy permits only 11 healthy targets. Missing targets are unavailable, not zero.

## 6. UI/UX analysis

### What is already good

- Sensitive credentials are kept server-side through BFF routes.
- Home keeps a truthful historical fallback instead of inventing live values.
- Map selection uses stable cell identity (`grid_id`) rather than coordinates alone.
- Climate and macro charts show source/provenance and avoid fake forecasts.
- Market and crop-calendar BFF contracts have runtime validation and request-ID patterns.
- Language toggle and shared navigation are present across the principal pages.

### Priority UX/data-integrity weaknesses

1. **Operational errors are too generic on Home.** `DATABASE_NOT_CONFIGURED`, unauthorized, timeout, no active rows and grid mismatch can all look like “latest unavailable.” Users and operators need safe, distinct state codes without exposing secrets.
2. **Register page is a dead interaction.** A visually complete form that does nothing is more misleading than an explicitly disabled “coming soon” state.
3. **Chatbot is a local scripted demo while a real backend exists.** It should either be bound honestly to the backend with loading/error/context states or labeled as an offline help demo. It must not imply that a 750 ms local response is Gemini/model output.
4. **Daily route is a weak duplicate contract.** It transforms the same weekly payload into a legacy shape but lacks strict frontend typing and the error/timeout discipline used by other BFF routes.
5. **Data freshness is fragmented.** Home, daily, market, climate and macro each have different freshness semantics. Each page should show `source`, `observed_at/week`, `generated_at/fetched_at`, and live/static/expired state consistently.
6. **The 40-model statement needs precision.** UI should state “40 catalog targets; N available in this active payload” and retain warnings/validation status. It should never create placeholders that resemble predictions.
7. **Myanmar/English terminology is inconsistent.** Some interfaces contain English technical text inside Myanmar mode. Preserve model identifiers where necessary but localize user-facing labels, units and states through a shared dictionary.

## 7. Recommended implementation order

### P0 — Diagnose/configure, no UI redesign

- Verify backend `/health/ready`, not only `/health/live`.
- Verify server-side `BACKEND_URL`, `BACKEND_API_KEY`, backend `DATABASE_URL`, and distinct internal/model keys without logging their values.
- Apply migrations before assuming stored rows are servable.
- Verify an unexpired six-region run and `grid_id` overlap with the frontend regional bundles.
- Do not query Neon directly from browser code.

### P1 — Make existing binding observable and contract-safe

- Preserve upstream safe error code, status, request ID and retryability in Home/Daily BFF state.
- Add strict TypeScript decoders for weekly envelope and daily compatibility payload.
- Report counts: backend cells, matched cells, dropped/unmatched cells, available targets, catalog targets.
- Keep historical fallback, but show why weekly data is unavailable.

### P2 — Complete visibly unfinished bindings

- Bind Register form to `/api/v1/users/register` using `{username, phone, location, email?}` and accessible success/validation/conflict/unavailable states.
- Bind ChatbotWidget to a same-origin BFF for backend chatbot, or label it offline until that BFF exists. Include selected cell locator only when user context legitimately provides it.
- Decide whether crop-calendar data belongs in selected-cell detail; do not add it merely because an endpoint exists.

### P3 — Verification

- Contract tests from persisted weekly payload -> backend envelope -> BFF decoder -> selected UI cell.
- Runtime tests for active, expired, missing DB, unauthorized, timeout, partial region and grid mismatch states.
- UI tests for desktop/mobile, Myanmar/English, keyboard access, loading/empty/error/success, long model warnings and units.

## 8. Acceptance definition

Binding is complete only when all of these are true:

- One active Neon row can be traced by request ID through Fastify and BFF to a selected UI cell.
- UI-selected `grid_id` exactly matches the displayed weekly cell.
- Values, units, confidence, validation status, model version and warnings are not altered or fabricated.
- Missing/flagged/expired data is visually distinct from a numeric zero.
- No secret or direct database connection string is shipped to the browser.
- Backend-unready states do not masquerade as successful live data.
- Register and chatbot either work end-to-end or are honestly marked unavailable/offline.
- Existing layout, chart count, map behavior and bilingual navigation remain intact unless a separately approved UI change is requested.

