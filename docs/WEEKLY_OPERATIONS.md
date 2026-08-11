# Weekly Model Pipeline Operations

## Production flow

```text
Monday scheduler (Asia/Yangon)
  -> Python GEE export and exact feature validation
  -> data/weekly/<week_start>/validated/<region>.csv
  -> POST /api/v1/internal/weekly/ingest (metadata only)
  -> Fastify revalidates and batches rows (50, concurrency 1)
  -> POST GEO_MODEL_SERVER /api/v1/infer/batch
  -> six regional JSON payloads in PostgreSQL/Neon
  -> public weekly read APIs (seven-day retention)
```

Early Warning/SMS remains on its independent daily cadence. The weekly job does
not call it. The model repository and all model-server fallback behavior remain
unchanged; only Fastify talks to the model server.

## 1. Configure secrets and storage

Copy the root `.env.example` for Compose, or `backend/.env.example` when running
Fastify directly. Replace all examples. These values must be different:

| Boundary | Variable | Header |
| --- | --- | --- |
| Browser/web -> Fastify | `BACKEND_API_KEY` (`API_KEY` inside Fastify) | `X-API-Key` |
| Weekly Python -> Fastify | `INTERNAL_API_KEY` | `X-Internal-API-Key` |
| Fastify -> model server | `GEO_MODEL_SERVER_API_KEY` | `X-Internal-API-Key` |

Set `DATABASE_URL` to a least-privilege PostgreSQL/Neon role. Use TLS for a
remote database (normally `sslmode=require`) and keep credentials in a secret
manager. `WEEKLY_DATA_DIR` must point to the same host dataset for Python and
Fastify; the Compose backend mounts `./data/weekly` at `/data/weekly` read-only.

The intended model-call settings are:

```dotenv
MODEL_REQUEST_TIMEOUT_MS=120000
MODEL_BATCH_SIZE=50
MODEL_MAX_CONCURRENT_BATCHES=1
ALLOW_FLAGGED_MODELS=false
ALLOW_INSECURE_MODEL_SERVER_HTTP=false
WEEKLY_RUN_STALE_AFTER_MS=86400000
PREDICTION_RETENTION_DAYS=7
PREDICTION_CLEANUP_INTERVAL_MS=21600000
```

The Python-to-Fastify request spans up to six complete regions, so set
`BACKEND_REQUEST_TIMEOUT_SECONDS=7200`. This is intentionally separate from the
120-second limit on each bounded Fastify-to-model-server batch request.

`GEO_MODEL_SERVER_URL` and `GEO_MODEL_SERVER_API_KEY` are canonical. The older
`MODEL_SERVER_URL` and `MODEL_SERVER_API_KEY` names are accepted only as aliases.
Use HTTPS for a deployed model server. `ALLOW_INSECURE_MODEL_SERVER_HTTP` defaults
to `false` in both Fastify and Compose. Set it to `true` only when production
intentionally uses HTTP inside a controlled private network; never use that
opt-in across the public internet or an untrusted network.

## 2. Apply PostgreSQL migrations

Run migrations before starting a newly deployed backend:

```bash
cd backend
npm ci
npm run db:migrate
```

For Compose, with `DATABASE_URL` already set in `.env`:

```bash
docker compose --profile ops run --rm migrate
```

Migrations are ordered, checksum recorded, transaction wrapped, and protected by
a PostgreSQL advisory lock. A changed migration that was already applied is
rejected. Back up the database before schema changes; do not edit an applied SQL
migration—add a new numbered migration instead.

## PostgreSQL topology and pgAdmin 4

The backend has one database boundary: `DATABASE_URL`. It may identify a managed
Neon PostgreSQL database or a PostgreSQL server that you operate locally. The
checked-in Compose file currently creates neither PostgreSQL nor pgAdmin and has
no database volume. Its `backend` and optional `migrate` services both connect to
the external database named by `DATABASE_URL`.

pgAdmin 4 is optional and read/administration tooling only. It connects directly
to PostgreSQL—not to port 8000, the web service, or the model server. In pgAdmin,
choose **Register > Server** and copy the individual connection values supplied
by Neon or your local PostgreSQL administrator:

| pgAdmin field | Value |
| --- | --- |
| Name | A local label, such as `Myanmar Agri Geo` |
| Host name/address | PostgreSQL/Neon host only; do not paste the full URL |
| Port | Provider port, normally `5432` |
| Maintenance database | Database name from `DATABASE_URL` |
| Username | PostgreSQL role/user |
| Password | Password for that role |
| SSL mode | `Require` for Neon/remote TLS, or the stricter provider setting |

When pgAdmin runs directly on the same computer as a local PostgreSQL server,
the host is normally `127.0.0.1`. A separately containerized pgAdmin would need a
host reachable from that container, but this project does not supply or configure
such a container.

