import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { csvValue } from "../app/lib/csv-value.ts";
import { en } from "../app/lib/dictionaries.ts";
import { CROP_CALENDAR_MODEL_KEYS } from "../app/lib/crop-calendar-contract.ts";
import { MARKET_CROP_KEYS } from "../app/lib/market-contract.ts";
import { CORE_MODEL_TARGETS } from "../app/lib/model-contract.ts";
import {
  formatMarketDate,
  formatMarketNumber,
  localizeMarketValue,
  marketMyanmarDictionaryCounts,
} from "../app/lib/market-localization.ts";
import {
  localizeBilingualLabel,
  localizeBilingualNarrative,
  localizeFactor,
  localizeRegion,
  normalizeLanguage,
} from "../app/lib/localization.ts";

let workerPromise;

async function worker() {
  if (workerPromise) return workerPromise;
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  workerPromise = import(workerUrl.href).then((module) => module.default);
  return workerPromise;
}

async function request(path, init) {
  const app = await worker();
  return app.fetch(
    new Request(new URL(path, "http://localhost"), init),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function withMockBackend(handler, callback) {
  const backend = createServer(handler);
  await new Promise((resolve, reject) => {
    backend.once("error", reject);
    backend.listen(0, "127.0.0.1", resolve);
  });
  const address = backend.address();
  assert.ok(address && typeof address !== "string");
  const previousUrl = process.env.BACKEND_URL;
  const previousKey = process.env.BACKEND_API_KEY;
  const previousAllowInsecure = process.env.ALLOW_INSECURE_BACKEND_HTTP;
  process.env.BACKEND_URL = `http://127.0.0.1:${address.port}`;
  process.env.BACKEND_API_KEY = "server-only-integration-key";
  delete process.env.ALLOW_INSECURE_BACKEND_HTTP;
  try {
    return await callback();
  } finally {
    if (previousUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previousUrl;
    if (previousKey === undefined) delete process.env.BACKEND_API_KEY;
    else process.env.BACKEND_API_KEY = previousKey;
    if (previousAllowInsecure === undefined) delete process.env.ALLOW_INSECURE_BACKEND_HTTP;
    else process.env.ALLOW_INSECURE_BACKEND_HTTP = previousAllowInsecure;
    await new Promise((resolve, reject) => {
      backend.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

const HEALTHY_WEEKLY_TARGETS = [
  "crop_health_score",
  "crop_yield_t_ha",
  "flood_risk_level",
  "drought_risk_score",
  "nitrogen_requirement_level",
  "phosphorus_requirement_level",
  "soil_erosion_risk",
  "market_integration_score",
  "post_harvest_loss_risk",
  "irrigation_potential",
  "agricultural_gdp_forecast",
];

function weeklyPrediction(target, index) {
  const classification = target.endsWith("_level") || target.endsWith("_risk") || target === "flood_risk_level";
  return {
    value: classification ? "moderate" : index + 0.25,
    label: classification ? "Moderate" : null,
    unit: classification ? "class_0_to_2" : "score_0_to_1",
    task_type: classification ? "classification" : "regression",
    confidence: index === 0 ? null : 0.81,
    confidence_kind: index === 0 ? null : "random_forest_vote_share_uncalibrated",
    probabilities: classification ? { low: 0.1, moderate: 0.81, high: 0.09 } : null,
    model_version: `sha256-${String(index + 1).padStart(12, "0")}`,
    validation_status: "healthy",
    warnings: index === 0 ? ["Experimental surrogate output."] : [],
  };
}

function weeklyFixture({
  region = "yangon",
  gridIds,
  targets = HEALTHY_WEEKLY_TARGETS,
  pipelineRunId = "pipeline-run-1",
  detailPipelineRunId = pipelineRunId,
  expiresAt = "2099-08-18T00:00:00.000Z",
}) {
  const weekStart = "2026-08-10";
  const weekEnd = "2026-08-17";
  const catalogVersion = "catalog-version-fixture";
  const schemaVersion = "weekly-model-input-v1";
  const coverage = {
    week_start: weekStart,
    week_end: weekEnd,
    observation_days: 7,
    expected_days: 7,
    coverage_ratio: 1,
    is_partial_week: false,
    source_coverage: { chirps: 1, era5: 1 },
    source_observation_dates: { chirps: [], era5: [] },
    source_dates_used: { chirps: [], era5: [] },
  };
  const common = {
    id: "regional-record-1",
    pipeline_run_id: pipelineRunId,
    region,
    week_start: weekStart,
    week_end: weekEnd,
    cell_count: gridIds.length,
    source_sha256: "a".repeat(64),
    prediction_sha256: "b".repeat(64),
    model_catalog_version: catalogVersion,
    schema_version: schemaVersion,
    coverage_metadata: coverage,
    created_at: "2026-08-11T03:00:00.000Z",
    expires_at: expiresAt,
  };
  const cells = gridIds.map((gridId, cellIndex) => ({
    grid_id: gridId,
    latitude: 16.8 + cellIndex * 0.01,
    longitude: 96.1 + cellIndex * 0.01,
    predictions: {
      values: Object.fromEntries(targets.map((target, index) => [
        target,
        weeklyPrediction(target, index),
      ])),
      errors: targets.length === CORE_MODEL_TARGETS.length
        ? {}
        : { heat_stress_risk: { code: "TARGET_DISABLED", message: "Target disabled by policy." } },
    },
  }));
  return {
    latest: {
      week_start: weekStart,
      week_end: weekEnd,
      model_catalog_version: catalogVersion,
      schema_version: schemaVersion,
      regions: [common],
    },
    detail: {
      ...common,
      pipeline_run_id: detailPipelineRunId,
      payload: {
        schema_version: schemaVersion,
        model_catalog_version: catalogVersion,
        week_start: weekStart,
        week_end: weekEnd,
        region,
        cell_count: gridIds.length,
        generated_at: "2026-08-11T03:00:00.000Z",
        coverage_metadata: coverage,
        model_policy: {
          targets,
          allow_flagged_models: targets.length === CORE_MODEL_TARGETS.length,
          crop_predictions_available: targets.some((target) => target.startsWith("crop_suitability_")),
        },
        cells,
      },
    },
  };
}

test("server-renders the Myanmar GeoAI product shell", async () => {
  const response = await request("/", {
    headers: { accept: "text/html" },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /စိုက်ပျိုးမိတ်ဆွေ/);
  assert.match(html, /Myanmar Agriculture Intelligence/);
  assert.match(html, /official-source agriculture, climate and economic evidence/);
  assert.match(html, /Real pilot data/);
  assert.match(html, /QA စစ်ပြီးသော ဒေသအလိုက် ၅ ကီလိုမီတာ cell/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("v1 API exposes the runtime-validated real pilot contract", async () => {
  const response = await request("/api/v1/cells?limit=3");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-api-version"), "1");
  assert.equal(
    response.headers.get("x-data-contract"),
    payload.meta.dataContract,
  );
  assert.equal(
    response.headers.get("x-source-manifest-sha256"),
    payload.meta.sourceManifestSha256,
  );
  assert.equal(payload.apiVersion, "v1");
  assert.equal(payload.schemaVersion, "1.0.0");
  assert.equal(
    payload.meta.dataMode,
    "real_features_rule_based_recommendations",
  );
  assert.equal(payload.meta.qa.valid, true);
  assert.equal(payload.meta.qa.errorCount, 0);
  assert.equal(payload.meta.configuredCrops.length, 11);
  assert.equal(new Set(payload.meta.configuredCrops).size, 11);
  assert.match(payload.meta.sourceManifestSha256, /^[a-f0-9]{64}$/);
  assert.ok(
    payload.meta.sources.every((source) => {
      const sourceUrl = new URL(source.sourceUrl);
      return sourceUrl.protocol === "https:";
    }),
  );
  assert.equal(
    payload.meta.scoredCellCount + payload.meta.abstainedCellCount,
    payload.meta.rowCount,
  );
  assert.ok(payload.meta.rowCount > 0);
  assert.equal(payload.cells.length, 3);
  assert.equal(payload.pagination.returned, 3);
  assert.equal(
    payload.links.selectedCellCsvTemplate,
    "/api/v1/cells/{cell_id}/report.csv?region={region}",
  );
  assert.ok(
    payload.cells.every(
      (cell) =>
        cell.labelSource === "rule_based" &&
        cell.observedLabelCount === 0 &&
        !JSON.stringify(cell).includes("rule_based_fixture"),
    ),
  );
});

test("v1 API can return every Ayeyawaddy pilot cell for the map", async () => {
  const response = await request("/api/v1/cells?limit=2000");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.pagination.total, payload.meta.rowCount);
  assert.equal(payload.pagination.returned, payload.meta.rowCount);
  assert.equal(payload.cells.length, payload.meta.rowCount);
  assert.equal(payload.pagination.offset, 0);
});

test("home BFF returns one frontend payload with an explicit historical mode", async () => {
  const response = await request("/api/v1/home?region=yangon&period=pilot");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-home-data-mode"), "historical");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(payload.meta.region, "Yangon");
  assert.equal(payload.live.mode, "historical");
  assert.equal(payload.live.requestedPeriod, "pilot");
  assert.equal(payload.live.weekStart, null);
  assert.equal(payload.live.cropPredictionsAvailable, false);
  assert.deepEqual(payload.live.cells, []);
  assert.equal(payload.cells.length, payload.meta.rowCount);
});

test("home BFF rejects unsupported periods without contacting the backend", async () => {
  const response = await request("/api/v1/home?region=yangon&period=future");
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "INVALID_PERIOD");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("home BFF performs two bounded regional calls and preserves exact grid predictions", async () => {
  const seedResponse = await request("/api/v1/cells?region=yangon&limit=1");
  const seed = await seedResponse.json();
  const gridId = seed.cells[0].id;
  const upstreamRequests = [];

  await withMockBackend((incoming, outgoing) => {
    const requestId = String(incoming.headers["x-request-id"] ?? "missing");
    const targets = requestId === "home-full-40" ? CORE_MODEL_TARGETS : HEALTHY_WEEKLY_TARGETS;
    const fixture = weeklyFixture({ gridIds: [gridId], targets });
    upstreamRequests.push({
      url: incoming.url,
      requestId,
      apiKey: incoming.headers["x-api-key"],
    });
    const payload = incoming.url === "/api/v1/weekly/latest" ? fixture.latest : fixture.detail;
    outgoing.writeHead(200, {
      "content-type": "application/json",
      "x-request-id": requestId,
    });
    outgoing.end(JSON.stringify(payload));
  }, async () => {
    const active = await request("/api/v1/home?region=yangon&period=latest", {
      headers: { "x-request-id": "home-active-11" },
    });
    const activePayload = await active.json();
    assert.equal(active.status, 200);
    assert.equal(active.headers.get("x-home-data-mode"), "weekly");
    assert.equal(active.headers.get("x-request-id"), "home-active-11");
    assert.equal(activePayload.live.mode, "weekly");
    assert.equal(activePayload.live.cells.length, 1);
    assert.equal(activePayload.live.cells[0].gridId, gridId);
    assert.equal(Object.keys(activePayload.live.cells[0].predictions).length, 11);
    assert.equal(activePayload.live.cells[0].predictions.crop_health_score.value, 0.25);
    assert.equal(activePayload.live.cells[0].predictions.crop_health_score.confidence, null);
    assert.deepEqual(activePayload.live.cells[0].predictions.crop_health_score.warnings, [
      "Experimental surrogate output.",
    ]);
    assert.equal(activePayload.live.cells[0].errors.heat_stress_risk.code, "TARGET_DISABLED");
    assert.equal(activePayload.live.telemetry.declaredCellCount, 1);
    assert.equal(activePayload.live.telemetry.decodedCellCount, 1);
    assert.equal(activePayload.live.telemetry.matchedCellCount, 1);
    assert.equal(activePayload.live.telemetry.droppedCellCount, 0);
    assert.ok(activePayload.live.telemetry.latestResponseBytes < 1024 * 1024);
    assert.ok(activePayload.live.telemetry.regionalResponseBytes > activePayload.live.telemetry.latestResponseBytes);
    assert.equal(CORE_MODEL_TARGETS.length, 40);
    assert.equal(activePayload.live.cells[0].predictions.crop_suitability_monsoon_rice, undefined);

    const full = await request("/api/v1/home?region=yangon&period=latest", {
      headers: { "x-request-id": "home-full-40" },
    });
    const fullPayload = await full.json();
    assert.equal(fullPayload.live.mode, "weekly");
    assert.equal(Object.keys(fullPayload.live.cells[0].predictions).length, 40);
    assert.equal(fullPayload.live.cropPredictionsAvailable, true);
    assert.equal(fullPayload.live.allowFlaggedModels, true);
  });

  assert.deepEqual(upstreamRequests.map(({ url }) => url), [
    "/api/v1/weekly/latest",
    "/api/v1/weekly/2026-08-10/yangon",
    "/api/v1/weekly/latest",
    "/api/v1/weekly/2026-08-10/yangon",
  ]);
  assert.ok(upstreamRequests.every(({ apiKey }) => apiKey === "server-only-integration-key"));
  assert.deepEqual(upstreamRequests.map(({ requestId }) => requestId), [
    "home-active-11",
    "home-active-11",
    "home-full-40",
    "home-full-40",
  ]);
});

test("home BFF distinguishes weekly stages, expiry, overlap, and identity failures", async () => {
  const seedResponse = await request("/api/v1/cells?region=yangon&limit=1");
  const seed = await seedResponse.json();
  const gridId = seed.cells[0].id;
  const unknownGridId = "mm_999999_999999";

  await withMockBackend((incoming, outgoing) => {
    const requestId = String(incoming.headers["x-request-id"] ?? "missing");
    const isLatest = incoming.url === "/api/v1/weekly/latest";
    const fixture = requestId === "home-partial-overlap"
      ? weeklyFixture({ gridIds: [gridId, unknownGridId] })
      : requestId === "home-zero-overlap"
        ? weeklyFixture({ gridIds: [unknownGridId] })
        : requestId === "home-identity-mismatch"
          ? weeklyFixture({ gridIds: [gridId], detailPipelineRunId: "different-run" })
          : requestId === "home-expired"
            ? weeklyFixture({ gridIds: [gridId], expiresAt: "2020-08-18T00:00:00.000Z" })
            : requestId === "home-region-missing"
              ? weeklyFixture({ region: "bago", gridIds: [gridId] })
              : weeklyFixture({ gridIds: [gridId] });

    if (requestId === "home-unauthorized" && isLatest) {
      outgoing.writeHead(401, { "content-type": "application/json", "x-request-id": requestId });
      outgoing.end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "hidden" }, request_id: requestId }));
      return;
    }
    if (requestId === "home-database-missing" && isLatest) {
      outgoing.writeHead(503, { "content-type": "application/json", "x-request-id": requestId });
      outgoing.end(JSON.stringify({ error: { code: "DATABASE_NOT_CONFIGURED", message: "hidden" }, request_id: requestId }));
      return;
    }
    if (requestId === "home-timeout-status" && isLatest) {
      outgoing.writeHead(504, { "content-type": "application/json", "x-request-id": requestId });
      outgoing.end(JSON.stringify({ error: { code: "UPSTREAM_TIMEOUT", message: "hidden" }, request_id: requestId }));
      return;
    }
    if (requestId === "home-malformed-content" && isLatest) {
      outgoing.writeHead(200, { "content-type": "text/plain", "x-request-id": requestId });
      outgoing.end("not json");
      return;
    }
    if (requestId === "home-regional-404" && !isLatest) {
      outgoing.writeHead(404, { "content-type": "application/json", "x-request-id": requestId });
      outgoing.end(JSON.stringify({ error: { code: "WEEKLY_PREDICTION_NOT_FOUND", message: "hidden" }, request_id: requestId }));
      return;
    }
    if (requestId === "home-regional-410" && !isLatest) {
      outgoing.writeHead(410, { "content-type": "application/json", "x-request-id": requestId });
      outgoing.end(JSON.stringify({ error: { code: "WEEKLY_PREDICTION_EXPIRED", message: "hidden" }, request_id: requestId }));
      return;
    }
    outgoing.writeHead(200, { "content-type": "application/json", "x-request-id": requestId });
    outgoing.end(JSON.stringify(isLatest ? fixture.latest : fixture.detail));
  }, async () => {
    const cases = [
      ["home-region-missing", "region_missing", "latest_metadata", false],
      ["home-expired", "weekly_predictions_expired", "latest_metadata", false],
      ["home-zero-overlap", "grid_id_mismatch", "regional_payload", false],
      ["home-identity-mismatch", "latest_region_contract_mismatch", "regional_payload", false],
      ["home-regional-404", "regional_payload_not_found", "regional_payload", false],
      ["home-regional-410", "regional_payload_expired", "regional_payload", false],
      ["home-unauthorized", "unauthorized", "latest_metadata", false],
      ["home-database-missing", "database_not_configured", "latest_metadata", false],
      ["home-timeout-status", "backend_timeout", "latest_metadata", true],
      ["home-malformed-content", "latest_metadata_invalid", "latest_metadata", false],
    ];
    for (const [requestId, reason, stage, retryable] of cases) {
      const response = await request("/api/v1/home?region=yangon&period=latest", {
        headers: { "x-request-id": requestId },
      });
      const payload = await response.json();
      assert.equal(response.status, 200, requestId);
      assert.equal(payload.live.mode, "historical", requestId);
      assert.equal(payload.live.unavailableReason, reason, requestId);
      assert.equal(payload.live.diagnostics.failingStage, stage, requestId);
      assert.equal(payload.live.diagnostics.retryable, retryable, requestId);
      assert.equal(payload.live.diagnostics.requestId, requestId, requestId);
    }

    const partial = await request("/api/v1/home?region=yangon&period=latest", {
      headers: { "x-request-id": "home-partial-overlap" },
    });
    const partialPayload = await partial.json();
    assert.equal(partialPayload.live.mode, "weekly");
    assert.equal(partialPayload.live.cells.length, 1);
    assert.equal(partialPayload.live.cells[0].gridId, gridId);
    assert.equal(partialPayload.live.telemetry.decodedCellCount, 2);
    assert.equal(partialPayload.live.telemetry.matchedCellCount, 1);
    assert.equal(partialPayload.live.telemetry.droppedCellCount, 1);
    assert.equal(partialPayload.live.telemetry.unmatchedGridIdCount, 1);
  });
});

test("daily map BFF validates the compatibility payload before attaching polygons", async () => {
  const seedResponse = await request("/api/v1/cells?region=yangon&limit=1");
  const seed = await seedResponse.json();
  const cell = seed.cells[0];
  const upstreamRequests = [];

  await withMockBackend((incoming, outgoing) => {
    const requestId = String(incoming.headers["x-request-id"] ?? "missing");
    upstreamRequests.push({
      url: incoming.url,
      apiKey: incoming.headers["x-api-key"],
      requestId,
    });
    if (requestId === "daily-expired") {
      outgoing.writeHead(410, { "content-type": "application/json", "x-request-id": requestId });
      outgoing.end(JSON.stringify({ error: { code: "WEEKLY_PREDICTIONS_EXPIRED", message: "hidden" }, request_id: requestId }));
      return;
    }
    if (requestId === "daily-invalid-contract") {
      outgoing.writeHead(200, { "content-type": "application/json", "x-request-id": requestId });
      outgoing.end(JSON.stringify([{ index: cell.id, region: "yangon" }]));
      return;
    }
    const payload = [{
      index: cell.id,
      grid_id: cell.id,
      region: "yangon",
      lat: cell.latitude,
      lon: cell.longitude,
      observation_date: "2026-08-16",
      week_start: "2026-08-10",
      week_end: "2026-08-17",
      source_date: "2026-08-16",
      source_age_days: 0,
      predictions: {
        crop_health_score: {
          value: 0.72,
          label: null,
          unit: "score_0_to_1",
        },
      },
      recommendations: [["monsoon_rice", 82.5]],
      top_crop: "monsoon_rice",
      top_score: 82.5,
      color: null,
      data_quality: { warnings: ["Experimental prediction."] },
    }];
    outgoing.writeHead(200, { "content-type": "application/json", "x-request-id": requestId });
    outgoing.end(JSON.stringify(payload));
  }, async () => {
    const response = await request("/api/v1/daily/latest/map", {
      headers: { "x-request-id": "daily-success" },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-daily-data-state"), "success");
    assert.equal(payload.length, 1);
    assert.equal(payload[0].index, cell.id);
    assert.equal(payload[0].latitude, cell.latitude);
    assert.equal(payload[0].topCrop, "monsoon_rice");
    assert.ok(Array.isArray(payload[0].polygon));
    assert.equal(payload[0].lat, undefined);

    const expired = await request("/api/v1/daily/latest/map", {
      headers: { "x-request-id": "daily-expired" },
    });
    assert.equal(expired.status, 410);
    assert.equal((await expired.json()).error.code, "WEEKLY_PREDICTIONS_EXPIRED");

    const invalid = await request("/api/v1/daily/latest/map", {
      headers: { "x-request-id": "daily-invalid-contract" },
    });
    assert.equal(invalid.status, 502);
    assert.equal((await invalid.json()).error.code, "BACKEND_CONTRACT_ERROR");

    const badDate = await request("/api/v1/daily/2026-99-99/map", {
      headers: { "x-request-id": "daily-bad-date" },
    });
    assert.equal(badDate.status, 400);
    assert.equal((await badDate.json()).error.code, "INVALID_DATE");
  });

  assert.deepEqual(upstreamRequests.map(({ url }) => url), [
    "/api/v1/daily/latest/map",
    "/api/v1/daily/latest/map",
    "/api/v1/daily/latest/map",
  ]);
  assert.ok(upstreamRequests.every(({ apiKey }) => apiKey === "server-only-integration-key"));
});

test("v1 API selects each named regional bundle", async () => {
  const expectedRows = {
    ayeyawaddy: 1344,
    sagaing: 3766,
    mandalay: 1531,
    bago: 1549,
    magway: 1781,
  };
  for (const [region, rowCount] of Object.entries(expectedRows)) {
    const response = await request(`/api/v1/cells?region=${region}&limit=1`);
    const payload = await response.json();

    assert.equal(response.status, 200, region);
    assert.equal(payload.cells.length, 1, region);
    assert.equal(payload.meta.rowCount, rowCount, region);
    assert.equal(payload.pagination.total, rowCount, region);
    assert.equal(payload.pagination.returned, 1, region);
  }
});

test("v1 API can return every Sagaing cell without map truncation", async () => {
  const response = await request("/api/v1/cells?region=sagaing&limit=5000");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.meta.rowCount, 3766);
  assert.equal(payload.pagination.returned, 3766);
  assert.equal(payload.cells.length, 3766);
});

test("v1 API filters by cell, month, status, and training usability", async () => {
  const seedResponse = await request("/api/v1/cells?region=ayeyawaddy&limit=1");
  const seed = await seedResponse.json();
  const cell = seed.cells[0];
  assert.ok(cell);

  const query = new URLSearchParams({
    cell_id: cell.id,
    region: "AYEYAWADDY",
    month: cell.month,
    recommendation_status: cell.recommendationStatus,
    usable_for_training: String(cell.usableForTraining),
    limit: "10",
  });
  const response = await request(`/api/v1/cells?${query}`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.pagination.total, 1);
  assert.equal(payload.cells.length, 1);
  assert.equal(payload.cells[0].id, cell.id);
});

test("v1 API returns stable JSON errors for invalid and missing filters", async () => {
  const invalidMonth = await request("/api/v1/cells?month=2018-13");
  const invalidPayload = await invalidMonth.json();
  assert.equal(invalidMonth.status, 400);
  assert.equal(invalidPayload.error.code, "INVALID_QUERY_PARAMETER");
  assert.equal(invalidPayload.error.parameter, "month");
  assert.equal(invalidMonth.headers.get("cache-control"), "no-store");

  const unsupported = await request("/api/v1/cells?unknown=value");
  const unsupportedPayload = await unsupported.json();
  assert.equal(unsupported.status, 400);
  assert.equal(
    unsupportedPayload.error.code,
    "UNSUPPORTED_QUERY_PARAMETER",
  );

  const missing = await request(
    "/api/v1/cells?cell_id=mm_cell_that_does_not_exist",
  );
  const missingPayload = await missing.json();
  assert.equal(missing.status, 404);
  assert.equal(missingPayload.error.code, "CELL_NOT_FOUND");

  const unknownRegion = await request("/api/v1/cells?region=unknown");
  const unknownRegionPayload = await unknownRegion.json();
  assert.equal(unknownRegion.status, 400);
  assert.equal(unknownRegionPayload.error.code, "UNKNOWN_REGION");
  assert.equal(unknownRegionPayload.error.parameter, "region");
});

test("registration BFF rejects unsafe requests before contacting Fastify", async () => {
  const wrongType = await request("/api/v1/users/register", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  assert.equal(wrongType.status, 415);
  assert.equal((await wrongType.json()).error.code, "UNSUPPORTED_MEDIA_TYPE");

  const crossSite = await request("/api/v1/users/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "cross-site",
    },
    body: "{}",
  });
  assert.equal(crossSite.status, 403);
  assert.equal((await crossSite.json()).error.code, "CROSS_SITE_REQUEST_REJECTED");

  const invalidJson = await request("/api/v1/users/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error.code, "INVALID_JSON");

  const oversized = await request("/api/v1/users/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ location: "x".repeat(9 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "PAYLOAD_TOO_LARGE");
  assert.equal(oversized.headers.get("cache-control"), "no-store");
});

test("registration BFF forwards profile creation and preserves safe conflict states", async () => {
  const upstreamRequests = [];
  await withMockBackend((incoming, outgoing) => {
    const chunks = [];
    incoming.on("data", (chunk) => chunks.push(chunk));
    incoming.on("end", () => {
      const requestId = String(incoming.headers["x-request-id"] ?? "missing");
      upstreamRequests.push({
        url: incoming.url,
        method: incoming.method,
        apiKey: incoming.headers["x-api-key"],
        requestId,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      });
      if (requestId === "register-conflict") {
        outgoing.writeHead(409, { "content-type": "application/json", "x-request-id": requestId });
        outgoing.end(JSON.stringify({ error: { code: "USER_ALREADY_EXISTS", message: "A user already exists." }, request_id: requestId }));
        return;
      }
      outgoing.writeHead(201, { "content-type": "application/json", "x-request-id": requestId });
      outgoing.end(JSON.stringify({
        user: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          username: "farmer_01",
          phone: "+959123456789",
          location: "Yangon",
          email: null,
          created_at: "2026-08-12T01:00:00.000Z",
        },
      }));
    });
  }, async () => {
    const body = { username: "farmer_01", phone: "09123456789", location: "Yangon" };
    const created = await request("/api/v1/users/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "register-success" },
      body: JSON.stringify(body),
    });
    assert.equal(created.status, 201);
    assert.equal(created.headers.get("x-request-id"), "register-success");
    const createdPayload = await created.json();
    assert.equal(createdPayload.user.username, "farmer_01");
    assert.equal(createdPayload.user.password, undefined);

    const conflict = await request("/api/v1/users/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "register-conflict" },
      body: JSON.stringify(body),
    });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.code, "USER_ALREADY_EXISTS");
  });
  assert.equal(upstreamRequests.length, 2);
  assert.ok(upstreamRequests.every(({ url }) => url === "/api/v1/users/register"));
  assert.ok(upstreamRequests.every(({ apiKey }) => apiKey === "server-only-integration-key"));
  assert.deepEqual(upstreamRequests[0].body, {
    username: "farmer_01",
    phone: "09123456789",
    location: "Yangon",
  });
});

test("chatbot BFF uses Fastify, disables unconsented model context, and maps safe errors", async () => {
  const upstreamRequests = [];
  await withMockBackend((incoming, outgoing) => {
    const chunks = [];
    incoming.on("data", (chunk) => chunks.push(chunk));
    incoming.on("end", () => {
      const requestId = String(incoming.headers["x-request-id"] ?? "missing");
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      upstreamRequests.push({
        url: incoming.url,
        apiKey: incoming.headers["x-api-key"],
        requestId,
        body,
      });
      if (requestId === "chat-not-configured") {
        outgoing.writeHead(503, { "content-type": "application/json", "x-request-id": requestId });
        outgoing.end(JSON.stringify({ error: { code: "CHATBOT_API_KEY_NOT_CONFIGURED", message: "secret detail" }, request_id: requestId }));
        return;
      }
      if (requestId === "chat-bad-contract") {
        outgoing.writeHead(200, { "content-type": "application/json", "x-request-id": requestId });
        outgoing.end(JSON.stringify({ response: "Missing required contract fields" }));
        return;
      }
      outgoing.writeHead(200, { "content-type": "application/json", "x-request-id": requestId });
      outgoing.end(JSON.stringify({
        api_version: "v1",
        request_id: requestId,
        status: "success",
        response: "The QA report records schema, coverage, and provenance checks.",
        language: body.user_info.preferred_language,
        context_used: {
          user: null,
          location_matched: null,
          model_predictions_summary: null,
          market_prices_summary: null,
          knowledge_sources: [{ title: "Myanmar Department of Agriculture", reference: "DOA" }],
        },
        metadata: {
          model: "gemini-test",
          response_time_ms: 12,
          grounding_enabled: true,
        },
      }));
    });
  }, async () => {
    const success = await request("/api/v1/chatbot", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "chat-success" },
      body: JSON.stringify({
        message: "What does QA mean?",
        language: "en",
        history: [{ role: "user", content: "Hello" }, { role: "assistant", content: "Hi" }],
      }),
    });
    assert.equal(success.status, 200);
    assert.equal(success.headers.get("x-request-id"), "chat-success");
    const payload = await success.json();
    assert.match(payload.reply, /QA report/);
    assert.equal(payload.requestId, "chat-success");
    assert.equal(payload.metadata.groundingEnabled, true);
    assert.equal(payload.context_used, undefined);

    const unavailable = await request("/api/v1/chatbot", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "chat-not-configured" },
      body: JSON.stringify({ message: "Hello", language: "my", history: [] }),
    });
    assert.equal(unavailable.status, 503);
    const unavailablePayload = await unavailable.json();
    assert.equal(unavailablePayload.error.code, "CHATBOT_NOT_CONFIGURED");
    assert.doesNotMatch(JSON.stringify(unavailablePayload), /secret detail/);

    const invalid = await request("/api/v1/chatbot", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "chat-bad-contract" },
      body: JSON.stringify({ message: "Hello", language: "en", history: [] }),
    });
    assert.equal(invalid.status, 502);
    assert.equal((await invalid.json()).error.code, "BACKEND_CONTRACT_ERROR");

    const badRequest = await request("/api/v1/chatbot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "", language: "en", history: [] }),
    });
    assert.equal(badRequest.status, 400);
    assert.equal((await badRequest.json()).error.code, "VALIDATION_ERROR");
  });
  assert.equal(upstreamRequests.length, 3);
  assert.ok(upstreamRequests.every(({ url }) => url === "/api/v1/chatbot"));
  assert.ok(upstreamRequests.every(({ apiKey }) => apiKey === "server-only-integration-key"));
  assert.equal(upstreamRequests[0].body.include_model_predictions, false);
  assert.equal(upstreamRequests[0].body.include_market_prices, true);
  assert.equal(upstreamRequests[0].body.locator, undefined);
});

