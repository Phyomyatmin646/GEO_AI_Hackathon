# Myanmar Agriculture Intelligence Gateway

This directory contains the authenticated Fastify gateway. It validates weekly
model inputs, calls the separately-run `GEO_MODEL_SERVER`, and persists regional
results and market prices in PostgreSQL/Neon. It does not load or modify model
artifacts.

```text
Weekly Python -> Fastify :8000 -> GEO_MODEL_SERVER :8001
                         -> PostgreSQL/Neon
Browser / web ----------> Fastify public read APIs
```

The weekly path is fail-closed. Fastify derives trusted CSV paths from
`WEEKLY_DATA_DIR`, requires the exact ordered 75-feature contract, rejects
missing/non-finite values and unknown grid IDs, validates authenticated model
metadata, and never fabricates predictions or fallback feature rows.

## Local setup

Requirements: Node.js 22.13 or newer, PostgreSQL/Neon, and the separately-run
model server on `127.0.0.1:8001`.

```bash
npm ci
cp .env.example .env
# Replace DATABASE_URL and all three example keys in .env.
npm run db:migrate
npm run dev
```

The gateway listens on `http://127.0.0.1:8000`. `GET /health/live` checks only
the Fastify process; `GET /health/ready` requires both PostgreSQL and the
authenticated, checksum-matched model service.

`docker-compose.yml` does not create PostgreSQL or pgAdmin. Fastify connects to
an existing Neon or local PostgreSQL instance through `DATABASE_URL`. pgAdmin 4
is an optional external administration client and connects directly to that same
database host; it does not connect through Fastify. See
[Weekly Operations](../docs/WEEKLY_OPERATIONS.md#postgresql-topology-and-pgadmin-4)
for connection fields, table names, migration checks, and credential handling.

When Fastify runs in Docker and the model server is published on the host, use
`GEO_MODEL_SERVER_URL=http://host.docker.internal:8001`. The legacy
`MODEL_SERVER_URL` and `MODEL_SERVER_API_KEY` names remain compatibility aliases.

## Authentication and secrets

Use three distinct secrets:

- `API_KEY` (at least 16 characters): public API, sent as `X-API-Key`.
- `INTERNAL_API_KEY` (at least 24 characters): Python ingest and maintenance,
  sent as `X-Internal-API-Key`.
- `GEO_MODEL_SERVER_API_KEY` (at least 24 characters): Fastify-to-model-server
  authentication; it is never sent to Python or browsers.

Production refuses missing, repeated, or placeholder keys and requires
`DATABASE_URL`. Production model URLs must use HTTPS unless HTTP is explicitly
allowed for a trusted private network with
`ALLOW_INSECURE_MODEL_SERVER_HTTP=true`. That opt-in defaults to `false`,
including in Compose; never enable it for a public or untrusted network. Never
commit a populated `.env` file.

## Public, weekly, and market endpoints

All `/api/v1/*` public routes require `X-API-Key` when `API_KEY` is configured.
All `/api/v1/internal/*` routes always require `X-Internal-API-Key`.

- `POST /api/v1/internal/weekly/ingest` — trusted Python metadata ingest.
- `POST /api/v1/pipeline/weekly/run` — authenticated manual equivalent.
- `GET /api/v1/pipeline/runs` and `GET /api/v1/pipeline/runs/:id` — run audit.
- `GET /api/v1/weekly/latest` — latest unexpired regional payloads.
- `GET /api/v1/weekly/:weekStart` — all available regions for a Monday.
- `GET /api/v1/weekly/:weekStart/:region` — one regional payload.
- `POST /api/v1/users/register` — create a user profile with required
  `username`, `phone`, and `location`; `email` is optional.
- `GET /api/v1/daily/:date/map` — legacy flat-map compatibility view backed by
  weekly PostgreSQL payloads; no daily model pipeline is started.
- `POST /api/v1/internal/predictions/cleanup` — immediate expiry cleanup.
- `POST /api/v1/internal/market-prices/refresh` — refresh configured sources.
- `GET /api/v1/market-prices/latest` — latest prices, with optional filters.
- `GET /api/v1/market-prices/crops` — the exact 17 model crop keys.
- `GET /api/v1/market-prices/commodities/latest` — current valid Wisarra crop
  observations, including additional non-model crops, with source price basis
  and pagination retained.
- `GET /api/v1/market-prices/:crop/latest` and
  `GET /api/v1/market-prices/:crop/history` — crop-specific reads.

The canonical endpoints remain limited to the 17 model crops: monsoon rice,
dry-season rice, black gram, groundnut, maize, sugarcane, cassava, chili,
tomato, green gram, pigeon pea, sesame, rubber, durian, mangosteen, longan,
and mango. The Wisarra commodity endpoint is the separate read path for those
crops plus other valid crop observations; it does not expand the model catalog.
Wisarra refresh follows every available results page, so the default
`MARKET_PRICE_REQUEST_TIMEOUT_MS` is 120 seconds for the bounded sequential
requests.

The legacy model catalog and single-prediction routes remain registered, but
the weekly production path uses the model server's authenticated batch endpoint.
Async Redis jobs remain disabled and return `503`.

The complete request contract, scheduler examples, migration and recovery steps
are in [Weekly Operations](../docs/WEEKLY_OPERATIONS.md).

User registration stores profile data only; it does not create a password,
login session, access token, or verified phone/email identity. Unknown fields
are rejected. Myanmar local phone input beginning with `0` is stored in
canonical `+95...` form. When `API_KEY` is configured, call the route through
the included Next.js server route at the same path; it adds `X-API-Key` on the
server. Do not expose that key in browser JavaScript.

```bash
curl -X POST http://127.0.0.1:8000/api/v1/users/register \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: replace_with_your_public_api_key' \
  -d '{
    "username": "farmer_01",
    "phone": "09123456789",
    "location": "Ayeyawaddy",
    "email": "farmer@example.com"
  }'
```

The production weekly release always covers these six canonical regions:
`yangon`, `bago`, `mandalay`, `sagaing`, `magway`, and `ayeyawaddy`.

## Current live-data blocker

The audited aligned serving artifact currently has
`surface_water_seasonality_months` null for every row. Both Python and Fastify
correctly reject that non-finite required feature, so live weekly inference will
fail closed until the source/model-serving artifact is repaired. Do not replace
it with zero or another default. The model repository, its fallbacks, and its
other behavior remain unchanged by this integration.

Also, all 17 crop-suitability models are flagged in the audited catalog.
`ALLOW_FLAGGED_MODELS=false` is therefore the safe default and reports crop
predictions as unavailable. Enabling flagged models is an explicit operational
policy decision, not a data-quality fix.

## Validation

```bash
npm run validate
npm run build
```

The test suite injects fake model and database boundaries. A live PostgreSQL/Neon
migration check requires a separately supplied test database URL.
