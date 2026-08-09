import assert from "node:assert/strict";
import test from "node:test";
import { csvValue } from "../app/lib/csv-value.ts";
import { en } from "../app/lib/dictionaries.ts";
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
