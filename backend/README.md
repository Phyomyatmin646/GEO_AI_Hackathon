# Myanmar Agriculture Intelligence Gateway

This directory is the public Node.js/Fastify gateway. It does not load model
artifacts. The separately-run FastAPI service owns all model files and spatial
feature lookup.

```text
Browser / Next.js -> Node gateway :8000 -> FastAPI model service :8001
```

The gateway is fail-closed: it never creates mock predictions, confidence,
checksums, versions, or fallback feature rows. Responses from FastAPI must match
the versioned `model-inference-v1` contract before they are returned.

## Local setup

Requirements: Node.js 22.13 or newer. Start the FastAPI model repository on
`127.0.0.1:8001`, then:

```bash
npm ci
cp .env.example .env
npm run dev
```

The public gateway listens on `http://127.0.0.1:8000` by default. When this
gateway runs in Docker Desktop and FastAPI is published by a different Compose
project, set `MODEL_SERVER_URL=http://host.docker.internal:8001`.

Production requires distinct `API_KEY` (at least 16 characters) and
`MODEL_SERVER_API_KEY` (at least 24 characters). Placeholder values are refused.
Send the public key as `X-API-Key`; the gateway sends the internal key to FastAPI
as `X-Internal-API-Key`. Never expose the FastAPI service directly to browsers.
Production model-service URLs must use HTTPS unless HTTP is explicitly enabled
for a trusted private network with `ALLOW_INSECURE_MODEL_SERVER_HTTP=true`.

## Endpoints

- `GET /health/live` — Node process liveness; does not call FastAPI.
- `GET /health/ready` — ready only when model readiness and its authenticated,
  exact 40-model catalog both validate.
- `GET /api/v1/models` — validated proxy of the FastAPI model catalog.
- `POST /api/v1/predictions` — validated synchronous inference.
- `/api/v1/jobs/*` — explicitly returns `503`; Redis jobs are disabled in this
  release and no Redis connection is opened.

Example request using a source sample:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/predictions \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: replace_with_at_least_16_characters' \
  -H 'X-Request-ID: demo-001' \
  -d '{
    "sample_id": "00000000000000000001",
    "composite_features": ["crop_recommender"]
  }'
```

Coordinate lookup requires all three fields:

```json
{
  "lat": 16.8661,
  "lon": 96.1951,
  "observation_month": "2024-01",
  "include_all_targets": true
}
```

Exactly one locator is accepted: either `sample_id`, or
`lat + lon + observation_month`. Unknown target names, composite names and
request fields are rejected. `include_all_targets: true` cannot be combined
with `targets`; a target selection or a composite feature is required.

`X-Request-ID` is authoritative for tracing. If `request_id` is also placed in
the JSON body, it must match that header. Model output is returned only when the
locator, expanded target/composite set, maximum spatial distance, task shape,
model version, unit, catalog release, serving-data checksums and published
composite dependency capabilities match the validated catalog.

The production model service limits expanded synchronous requests to 17 model
targets, exactly enough for the bounded crop-suitability tier request.
`include_all_targets` still returns `REQUEST_TOO_EXPENSIVE`; it belongs in a
future durable asynchronous workflow.

## Validation

```bash
npm run validate
npm run build
```

`npm run validate` runs ESLint, TypeScript checking and the test suite. The
gateway tests inject a fake model-service client and never require Redis or
real model artifacts.