test("market-price BFF mirrors the typed backend API without exposing its key", async () => {
  const upstreamRequests = [];
  const backend = createServer((incoming, outgoing) => {
    upstreamRequests.push({
      method: incoming.method,
      url: incoming.url,
      apiKey: incoming.headers["x-api-key"],
      requestId: incoming.headers["x-request-id"],
    });
    const requestUrl = new URL(incoming.url ?? "/", "http://backend.test");
    const requestId = String(incoming.headers["x-request-id"] ?? "missing");
    if (requestId === "malformed-json") {
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end("{");
      return;
    }
    let payload;
    if (requestUrl.pathname === "/api/v1/market-prices/latest") {
      payload = {
        label: "Latest available market price",
        fetched_at: "2026-08-11T00:00:00.000Z",
        prices: MARKET_CROP_KEYS.map((crop) => ({ crop, status: "no_current_data" })),
      };
    } else if (requestUrl.pathname === "/api/v1/market-prices/crops") {
      payload = {
        crops: requestId === "bad-contract" ? MARKET_CROP_KEYS.slice(0, -1) : MARKET_CROP_KEYS,
      };
    } else if (requestUrl.pathname === "/api/v1/market-prices/commodities/latest") {
      const servesMarketPage = requestUrl.searchParams.get("limit") === "500";
      const sourceDate = "Mon Aug 10 2026 00:00:00 GMT+0000 (Coordinated Universal Time)";
      payload = {
        label: "Latest available market commodity prices",
        fetched_at: "2026-08-11T00:00:00.000Z",
        source: "Wisarra",
        source_date: servesMarketPage ? sourceDate : null,
        commodities: servesMarketPage
          ? [{
              commodity_name_raw: "Maize (Yellow)",
              variety: "Yellow",
              region: "Shan",
              marketplace: "Aungban",
              price_min: "1200.000000",
              price_max: "1350.000000",
              currency: "MMK",
              quantity: "1.000000",
              unit: "viss",
              source: "Wisarra",
              source_date: sourceDate,
              source_url: "https://wisarra.com/en/market-price",
              fetched_at: "2026-08-11T00:00:00.000Z",
              model_crop_keys: ["maize"],
              is_model_crop: true,
            }]
          : [],
        pagination: {
          limit: servesMarketPage ? 500 : 2,
          offset: servesMarketPage ? 0 : 1,
          returned: servesMarketPage ? 1 : 0,
          total: servesMarketPage ? 1 : 0,
          has_more: false,
          next_offset: null,
        },
      };
    } else if (requestUrl.pathname === "/api/v1/market-prices/maize/latest") {
      payload = {
        label: "Latest available market price",
        fetched_at: "2026-08-11T00:00:00.000Z",
        prices: [{ crop: "maize", status: "no_current_data" }],
      };
    } else if (requestUrl.pathname === "/api/v1/market-prices/maize/history") {
      payload = {
        crop: "maize",
        prices: [],
        pagination: { limit: 2, offset: 1 },
      };
    } else {
      outgoing.writeHead(404, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } }));
      return;
    }
    outgoing.writeHead(200, {
      "content-type": "application/json",
      "x-request-id": requestId,
    });
    outgoing.end(JSON.stringify(payload));
  });
  await new Promise((resolve, reject) => {
    backend.once("error", reject);
    backend.listen(0, "127.0.0.1", resolve);
  });
  const address = backend.address();
  assert.ok(address && typeof address !== "string");
  const previousUrl = process.env.BACKEND_URL;
  const previousKey = process.env.BACKEND_API_KEY;
  const previousAllowInsecure = process.env.ALLOW_INSECURE_BACKEND_HTTP;
  process.env.BACKEND_URL = `http://127.0.0.1:${address.port}`;
  process.env.BACKEND_API_KEY = "server-only-market-key";
  delete process.env.ALLOW_INSECURE_BACKEND_HTTP;

  try {
    const requestId = "market-bff-test";
    const bffHeaders = { "x-request-id": requestId };
    const responses = await Promise.all([
      request("/api/v1/market-prices/latest?region=Yangon&source=Wisarra", {
        headers: bffHeaders,
      }),
      request("/api/v1/market-prices/crops", { headers: bffHeaders }),
      request(
        "/api/v1/market-prices/commodities/latest?source=Wisarra&region=Yangon&limit=2&offset=1",
        { headers: bffHeaders },
      ),
      request("/api/v1/market-prices/maize/latest", { headers: bffHeaders }),
      request("/api/v1/market-prices/maize/history?limit=2&offset=1", {
        headers: bffHeaders,
      }),
    ]);
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-request-id"), requestId);
      assert.doesNotMatch(await response.text(), /server-only-market-key/);
    }
    assert.deepEqual(
      upstreamRequests.map(({ method, url }) => ({ method, url })).sort((a, b) =>
        String(a.url).localeCompare(String(b.url)),
      ),
      [
        { method: "GET", url: "/api/v1/market-prices/commodities/latest?source=Wisarra&region=Yangon&limit=2&offset=1" },
        { method: "GET", url: "/api/v1/market-prices/crops" },
        { method: "GET", url: "/api/v1/market-prices/latest?region=Yangon&source=Wisarra" },
        { method: "GET", url: "/api/v1/market-prices/maize/history?limit=2&offset=1" },
        { method: "GET", url: "/api/v1/market-prices/maize/latest" },
      ],
    );
    assert.ok(upstreamRequests.every(({ apiKey }) => apiKey === "server-only-market-key"));
    assert.ok(upstreamRequests.every(({ requestId: seenId }) => seenId === requestId));

    const marketPage = await request("/api/v1/market", { headers: bffHeaders });
    assert.equal(marketPage.status, 200);
    assert.equal(marketPage.headers.get("cache-control"), "no-store");
    assert.equal(marketPage.headers.get("x-request-id"), requestId);
    const marketPagePayload = await marketPage.json();
    assert.equal(marketPagePayload.recordedAt, "2026-08-10T00:00:00.000Z");
    assert.deepEqual(marketPagePayload.commodities, [{
      id: "market-2026-08-10-0",
      name: "Maize (Yellow)",
      location: "Shan",
      marketplace: "Aungban",
      minPrice: 1200,
      maxPrice: 1350,
      currency: "MMK",
      quantity: 1,
      unit: "viss",
      priceDate: "2026-08-10",
      source: "Wisarra",
    }]);
    assert.doesNotMatch(JSON.stringify(marketPagePayload), /server-only-market-key/);
    assert.deepEqual(upstreamRequests.at(-1), {
      method: "GET",
      url: "/api/v1/market-prices/commodities/latest?limit=500",
      apiKey: "server-only-market-key",
      requestId,
    });

    const requestsBeforeInvalidQuery = upstreamRequests.length;
    const invalidQuery = await request("/api/v1/market-prices/latest?crop=maize&crop=tomato");
    assert.equal(invalidQuery.status, 400);
    assert.equal((await invalidQuery.json()).error.code, "VALIDATION_ERROR");
    assert.equal(upstreamRequests.length, requestsBeforeInvalidQuery);

    const invalidContract = await request("/api/v1/market-prices/crops", {
      headers: { "x-request-id": "bad-contract" },
    });
    assert.equal(invalidContract.status, 502);
    assert.equal((await invalidContract.json()).error.code, "BACKEND_CONTRACT_ERROR");

    const malformedJson = await request("/api/v1/market-prices/crops", {
      headers: { "x-request-id": "malformed-json" },
    });
    assert.equal(malformedJson.status, 502);
    assert.equal((await malformedJson.json()).error.code, "BACKEND_INVALID_RESPONSE");

    const requestsBeforeInvalidKey = upstreamRequests.length;
    process.env.BACKEND_API_KEY = "invalid\nkey";
    const invalidKey = await request("/api/v1/market-prices/latest");
    assert.equal(invalidKey.status, 503);
    assert.equal((await invalidKey.json()).error.code, "BACKEND_CONFIGURATION_INVALID");
    assert.equal(upstreamRequests.length, requestsBeforeInvalidKey);
    process.env.BACKEND_API_KEY = "server-only-market-key";

    const requestsBeforeMissingKey = upstreamRequests.length;
    delete process.env.BACKEND_API_KEY;
    const missingKey = await request("/api/v1/market-prices/latest");
    assert.equal(missingKey.status, 503);
    assert.equal((await missingKey.json()).error.code, "BACKEND_CONFIGURATION_INVALID");
    assert.equal(upstreamRequests.length, requestsBeforeMissingKey);
    process.env.BACKEND_API_KEY = "server-only-market-key";

    const requestsBeforeUnsafeOrigin = upstreamRequests.length;
    process.env.BACKEND_URL = "http://backend.example";
    const unsafeOrigin = await request("/api/v1/market-prices/latest");
    assert.equal(unsafeOrigin.status, 503);
    assert.equal(
      (await unsafeOrigin.json()).error.code,
      "BACKEND_CONFIGURATION_INVALID",
    );
    assert.equal(upstreamRequests.length, requestsBeforeUnsafeOrigin);
  } finally {
    if (previousUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previousUrl;
    if (previousKey === undefined) delete process.env.BACKEND_API_KEY;
    else process.env.BACKEND_API_KEY = previousKey;
    if (previousAllowInsecure === undefined) {
      delete process.env.ALLOW_INSECURE_BACKEND_HTTP;
    } else {
      process.env.ALLOW_INSECURE_BACKEND_HTTP = previousAllowInsecure;
    }
    await new Promise((resolve, reject) => {
      backend.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("Crop Calendar BFF exposes typed database responses without exposing its key", async () => {
  const upstreamRequests = [];
  const calendar = {
    model_key: "crop_suitability_black_gram",
    crop_name_en: "Black Gram",
    crop_name_mm: "မတ်ပဲ",
    crop_type: "annual",
    region: "Ayeyarwady",
    township: null,
    season: "winter/post-monsoon",
    planting: {
      start_month: 10,
      end_month: 10,
      start_label_en: "October",
      start_label_mm: "အောက်တိုဘာ",
      end_label_en: "October",
      end_label_mm: "အောက်တိုဘာ",
      label_en: "October",
      label_mm: "အောက်တိုဘာ",
      is_complete: true,
    },
    harvest: {
      start_month: 3,
      end_month: 4,
      start_label_en: "March",
      start_label_mm: "မတ်",
      end_label_en: "April",
      end_label_mm: "ဧပြီ",
      label_en: "March – April",
      label_mm: "မတ် – ဧပြီ",
      is_complete: true,
    },
    growing_duration: null,
    establishment: null,
    first_harvest: null,
    harvest_season: null,
    verification: {
      status: "verified",
      confidence: null,
      label_en: "Source-backed regional calendar",
      label_mm: "ဒေသအလိုက် အရင်းအမြစ်အထောက်အထားရှိသော ပြက္ခဒိန်",
    },
    evidence_type: "research_report",
    geographic_specificity: "regional",
    source: {
      code: "S2",
      organization: "IFPRI/CGIAR",
      title: "Myanmar pulse calendar",
      url: "https://example.test/source",
      publication_year: 2023,
    },
    notes: { en: null, mm: null, data_quality: null },
    last_verified_date: null,
    last_updated: "2026-08-10",
    dataset_version: `sha256:${"a".repeat(64)}`,
  };
  const backend = createServer((incoming, outgoing) => {
    upstreamRequests.push({
      method: incoming.method,
      url: incoming.url,
      apiKey: incoming.headers["x-api-key"],
      requestId: incoming.headers["x-request-id"],
    });
    const requestUrl = new URL(incoming.url ?? "/", "http://backend.test");
    const requestId = String(incoming.headers["x-request-id"] ?? "missing");
    let payload;
    if (requestUrl.pathname === "/api/v1/crop-calendars/crops") {
      payload = requestId === "bad-calendar-contract"
        ? { crops: [{ model_key: "not-a-crop" }] }
        : {
            crops: [{
              model_key: calendar.model_key,
              crop_name_en: calendar.crop_name_en,
              crop_name_mm: calendar.crop_name_mm,
              crop_type: calendar.crop_type,
            }],
          };
    } else if (requestUrl.pathname === "/api/v1/crop-calendars") {
      payload = { calendars: [calendar] };
    } else if (
      requestUrl.pathname === "/api/v1/crop-calendars/crop_suitability_black_gram"
    ) {
      payload = { calendar };
    } else {
      outgoing.writeHead(404, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } }));
      return;
    }
    outgoing.writeHead(200, {
      "content-type": "application/json",
      "x-request-id": requestId,
    });
    outgoing.end(JSON.stringify(payload));
  });
  await new Promise((resolve, reject) => {
    backend.once("error", reject);
    backend.listen(0, "127.0.0.1", resolve);
  });
  const address = backend.address();
  assert.ok(address && typeof address !== "string");
  const previousUrl = process.env.BACKEND_URL;
  const previousKey = process.env.BACKEND_API_KEY;
  process.env.BACKEND_URL = `http://127.0.0.1:${address.port}`;
  process.env.BACKEND_API_KEY = "server-only-calendar-key";

  try {
    const headers = { "x-request-id": "calendar-bff-test" };
    const responses = await Promise.all([
      request("/api/v1/crop-calendars/crops", { headers }),
      request("/api/v1/crop-calendars?region=ayeyawaddy", { headers }),
      request(
        "/api/v1/crop-calendars/crop_suitability_black_gram?region=Ayeyarwady&season=winter%2Fpost-monsoon",
        { headers },
      ),
    ]);
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(await response.text(), /server-only-calendar-key/);
    }
    assert.deepEqual(
      upstreamRequests.map(({ method, url }) => ({ method, url })).sort((left, right) =>
        String(left.url).localeCompare(String(right.url)),
      ),
      [
        { method: "GET", url: "/api/v1/crop-calendars?region=Ayeyarwady" },
        {
          method: "GET",
          url: "/api/v1/crop-calendars/crop_suitability_black_gram?region=Ayeyarwady&season=winter%2Fpost-monsoon",
        },
        { method: "GET", url: "/api/v1/crop-calendars/crops" },
      ],
    );
    assert.ok(upstreamRequests.every(({ apiKey }) => apiKey === "server-only-calendar-key"));

    const beforeInvalid = upstreamRequests.length;
    const invalid = await request(
      "/api/v1/crop-calendars/crop_suitability_unknown?region=Bago",
    );
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "VALIDATION_ERROR");
    assert.equal(upstreamRequests.length, beforeInvalid);

    const badContract = await request("/api/v1/crop-calendars/crops", {
      headers: { "x-request-id": "bad-calendar-contract" },
    });
    assert.equal(badContract.status, 502);
    assert.equal((await badContract.json()).error.code, "BACKEND_CONTRACT_ERROR");
    assert.ok(CROP_CALENDAR_MODEL_KEYS.includes(calendar.model_key));
  } finally {
    if (previousUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previousUrl;
    if (previousKey === undefined) delete process.env.BACKEND_API_KEY;
    else process.env.BACKEND_API_KEY = previousKey;
    await new Promise((resolve, reject) => {
      backend.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("selected-cell download returns UTF-8 CSV with release provenance", async () => {
  const seedResponse = await request(
    "/api/v1/cells?recommendation_status=scored&limit=1",
  );
  const seed = await seedResponse.json();
  const cell = seed.cells[0];
  assert.ok(cell);

  const response = await request(
    `/api/v1/cells/${encodeURIComponent(cell.id)}/report.csv`,
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  const csv = new TextDecoder().decode(bytes);

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/csv;\s*charset=utf-8/i,
  );
  assert.match(
    response.headers.get("content-disposition") ?? "",
    new RegExp(`${cell.id}_${cell.month}\\.csv`),
  );
  assert.equal(
    response.headers.get("x-data-contract"),
    seed.meta.dataContract,
  );
  assert.equal(
    response.headers.get("x-source-manifest-sha256"),
    seed.meta.sourceManifestSha256,
  );
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(
    csv.startsWith(
      "release_id,schema_version,data_contract,source_csv_sha256,qa_report_sha256,source_manifest_sha256,",
    ),
  );
  assert.match(csv, /cell_id,region,year_month/);
  assert.ok(csv.includes(cell.id));
  assert.ok(csv.includes("rule_based"));
  assert.ok(csv.includes(seed.meta.sourceManifestSha256));

  const missing = await request(
    "/api/v1/cells/mm_cell_that_does_not_exist/report.csv",
  );
  const missingPayload = await missing.json();
  assert.equal(missing.status, 404);
  assert.equal(missingPayload.error.code, "CELL_NOT_FOUND");
});

test("selected-cell download honors its regional bundle query", async () => {
  const seedResponse = await request("/api/v1/cells?region=sagaing&limit=1");
  const seed = await seedResponse.json();
  const cell = seed.cells[0];
  assert.ok(cell);

  const response = await request(
    `/api/v1/cells/${encodeURIComponent(cell.id)}/report.csv?region=sagaing`,
  );
  const csv = await response.text();

  assert.equal(response.status, 200);
  assert.match(csv, new RegExp(cell.id));
  assert.ok(csv.includes(seed.meta.releaseId));

  const compatibilityResponse = await request(
    `/api/v1/cells/${encodeURIComponent(cell.id)}/download?region=sagaing`,
  );
  assert.equal(compatibilityResponse.status, 200);
  assert.match(await compatibilityResponse.text(), new RegExp(cell.id));
});

test("legacy cells endpoint remains compatible and truthfully deprecated", async () => {
  const response = await request("/api/cells?region=magway");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("deprecation"), "true");
  assert.equal(response.headers.get("x-api-deprecated"), "true");
  assert.match(response.headers.get("link") ?? "", /\/api\/v1\/cells/);
  assert.equal(
    response.headers.get("x-data-contract"),
    payload.meta.dataContract,
  );
  assert.equal(
    response.headers.get("x-source-manifest-sha256"),
    payload.meta.sourceManifestSha256,
  );
  assert.equal(payload.meta.fixtureKind, undefined);
  assert.equal(
    payload.meta.releaseKind,
    "REAL_EARTH_ENGINE_PILOT_NOT_OBSERVED",
  );
  assert.ok(payload.meta.sourceFamilies.length > 0);
  assert.equal(payload.cells.length, payload.meta.rowCount);
  assert.ok(
    payload.cells.every((cell) => cell.labelSource === "rule_based"),
  );
});

test("climate API publishes QA-passed source-backed climate aggregates", async () => {
  const response = await request("/api/v1/climate");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("x-data-contract"),
    "qa_passed_climate_annual_snapshot",
  );
  assert.equal(
    response.headers.get("x-data-verification"),
    "qa-passed-source-backed",
  );
  assert.equal(payload.qa.valid, true);
  assert.equal(payload.qa.errorCount, 0);
  assert.equal(payload.values.length, 7);
  assert.ok(
    payload.values.every((row) =>
      Number.isFinite(row.annual_rainfall_mm),
    ),
  );
  assert.ok(
    payload.values.every((row) =>
      Number.isFinite(row.mean_temperature_c),
    ),
  );
  assert.ok(payload.sources.every((source) => source.citationUrl.startsWith("https://")));
});

test("macro API publishes official World Bank indicators without forecasts", async () => {
  const response = await request("/api/v1/macro");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("x-data-contract"),
    "official_world_bank_myanmar_indicators_v1",
  );
  assert.equal(
    response.headers.get("x-data-verification"),
    "official-source-snapshot",
  );
  assert.equal(payload.country.iso3, "MMR");
  assert.ok(payload.indicators.gdp_current_usd.values.length > 20);
  assert.ok(
    payload.indicators.agriculture_value_added_pct_gdp.values.length > 20,
  );
  assert.ok(payload.indicators.merchandise_exports_current_usd.values.length > 20);
  assert.ok(payload.indicators.merchandise_imports_current_usd.values.length > 20);
  assert.ok(payload.indicators.cereal_production_tonnes.values.length > 20);
  assert.ok(
    Object.values(payload.indicators).every((indicator) =>
      indicator.sourceUrl.startsWith("https://data.worldbank.org/indicator/"),
    ),
  );
});

test("FAQ API exposes complete bilingual content and language-scoped search", async () => {
  const response = await request("/api/v1/faq?language=en");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-data-contract"), "bilingual_faq_v1");
  assert.equal(response.headers.get("x-faq-languages"), "my,en");
  assert.equal(
    response.headers.get("x-translation-review"),
    "professional-review-pending",
  );
  assert.equal(payload.schemaVersion, "1.1.0");
  assert.equal(payload.meta.totalCount, 1053);
  assert.equal(payload.meta.returnedCount, 1053);
  assert.equal(payload.meta.language, "en");
  assert.equal(payload.meta.translation.method, "AI-assisted");
  assert.equal(
    payload.meta.translation.reviewStatus,
    "professional review pending",
  );
  assert.ok(
    payload.data.every(
      (record) =>
        record.question_en.trim().length > 0 &&
        record.answer_en.trim().length > 0 &&
        record.question_en !== "Pending English Translation" &&
        record.answer_en !== "Pending English Translation" &&
        !/[\u1000-\u109f]/u.test(record.question_en) &&
        !/[\u1000-\u109f]/u.test(record.answer_en),
    ),
  );

  const [englishSearch, myanmarSearch] = await Promise.all([
    request("/api/v1/faq?language=en&search=best%20time"),
    request(`/api/v1/faq?language=my&search=${encodeURIComponent("သစ်ပင်")}`),
  ]);
  const [englishPayload, myanmarPayload] = await Promise.all([
    englishSearch.json(),
    myanmarSearch.json(),
  ]);

  assert.ok(englishPayload.meta.returnedCount > 0);
  assert.ok(myanmarPayload.meta.returnedCount > 0);
  assert.equal(englishPayload.meta.language, "en");
  assert.equal(myanmarPayload.meta.language, "my");
});

test("English FAQ interface copy contains no Myanmar text", () => {
  const englishFaqCopy = [
    en.header.title,
    en.header.description,
    ...Object.values(en.faq),
  ];
  assert.ok(englishFaqCopy.every((value) => !/[\u1000-\u109f]/u.test(value)));
});

test("CSV encoder neutralizes formulas hidden behind control whitespace", () => {
  for (const attack of [
    "=1+1",
    "\t=1+1",
    "\r\n+SUM(1,1)",
    "\u0000-CMD",
    "\u0085@SUM(1,1)",
    "  =HYPERLINK(\"https://example.invalid\")",
  ]) {
    assert.ok(
      csvValue(attack).startsWith("\"'"),
      `expected formula value to be neutralized: ${JSON.stringify(attack)}`,
    );
  }
  assert.equal(csvValue("ordinary text"), "\"ordinary text\"");
  assert.equal(csvValue(-12.5), "\"-12.5\"");
  assert.equal(csvValue("-12.5"), "\"'-12.5\"");
  assert.equal(csvValue('say "hello"'), '"say ""hello"""');
});

test("locale helpers select one language without changing numeric evidence", () => {
  assert.equal(normalizeLanguage("en"), "en");
  assert.equal(normalizeLanguage("unsupported"), "my");
  assert.equal(localizeRegion("Sagaing", "my"), "စစ်ကိုင်းတိုင်း");
  assert.equal(
    localizeBilingualLabel("Monthly rainfall · လစဉ်မိုးရေချိန်", "en"),
    "Monthly rainfall",
  );
  assert.equal(
    localizeBilingualLabel("Monthly rainfall · လစဉ်မိုးရေချိန်", "my"),
    "လစဉ်မိုးရေချိန်",
  );
  assert.equal(
    localizeFactor(
      "mean temperature · ပျမ်းမျှအပူချိန်: 25.3578 °C (100.0/100)",
      "my",
    ),
    "ပျမ်းမျှအပူချိန်: 25.3578 °C (100.0/100)",
  );
  assert.equal(
    localizeBilingualNarrative(
      "Provisional rule score. စည်းမျဉ်းအခြေခံ အမှတ်ဖြစ်သည်။",
      "en",
    ),
    "Provisional rule score.",
  );
});

test("market dictionary uses established Myanmar commodity and trade terms", () => {
  assert.deepEqual(marketMyanmarDictionaryCounts(), {
    commodities: 139,
    locations: 8,
    marketplaces: 19,
    currencies: 2,
    units: 7,
  });
  assert.equal(localizeMarketValue("commodities", "Blackgram", "my"), "မတ်ပဲ");
  assert.equal(localizeMarketValue("commodities", "Mung Bean", "my"), "ပဲတီစိမ်း");
  assert.equal(localizeMarketValue("commodities", "Pigeon Pea (New)", "my"), "ပဲစင်းငုံ (အသစ်)");
  assert.equal(localizeMarketValue("commodities", "Lablab Bean", "my"), "ပဲကြီး");
  assert.equal(localizeMarketValue("commodities", "Niger Flower (New)", "my"), "ပန်းနှမ်း (အသစ်)");
  assert.equal(localizeMarketValue("marketplaces", "Thiri Mingalar Zay", "my"), "သီရိမင်္ဂလာဈေး");
  assert.equal(localizeMarketValue("units", "viss", "my"), "ပိဿာ");
  assert.equal(localizeMarketValue("commodities", "Avocado", "en"), "Avocado");
  assert.equal(formatMarketNumber(1234567, "my"), "၁,၂၃၄,၅၆၇");
  assert.equal(formatMarketDate("2026-08-11T00:00:00.000Z", "my"), "၂၀၂၆ ခုနှစ် ဩဂုတ်လ ၁၁ ရက်");
});