Use a dedicated read-only role for routine pgAdmin browsing where practical.
Use a separately controlled migration/owner role for DDL, and give the runtime
backend only the permissions it needs. Never commit `DATABASE_URL`, paste it into
issues or chat, capture it in screenshots, or place it in shell history. Keep
real values in `.env` outside version control or a deployment secret manager;
protect pgAdmin with a master password and avoid saving database passwords on a
shared machine.

After the currently checked-in migrations and migration runner execute, the
`public` schema contains these exact operational tables:

- `schema_migrations` — migration filename, checksum, and apply time; created by
  the migration runner.
- `pipeline_runs` — weekly run status, catalog/schema versions, counters, and
  per-region audit metadata.
- `weekly_region_predictions` — expiring regional JSON prediction payloads,
  source/prediction hashes, coverage metadata, and seven-day expiry.
- `crop_market_prices` — source market prices with original currency, quantity,
  unit, source date, and provenance.
- `app_users` — registration profiles containing required `username`, `phone`,
  and `location`, plus optional `email`; created by
  `0002_user_registration.sql`.

Run `npm run db:migrate` (or the Compose `migrate` service) before using user
registration, then confirm that `0002_user_registration.sql` appears in
`schema_migrations`. Do not create `app_users` manually in pgAdmin, because that
would bypass the migration checksum/audit path.

To verify the schema safely in pgAdmin's Query Tool:

```sql
SELECT schemaname, tablename
FROM pg_catalog.pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'schema_migrations',
    'pipeline_runs',
    'weekly_region_predictions',
    'crop_market_prices',
    'app_users'
  )
ORDER BY tablename;

SELECT filename, sha256, applied_at
FROM public.schema_migrations
ORDER BY filename;

SELECT week_start, region, cell_count, created_at, expires_at
FROM public.weekly_region_predictions
ORDER BY week_start DESC, region;

SELECT id, username, phone, location, email, created_at
FROM public.app_users
ORDER BY created_at DESC
LIMIT 100;

SELECT crop_key, commodity_name_raw, region, marketplace,
       price_min, price_max, currency, quantity, unit,
       source_name, source_date, fetched_at
FROM public.crop_market_prices
ORDER BY source_date DESC, commodity_name_raw
LIMIT 200;
```

Refresh **Servers > Databases > _database_ > Schemas > public > Tables** after a
migration. If a table is absent, inspect `schema_migrations` and the migration
command output; do not compensate by creating or altering it manually.

Every successful weekly publication contains exactly these six canonical
regions: `yangon`, `bago`, `mandalay`, `sagaing`, `magway`, and `ayeyawaddy`.
Their run audit is in `pipeline_runs.region_results`; their payload rows are in
`weekly_region_predictions`.

The backend registration route is `POST /api/v1/users/register`. It accepts this
strict JSON shape:

```json
{
  "username": "farmer_01",
  "phone": "09123456789",
  "location": "Ayeyawaddy",
  "email": "farmer@example.com"
}
```

`email` may be omitted. This endpoint creates a profile only; it does not create
a password, login session, access token, or phone/email verification state. A
Myanmar local phone beginning with `0` is normalized to canonical `+95...`
format before uniqueness checks. A duplicate username, phone, or email returns
the same generic `409` response.
When `API_KEY` is configured, the included Next.js server route at the same path
adds `X-API-Key` before forwarding to Fastify; never embed that key in browser
JavaScript.

## 3. Start and verify dependencies

Start `GEO_MODEL_SERVER` separately, then Fastify and the existing web service:

```bash
docker compose up --build backend web
```

Verify liveness and dependency readiness independently:

```bash
curl -fsS http://127.0.0.1:8000/health/live
curl -fsS http://127.0.0.1:8000/health/ready
```

`/health/ready` returns `503` if either PostgreSQL or the authenticated model
catalog/readiness contract fails. Liveness must not be interpreted as inference
readiness.

## 4. Run the Monday pipeline

The week is Monday 00:00 through the next Monday 00:00 in `Asia/Yangon`, with an
exclusive end. Run after the interval closes; the Monday job processes the
previous Monday. The checked-in wrapper defaults to 02:00 and computes that
week. It resolves the repository from its own location and prefers the project
virtual environment; set `PYTHON_BIN` explicitly if the scheduler uses another
environment:

```bash
./scripts/run_weekly.sh
```

A cron example (the host must support `CRON_TZ`) is:

```cron
CRON_TZ=Asia/Yangon
0 2 * * 1 /absolute/path/to/myanmar-agri-geo-csv-pipeline/scripts/run_weekly.sh
```

For a controlled manual run:

```bash
python scripts/run_weekly_pipeline.py --week-start 2026-08-03 --regions all --dry-run
python scripts/run_weekly_pipeline.py --week-start 2026-08-03 --regions all
```

