import assert from "node:assert/strict";
import test from "node:test";
import { csvValue } from "../app/lib/csv-value.ts";

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

test("server-renders the Myanmar GeoAI product shell", async () => {
  const response = await request("/", {
    headers: { accept: "text/html" },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Myanmar Crop Intelligence/);
  assert.match(html, /Explainable crop screening/);
  assert.match(html, /Real pilot data/);
  assert.match(html, /QA-approved Ayeyawaddy 5 km cells/);
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
    "/api/v1/cells/{cell_id}/report.csv",
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

test("v1 API filters by cell, region, month, status, and training usability", async () => {
  const seedResponse = await request("/api/v1/cells?limit=1");
  const seed = await seedResponse.json();
  const cell = seed.cells[0];
  assert.ok(cell);

  const query = new URLSearchParams({
    cell_id: cell.id,
    region: cell.region.toUpperCase(),
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

test("legacy cells endpoint remains compatible and truthfully deprecated", async () => {
  const response = await request("/api/cells");
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
