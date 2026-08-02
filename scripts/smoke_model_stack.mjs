#!/usr/bin/env node

const modelUrl = process.env.MODEL_SERVER_URL ?? "http://127.0.0.1:8001";
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const webUrl = process.env.WEB_URL ?? "http://127.0.0.1:3000";
const backendKey =
  process.env.BACKEND_API_KEY ?? "dev-public-gateway-key-replace-before-production";
const modelKey =
  process.env.MODEL_SERVER_API_KEY ?? "dev-internal-model-key-replace-before-production";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonRequest(url, init = {}) {
  const started = performance.now();
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(45_000),
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  return { payload, elapsedMs: Math.round((performance.now() - started) * 10) / 10 };
}

const internalHeaders = { "X-Internal-API-Key": modelKey };
const publicHeaders = { "X-API-Key": backendKey };
const modelReady = await jsonRequest(`${modelUrl}/api/v1/ready`, {
  headers: internalHeaders,
});
const modelCatalog = await jsonRequest(`${modelUrl}/api/v1/models`, {
  headers: internalHeaders,
});
const backendReady = await jsonRequest(`${backendUrl}/health/ready`);
const gatewayCatalog = await jsonRequest(`${backendUrl}/api/v1/models`, {
  headers: publicHeaders,
});

invariant(modelReady.payload.catalog_version === modelCatalog.payload.catalog_version,
  "model readiness and catalog releases differ");
invariant(gatewayCatalog.payload.catalog_version === modelCatalog.payload.catalog_version,
  "gateway validated a different catalog release");
invariant(gatewayCatalog.payload.feature_dataset_sha256 === modelCatalog.payload.feature_dataset_sha256,
  "gateway feature release differs from model server");
invariant(modelCatalog.payload.capabilities?.supports_composite_only_requests === true,
  "composite-only capability is missing");
invariant(modelCatalog.payload.capabilities?.composite_dependencies?.economic_roi?.length === 0,
  "economic ROI dependencies drifted");
invariant(modelCatalog.payload.capabilities?.composite_dependencies?.crop_recommender?.length === 17,
  "crop recommender must resolve exactly 17 crop targets");

const locator = {
  lat: 15.772602,
  lon: 94.858046,
  observation_month: "2018-01",
};
const economic = await jsonRequest(`${backendUrl}/api/v1/predictions`, {
  method: "POST",
  headers: { ...publicHeaders, "Content-Type": "application/json" },
  body: JSON.stringify({ ...locator, composite_features: ["economic_roi"] }),
});
invariant(Object.keys(economic.payload.predictions).length === 0,
  "unavailable ROI must not run unrelated models");
invariant(economic.payload.composite_features?.economic_roi?.status === "unavailable",
  "economic ROI did not return typed unavailable");

const recommender = await jsonRequest(`${backendUrl}/api/v1/predictions`, {
  method: "POST",
  headers: { ...publicHeaders, "Content-Type": "application/json" },
  body: JSON.stringify({ ...locator, composite_features: ["crop_recommender"] }),
});
invariant(Object.keys(recommender.payload.predictions).length === 17,
  "crop recommender did not return all 17 suitability outputs");
invariant(recommender.payload.catalog_version === modelCatalog.payload.catalog_version,
  "prediction release differs from validated catalog");
invariant(recommender.payload.composite_features?.crop_recommender?.strict_ranking_available === false,
  "recommender must not claim a calibrated strict rank");

const webPrediction = await jsonRequest(`${webUrl}/api/v1/predictions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...locator, targets: ["crop_health_score"] }),
});
invariant(webPrediction.payload.catalog_version === modelCatalog.payload.catalog_version,
  "website BFF returned a different release");

console.log(JSON.stringify({
  status: "passed",
  catalog_version: modelCatalog.payload.catalog_version,
  model_count: modelCatalog.payload.models.length,
  timings_ms: {
    model_ready: modelReady.elapsedMs,
    backend_ready: backendReady.elapsedMs,
    economic_roi: economic.elapsedMs,
    crop_recommender: recommender.elapsedMs,
    website_bff: webPrediction.elapsedMs,
  },
}, null, 2));