Use a Monday date. The interval is `[week_start, week_end)`. Partial real source
coverage is recorded explicitly; missing dates and feature values are not padded.
Cross-month weeks use the month containing `week_end - 1 day` for the existing
monthly-model period. A weekly run is a refresh of model-compatible monthly
features, not a claim that the released models were trained on true weekly
features.

## 5. Internal ingest contract

Python submits metadata, never filesystem paths or model-server credentials:

```http
POST /api/v1/internal/weekly/ingest
Content-Type: application/json
X-Internal-API-Key: <weekly-ingest-secret>
```

The request includes `week_start`, `week_end`, the audited
`schema_checksum`, and exactly six regional manifest entries. Each entry has
this shape (date arrays abbreviated for readability):

```json
{
  "region": "yangon",
  "row_count": 123,
  "source_sha256": "<64-lowercase-hex-characters>",
  "coverage_metadata": {
    "week_start": "2026-08-03",
    "week_end": "2026-08-10",
    "observation_days": 7,
    "expected_days": 7,
    "coverage_ratio": 1,
    "is_partial_week": false,
    "source_coverage": { "chirps": 1, "era5": 1 },
    "source_observation_dates": {
      "chirps": ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"],
      "era5": ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]
    },
    "source_dates_used": {
      "chirps": ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"],
      "era5": ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]
    }
  }
}
```

Supported canonical regions are `yangon`, `bago`, `mandalay`, `sagaing`,
`magway`, and `ayeyawaddy`; every production ingest must include all six exactly
once. Fastify derives each input as
`<WEEKLY_DATA_DIR>/<week_start>/validated/<region>.csv`, verifies the declared
hash and row count, checks canonical IDs and coordinates, and requires identity
columns followed by the exact ordered 75 model features. It independently parses
the CSV coverage/provenance fields and requires them to equal the manifest. The
overall observation-day count is the intersection of CHIRPS and ERA5 dates, not
the smaller of two unrelated source counts.

The synchronous response contains `run_id`, aggregate `status`, `week_start`,
`week_end`, `model_catalog_version`, `schema_version`, model-policy flags, and a
status/cell count for each submitted region. An equivalent successful run is
idempotent. Failed or partially successful regions can be retried only with the
same source hash. Failed and partially successful runs can be claimed for retry;
an active pending/processing duplicate returns `409`. If such a run stops making
progress, it becomes reclaimable after `WEEKLY_RUN_STALE_AFTER_MS` (24 hours by
default). Keep this threshold longer than the maximum expected six-region run so
two workers cannot process the same run concurrently.

## 6. Read weekly results and run history

Examples below use the public key:

```bash
curl -fsS -H "X-API-Key: $BACKEND_API_KEY" \
  http://127.0.0.1:8000/api/v1/weekly/latest

curl -fsS -H "X-API-Key: $BACKEND_API_KEY" \
  http://127.0.0.1:8000/api/v1/weekly/2026-08-03/yangon

curl -fsS -H "X-API-Key: $BACKEND_API_KEY" \
  'http://127.0.0.1:8000/api/v1/pipeline/runs?limit=20&offset=0'
```

Only unexpired prediction payloads are returned. A known run whose payload has
expired returns `410`; an unknown week/region returns `404`.

## 7. Seven-day retention and cleanup

Each regional payload receives an expiry timestamp seven days after generation.
Fastify deletes expired payload rows every six hours by default. Operators can
also run either maintenance path:

```bash
cd backend
npm run cleanup:expired-predictions
```

```bash
curl -fsS -X POST \
  -H "X-Internal-API-Key: $INTERNAL_API_KEY" \
  http://127.0.0.1:8000/api/v1/internal/predictions/cleanup
```

Pipeline-run audit rows are retained; cleanup deletes the expiring regional JSON
payloads, not the run history.

## 8. Market-price refresh

`MARKET_PRICE_REFRESH_ENABLED=true` enables collection from the configured DOA,
MRF, CSO, and Wisarra URLs. It does not create an in-process network scheduler.
Run `npm run db:migrate` first and confirm both
`0003_market_commodity_coverage.sql` and `0004_market_mapping_version.sql` in
`schema_migrations`. The additive commodity migration allows valid non-model
Wisarra crops while retaining the exact canonical-key constraint. The mapping
version migration preserves old audit rows as `legacy` but serves only rows
written by the corrected active commodity mapper; trigger a refresh immediately
after deploying that migration.

The DOA collector discovers seller IDs from six exact official marketplace
labels, pins every request to the discovered source date, and fetches the six
all-category pages with concurrency capped at three. It validates the complete
13-category table inventory before accepting the snapshot. This bounded set was
selected from a read-only audit of all 28 seller filters on 2026-08-11; fetching
all 28 consumed nearly the entire 120-second source timeout and added no crop
beyond the selected set.

Trigger it once daily from the external scheduler, separate from the weekly model
job. The checked-in runner authenticates the request, validates the complete
response contract, and exits non-zero when any source fails:

```bash
BACKEND_URL=https://backend.example \
INTERNAL_API_KEY='<production-secret>' \
./scripts/run_market_refresh.sh
```

For a host scheduler, keep both values in its protected environment rather than
the crontab. One example is:

```cron
CRON_TZ=Asia/Yangon
0 8 * * * /absolute/path/to/myanmar-agri-geo-csv-pipeline/scripts/run_market_refresh.sh
```

The repository also includes `.github/workflows/market-price-refresh.yml`, which
runs at 08:00 Asia/Yangon and can be dispatched manually. Configure the protected
`production` environment secrets `MARKET_BACKEND_URL` and
`MARKET_INTERNAL_API_KEY` before enabling that workflow. A partial refresh fails
the scheduler job so source outages remain visible, even though the backend keeps
successful source snapshots. The runner refuses redirects so the internal key
cannot be forwarded to another origin, and it requires HTTPS except for loopback
or an explicitly trusted private-network HTTP deployment.

The equivalent direct request is:

```bash
curl -fsS -X POST \
  -H "X-Internal-API-Key: $INTERNAL_API_KEY" \
  http://127.0.0.1:8000/api/v1/internal/market-prices/refresh
```

Public reads are available at:

```text
GET /api/v1/market-prices/latest
GET /api/v1/market-prices/crops
GET /api/v1/market-prices/commodities/latest
GET /api/v1/market-prices/:crop/latest
GET /api/v1/market-prices/:crop/history
```

`/crops`, `/latest`, and the crop-specific routes retain the exact 17 canonical
model crops: monsoon rice, dry-season rice, black gram, groundnut, maize,
sugarcane, cassava, chili, tomato, green gram, pigeon pea, sesame, rubber,
durian, mangosteen, longan, and mango. The separate
`/commodities/latest` route returns the latest stored valid Wisarra crop
observations, including non-model crops, without changing that model catalog.
The refresh walks every available Wisarra result page; its bounded sequential
requests use the 120-second default `MARKET_PRICE_REQUEST_TIMEOUT_MS` budget.

Source currency, quantity, unit, marketplace, and source date are preserved;
prices on different bases are not averaged or silently converted. A source
failure can produce a partial refresh. Each successful adapter transaction
replaces its complete source/date snapshot, so same-day corrections and removed
rows do not leave a mixed snapshot. When a canonical crop has no
usable source observation, the canonical latest response returns
`no_current_data` instead of guessing or fabricating a price. The refresh
response also returns `coverage.total_crops`, `coverage.current_crops`,
`coverage.stale_crops`, and `coverage.missing_crops`. “Current” means at least
one stored source observation is no more than seven days old; “stale” means only
older observations exist. The scheduler validates that those arrays partition
the exact 17-crop catalog and warns whenever coverage is stale or missing.

### Current source limitations (audited 2026-08-11)

The bounded DOA set currently supplies 13 of the 17 canonical crops. Across all
28 DOA sellers, no priced row was published for cassava, durian, mangosteen, or
longan on the audited source date, so those crops must remain `no_current_data`
unless another verified source publishes them.

The MRF reference page currently publishes weekly image-only PDFs rather than a
machine-readable HTML price table. The adapter validates the latest report
period and fails closed instead of guessing prices. Consequently a refresh is
expected to be `partially_succeeded`, and the scheduler intentionally exits
non-zero, until MRF provides structured data or a separately validated OCR
ingestion path is introduced.

## 9. Fail-closed blocker and recovery

The current aligned `features_serving.parquet` contains a required column,
`surface_water_seasonality_months`, that is null for all 1,029,348 serving rows.
The validators intentionally reject it. Therefore the deployment and metadata
flow can be verified, but live regional inference cannot succeed until the
source/model-serving artifact is corrected with real finite values or the model
contract is deliberately versioned and retrained.

Do not substitute zero, mean, sentinel, or heuristic values. Do not loosen the
75-feature validator. The existing model repository, prototypes, fallbacks, and
all other behavior must remain unchanged.

After an authoritative artifact repair:

1. Re-run the Python dry-run and focused validation tests.
2. Confirm the exact 75-feature schema checksum is still the audited value.
3. Confirm `GET /health/ready` reports the expected model catalog.
4. Validate one regional artifact locally with a dry-run and review its hashes;
   a partial manifest is never published as a successful weekly release.
5. Submit the complete six-region manifest and review every regional audit.

The audited catalog currently flags every crop-suitability model. Keep
`ALLOW_FLAGGED_MODELS=false`; this yields healthy non-crop targets and explicitly
marks crop predictions unavailable. Turning it on requires a separately approved
model-risk decision and does not resolve the null feature blocker.
