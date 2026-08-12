import { NextResponse } from "next/server";

import type {
  HomeLiveState,
  HomePeriod,
  HomePrediction,
  HomePredictionError,
  HomeWeeklyCell,
  HomeWeeklyFailureStage,
  HomeWeeklyTelemetry,
  HomeWeeklyUnavailableReason,
} from "@/app/lib/home-data";
import {
  loadPilotBundle,
  PilotRegionError,
  resolvePilotRegion,
} from "@/app/lib/pilot-data";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const HOME_BACKEND_TIMEOUT_MS = 30_000;
const LATEST_RESPONSE_MAX_BYTES = 1024 * 1024;
const REGIONAL_RESPONSE_MAX_BYTES = 64 * 1024 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const TARGET_PATTERN = /^[a-z][a-z0-9_]{0,119}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,80}$/;
const DATE_ONLY_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

type UnknownRecord = Record<string, unknown>;

type WeeklyRegionMetadata = {
  id: string;
  pipelineRunId: string;
  region: string;
  weekStart: string;
  weekEnd: string;
  cellCount: number;
  sourceSha256: string;
  predictionSha256: string;
  modelCatalogVersion: string;
  schemaVersion: string;
  coverageMetadata: unknown;
  createdAt: string;
  expiresAt: string;
};

type WeeklyLatestEnvelope = {
  weekStart: string;
  weekEnd: string;
  modelCatalogVersion: string;
  schemaVersion: string;
  regions: WeeklyRegionMetadata[];
};

type WeeklyRegionalRecord = WeeklyRegionMetadata & {
  payload: UnknownRecord;
};

type UpstreamJson = {
  payload: unknown;
  bytes: number;
  latencyMs: number;
};

class BodyTooLargeError extends Error {}

class WeeklyLoadError extends Error {
  constructor(
    readonly reason: HomeWeeklyUnavailableReason,
    readonly stage: HomeWeeklyFailureStage,
    readonly requestId: string,
    readonly retryable: boolean,
    readonly telemetry: HomeWeeklyTelemetry,
  ) {
    super(reason);
    this.name = "WeeklyLoadError";
  }
}

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function hasOwn(source: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: unknown, maximumLength = 500): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength
    ? value
    : null;
}

function optionalString(value: unknown, maximumLength = 500): string | null {
  return value === null || value === undefined
    ? null
    : nonEmptyString(value, maximumLength);
}

function validDateOnly(value: unknown): string | null {
  const date = nonEmptyString(value, 10);
  if (!date || !DATE_ONLY_PATTERN.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}

function validTimestamp(value: unknown): string | null {
  const timestamp = nonEmptyString(value, 100);
  return timestamp && !Number.isNaN(Date.parse(timestamp)) ? timestamp : null;
}

function emptyTelemetry(): HomeWeeklyTelemetry {
  return {
    declaredCellCount: null,
    decodedCellCount: 0,
    matchedCellCount: 0,
    droppedCellCount: 0,
    unmatchedGridIdCount: 0,
    latestResponseBytes: null,
    regionalResponseBytes: null,
    latestLatencyMs: null,
    regionalLatencyMs: null,
  };
}

function backendOrigin(): string {
  const configuredValue = process.env.BACKEND_URL?.trim();
  if (process.env.NODE_ENV === "production" && !configuredValue) {
    throw new Error("BACKEND_CONFIGURATION_INVALID");
  }
  let url: URL;
  try {
    url = new URL(configuredValue || DEFAULT_BACKEND_URL);
  } catch {
    throw new Error("BACKEND_CONFIGURATION_INVALID");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("BACKEND_CONFIGURATION_INVALID");
  }
  if (
    url.protocol === "http:" &&
    !isLoopbackHostname(url.hostname) &&
    !allowInsecureBackendHttp()
  ) {
    throw new Error("BACKEND_CONFIGURATION_INVALID");
  }
  return url.origin;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  const octets = normalized.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255) &&
    octets[0] === "127"
  );
}

function allowInsecureBackendHttp(): boolean {
  const value = process.env.ALLOW_INSECURE_BACKEND_HTTP?.trim().toLowerCase();
  return value === "true" || value === "1";
}

function backendHeaders(requestId: string): HeadersInit {
  const apiKey = process.env.BACKEND_API_KEY?.trim();
  if (!apiKey && process.env.NODE_ENV === "production") {
    throw new Error("BACKEND_API_KEY_MISSING");
  }
  if (
    apiKey &&
    [...apiKey].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint > 126;
    })
  ) {
    throw new Error("BACKEND_API_KEY_INVALID");
  }
  return {
    Accept: "application/json",
    "X-Request-ID": requestId,
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
  };
}

function observationDate(weekEnd: string | null): string | null {
  if (!weekEnd) return null;
  const date = new Date(`${weekEnd}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function historicalState(
  period: HomePeriod,
  region: string,
  reason: HomeWeeklyUnavailableReason | null,
  diagnostics: HomeLiveState["diagnostics"] = {
    requestId: null,
    failingStage: null,
    retryable: false,
  },
  telemetry = emptyTelemetry(),
): HomeLiveState {
  return {
    mode: "historical",
    requestedPeriod: period,
    region,
    weekStart: null,
    weekEnd: null,
    observationDate: null,
    generatedAt: null,
    modelCatalogVersion: null,
    schemaVersion: null,
    sourceSha256: null,
    predictionSha256: null,
    cropPredictionsAvailable: false,
    allowFlaggedModels: false,
    coverageRatio: null,
    observationDays: null,
    expectedDays: null,
    isPartialWeek: false,
    unavailableReason: reason,
    diagnostics,
    telemetry,
    cells: [],
  };
}

function parseProbabilities(value: unknown): Record<string, number> | null | undefined {
  if (value === null || value === undefined) return null;
  const source = record(value);
  if (!source) return undefined;
  const probabilities: Record<string, number> = {};
  for (const [label, probability] of Object.entries(source)) {
    const parsed = finiteNumber(probability);
    if (!label || label.length > 160 || parsed === null || parsed < 0 || parsed > 1) {
      return undefined;
    }
    probabilities[label] = parsed;
  }
  return probabilities;
}

function parsePrediction(value: unknown): HomePrediction | null {
  const source = record(value);
  if (!source || !hasOwn(source, "value")) return null;
  const rawValue = source.value;
  if (
    rawValue !== null &&
    !(typeof rawValue === "string" && rawValue.length <= 500) &&
    !(typeof rawValue === "number" && Number.isFinite(rawValue))
  ) {
    return null;
  }
  const taskType = source.task_type;
  const confidence = source.confidence === null
    ? null
    : finiteNumber(source.confidence);
  const probabilities = parseProbabilities(source.probabilities);
  const validationStatus = nonEmptyString(source.validation_status, 80);
  const modelVersion = nonEmptyString(source.model_version, 200);
  if (
    (taskType !== "classification" && taskType !== "regression") ||
    confidence === null && source.confidence !== null ||
    confidence !== null && (confidence < 0 || confidence > 1) ||
    probabilities === undefined ||
    !validationStatus ||
    !modelVersion ||
    (source.unit !== null && source.unit !== undefined && optionalString(source.unit, 160) === null) ||
    (source.label !== null && source.label !== undefined && optionalString(source.label, 500) === null) ||
    (source.confidence_kind !== null &&
      source.confidence_kind !== undefined &&
      optionalString(source.confidence_kind, 160) === null) ||
    !Array.isArray(source.warnings) ||
    source.warnings.some((warning) => typeof warning !== "string" || warning.length > 500)
  ) {
    return null;
  }
  return {
    value: rawValue as number | string | null,
    label: optionalString(source.label, 500),
    unit: optionalString(source.unit, 160),
    taskType,
    confidence,
    confidenceKind: optionalString(source.confidence_kind, 160),
    probabilities,
    validationStatus,
    modelVersion,
    warnings: source.warnings as string[],
  };
}

function safeErrorText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\p{Cc}\p{Cf}]/gu, " ").trim();
  return normalized.length > 0 && normalized.length <= 240 ? normalized : null;
}

function parsePredictionError(value: unknown): HomePredictionError {
  if (typeof value === "string") {
    const code = ERROR_CODE_PATTERN.test(value) ? value : null;
    return {
      code,
      message: code ? "Prediction unavailable for this target." : (safeErrorText(value) ?? "Prediction unavailable for this target."),
    };
  }
  const source = record(value);
  const code = source && typeof source.code === "string" && ERROR_CODE_PATTERN.test(source.code)
    ? source.code
    : null;
  const message = source
    ? safeErrorText(source.message) ?? safeErrorText(source.error)
    : null;
  return { code, message: message ?? "Prediction unavailable for this target." };
}

function parseWeeklyCell(value: unknown): HomeWeeklyCell | null {
  const source = record(value);
  const gridId = nonEmptyString(source?.grid_id, 160);
  const latitude = finiteNumber(source?.latitude);
  const longitude = finiteNumber(source?.longitude);
  if (
    !source ||
    !gridId ||
    !/^mm_\d+_\d+$/.test(gridId) ||
    latitude === null ||
    latitude < 9 ||
    latitude > 29 ||
    longitude === null ||
    longitude < 92 ||
    longitude > 102
  ) {
    return null;
  }
  const predictionContainer = record(source.predictions);
  const rawValues = record(predictionContainer?.values);
  const rawErrors = record(predictionContainer?.errors);
  if (!predictionContainer || !rawValues || !rawErrors) return null;

  const predictions: Record<string, HomePrediction> = {};
  for (const [target, prediction] of Object.entries(rawValues)) {
    if (!TARGET_PATTERN.test(target)) return null;
    const parsed = parsePrediction(prediction);
    if (!parsed) return null;
    predictions[target] = parsed;
  }
  const errors: Record<string, HomePredictionError> = {};
  for (const [target, error] of Object.entries(rawErrors)) {
    if (!TARGET_PATTERN.test(target) || predictions[target]) return null;
    errors[target] = parsePredictionError(error);
  }
  return { gridId, latitude, longitude, predictions, errors };
}

function parseRegionMetadata(value: unknown, forbidPayload: boolean): WeeklyRegionMetadata | null {
  const source = record(value);
  if (!source || forbidPayload && hasOwn(source, "payload")) return null;
  const id = nonEmptyString(source.id, 160);
  const pipelineRunId = nonEmptyString(source.pipeline_run_id, 160);
  const region = nonEmptyString(source.region, 80)?.toLocaleLowerCase("en") ?? null;
  const weekStart = validDateOnly(source.week_start);
  const weekEnd = validDateOnly(source.week_end);
  const cellCount = finiteNumber(source.cell_count);
  const sourceSha256 = nonEmptyString(source.source_sha256, 64);
  const predictionSha256 = nonEmptyString(source.prediction_sha256, 64);
  const modelCatalogVersion = nonEmptyString(source.model_catalog_version, 200);
  const schemaVersion = nonEmptyString(source.schema_version, 200);
  const createdAt = validTimestamp(source.created_at);
  const expiresAt = validTimestamp(source.expires_at);
  if (
    !id ||
    !pipelineRunId ||
    !region ||
    !weekStart ||
    !weekEnd ||
    cellCount === null ||
    !Number.isInteger(cellCount) ||
    cellCount < 0 ||
    !sourceSha256 ||
    !SHA256_PATTERN.test(sourceSha256) ||
    !predictionSha256 ||
    !SHA256_PATTERN.test(predictionSha256) ||
    !modelCatalogVersion ||
    !schemaVersion ||
    !createdAt ||
    !expiresAt
  ) {
    return null;
  }
  return {
    id,
    pipelineRunId,
    region,
    weekStart,
    weekEnd,
    cellCount,
    sourceSha256,
    predictionSha256,
    modelCatalogVersion,
    schemaVersion,
    coverageMetadata: source.coverage_metadata,
    createdAt,
    expiresAt,
  };
}

function parseLatestEnvelope(value: unknown): WeeklyLatestEnvelope | null {
  const source = record(value);
  const weekStart = validDateOnly(source?.week_start);
  const weekEnd = validDateOnly(source?.week_end);
  const modelCatalogVersion = nonEmptyString(source?.model_catalog_version, 200);
  const schemaVersion = nonEmptyString(source?.schema_version, 200);
  if (
    !source ||
    !weekStart ||
    !weekEnd ||
    !modelCatalogVersion ||
    !schemaVersion ||
    !Array.isArray(source.regions) ||
    source.regions.length === 0
  ) {
    return null;
  }
  const regions = source.regions.map((region) => parseRegionMetadata(region, true));
  if (
    regions.some((region) => region === null) ||
    new Set(regions.map((region) => region?.region)).size !== regions.length
  ) {
    return null;
  }
  const parsedRegions = regions as WeeklyRegionMetadata[];
  if (parsedRegions.some((region) =>
    region.weekStart !== weekStart ||
    region.weekEnd !== weekEnd ||
    region.modelCatalogVersion !== modelCatalogVersion ||
    region.schemaVersion !== schemaVersion
  )) {
    return null;
  }
  return { weekStart, weekEnd, modelCatalogVersion, schemaVersion, regions: parsedRegions };
}

function parseRegionalRecord(value: unknown): WeeklyRegionalRecord | null {
  const source = record(value);
  const metadata = parseRegionMetadata(value, false);
  const payload = record(source?.payload);
  return source && metadata && payload ? { ...metadata, payload } : null;
}

function metadataMatches(left: WeeklyRegionMetadata, right: WeeklyRegionMetadata): boolean {
  return (
    left.pipelineRunId === right.pipelineRunId &&
    left.region === right.region &&
    left.weekStart === right.weekStart &&
    left.weekEnd === right.weekEnd &&
    left.modelCatalogVersion === right.modelCatalogVersion &&
    left.schemaVersion === right.schemaVersion &&
    left.cellCount === right.cellCount &&
    left.expiresAt === right.expiresAt
  );
}

function coverageFields(value: unknown): {
  ratio: number | null;
  partial: boolean;
  observationDays: number | null;
  expectedDays: number | null;
} {
  const source = record(value);
  const ratio = finiteNumber(source?.coverage_ratio);
  const observationDays = finiteNumber(source?.observation_days);
  const expectedDays = finiteNumber(source?.expected_days);
  return {
    ratio: ratio !== null && ratio >= 0 && ratio <= 1 ? ratio : null,
    partial: source?.is_partial_week === true,
    observationDays: observationDays !== null && Number.isInteger(observationDays)
      ? observationDays
      : null,
    expectedDays: expectedDays !== null && Number.isInteger(expectedDays)
      ? expectedDays
      : null,
  };
}

function upstreamErrorCode(payload: unknown): string | null {
  const source = record(payload);
  const error = record(source?.error);
  return typeof error?.code === "string" && ERROR_CODE_PATTERN.test(error.code)
    ? error.code
    : null;
}

async function readJsonWithLimit(
  response: Response,
  maximumBytes: number,
): Promise<{ payload: unknown; bytes: number }> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new BodyTooLargeError();
  }
  if (!response.body) throw new Error("BACKEND_INVALID_JSON");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { payload: JSON.parse(text) as unknown, bytes };
}

function mappedResponseReason(
  stage: HomeWeeklyFailureStage,
  status: number,
  code: string | null,
): { reason: HomeWeeklyUnavailableReason; retryable: boolean } {
  if (status === 401 || status === 403 || code === "UNAUTHORIZED") {
    return { reason: "unauthorized", retryable: false };
  }
  if (code === "DATABASE_NOT_CONFIGURED") {
    return { reason: "database_not_configured", retryable: false };
  }
  if (stage === "latest_metadata") {
    if (status === 404) return { reason: "no_active_weekly_predictions", retryable: false };
    if (status === 410) return { reason: "weekly_predictions_expired", retryable: false };
  } else {
    if (status === 404) return { reason: "regional_payload_not_found", retryable: false };
    if (status === 410) return { reason: "regional_payload_expired", retryable: false };
  }
  if (status === 504) return { reason: "backend_timeout", retryable: true };
  return { reason: "backend_unavailable", retryable: status === 429 || status >= 500 };
}

async function requestUpstreamJson(input: {
  origin: string;
  path: string;
  headers: HeadersInit;
  requestId: string;
  stage: HomeWeeklyFailureStage;
  maximumBytes: number;
  signal: AbortSignal;
  telemetry: HomeWeeklyTelemetry;
}): Promise<UpstreamJson> {
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${input.origin}${input.path}`, {
      headers: input.headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([
        input.signal,
        AbortSignal.timeout(HOME_BACKEND_TIMEOUT_MS),
      ]),
    });
  } catch (error) {
    const timedOut = error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError") &&
      !input.signal.aborted;
    throw new WeeklyLoadError(
      timedOut ? "backend_timeout" : "backend_unavailable",
      input.stage,
      input.requestId,
      true,
      input.telemetry,
    );
  }
  const latencyMs = Date.now() - startedAt;
  const contentType = response.headers.get("content-type")?.toLowerCase();
  const responseRequestId = response.headers.get("x-request-id");
  if (
    !contentType?.includes("application/json") ||
    responseRequestId !== input.requestId ||
    !REQUEST_ID_PATTERN.test(responseRequestId)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new WeeklyLoadError(
      input.stage === "latest_metadata" ? "latest_metadata_invalid" : "invalid_backend_contract",
      input.stage,
      input.requestId,
      false,
      input.telemetry,
    );
  }

  let decoded: { payload: unknown; bytes: number };
  try {
    decoded = await readJsonWithLimit(response, input.maximumBytes);
  } catch {
    throw new WeeklyLoadError(
      input.stage === "latest_metadata" ? "latest_metadata_invalid" : "invalid_backend_contract",
      input.stage,
      input.requestId,
      false,
      input.telemetry,
    );
  }
  if (input.stage === "latest_metadata") {
    input.telemetry.latestResponseBytes = decoded.bytes;
    input.telemetry.latestLatencyMs = latencyMs;
  } else {
    input.telemetry.regionalResponseBytes = decoded.bytes;
    input.telemetry.regionalLatencyMs = latencyMs;
  }
  if (!response.ok) {
    const mapped = mappedResponseReason(
      input.stage,
      response.status,
      upstreamErrorCode(decoded.payload),
    );
    throw new WeeklyLoadError(
      mapped.reason,
      input.stage,
      input.requestId,
      mapped.retryable,
      input.telemetry,
    );
  }
  return { ...decoded, latencyMs };
}

async function loadWeeklyState(
  region: string,
  allowedGridIds: Set<string>,
  signal: AbortSignal,
  requestId: string,
): Promise<HomeLiveState> {
  const telemetry = emptyTelemetry();
  let origin: string;
  let headers: HeadersInit;
  try {
    origin = backendOrigin();
    headers = backendHeaders(requestId);
  } catch (error) {
    const unauthorized = error instanceof Error && error.message.startsWith("BACKEND_API_KEY_");
    throw new WeeklyLoadError(
      unauthorized ? "unauthorized" : "backend_unavailable",
      "latest_metadata",
      requestId,
      false,
      telemetry,
    );
  }

  const latest = await requestUpstreamJson({
    origin,
    path: "/api/v1/weekly/latest",
    headers,
    requestId,
    stage: "latest_metadata",
    maximumBytes: LATEST_RESPONSE_MAX_BYTES,
    signal,
    telemetry,
  });
  const envelope = parseLatestEnvelope(latest.payload);
  if (!envelope) {
    throw new WeeklyLoadError(
      "latest_metadata_invalid",
      "latest_metadata",
      requestId,
      false,
      telemetry,
    );
  }
  const selected = envelope.regions.find((item) => item.region === region);
  if (!selected) {
    throw new WeeklyLoadError(
      "region_missing",
      "latest_metadata",
      requestId,
      false,
      telemetry,
    );
  }
  telemetry.declaredCellCount = selected.cellCount;
  if (Date.parse(selected.expiresAt) <= Date.now()) {
    throw new WeeklyLoadError(
      "weekly_predictions_expired",
      "latest_metadata",
      requestId,
      false,
      telemetry,
    );
  }

  const regional = await requestUpstreamJson({
    origin,
    path: `/api/v1/weekly/${encodeURIComponent(selected.weekStart)}/${encodeURIComponent(region)}`,
    headers,
    requestId,
    stage: "regional_payload",
    maximumBytes: REGIONAL_RESPONSE_MAX_BYTES,
    signal,
    telemetry,
  });
  const detail = parseRegionalRecord(regional.payload);
  if (!detail) {
    throw new WeeklyLoadError(
      "invalid_backend_contract",
      "regional_payload",
      requestId,
      false,
      telemetry,
    );
  }
  if (Date.parse(detail.expiresAt) <= Date.now()) {
    throw new WeeklyLoadError(
      "regional_payload_expired",
      "regional_payload",
      requestId,
      false,
      telemetry,
    );
  }
  if (!metadataMatches(selected, detail)) {
    throw new WeeklyLoadError(
      "latest_region_contract_mismatch",
      "regional_payload",
      requestId,
      false,
      telemetry,
    );
  }

  const payload = detail.payload;
  const payloadRegion = nonEmptyString(payload.region, 80)?.toLocaleLowerCase("en");
  const payloadWeekStart = validDateOnly(payload.week_start);
  const payloadWeekEnd = validDateOnly(payload.week_end);
  const payloadCatalog = nonEmptyString(payload.model_catalog_version, 200);
  const payloadSchema = nonEmptyString(payload.schema_version, 200);
  const payloadCellCount = finiteNumber(payload.cell_count);
  const generatedAt = validTimestamp(payload.generated_at);
  const rawCells = payload.cells;
  if (
    payloadRegion !== detail.region ||
    payloadWeekStart !== detail.weekStart ||
    payloadWeekEnd !== detail.weekEnd ||
    payloadCatalog !== detail.modelCatalogVersion ||
    payloadSchema !== detail.schemaVersion ||
    payloadCellCount !== detail.cellCount ||
    !Number.isInteger(payloadCellCount) ||
    !generatedAt ||
    !Array.isArray(rawCells) ||
    rawCells.length !== detail.cellCount
  ) {
    throw new WeeklyLoadError(
      "latest_region_contract_mismatch",
      "regional_payload",
      requestId,
      false,
      telemetry,
    );
  }

  const decodedCells: HomeWeeklyCell[] = [];
  const seenGridIds = new Set<string>();
  for (const rawCell of rawCells) {
    const cell = parseWeeklyCell(rawCell);
    if (!cell || seenGridIds.has(cell.gridId)) {
      throw new WeeklyLoadError(
        "invalid_backend_contract",
        "regional_payload",
        requestId,
        false,
        telemetry,
      );
    }
    seenGridIds.add(cell.gridId);
    decodedCells.push(cell);
  }
  const cells = decodedCells.filter((cell) => allowedGridIds.has(cell.gridId));
  telemetry.decodedCellCount = decodedCells.length;
  telemetry.matchedCellCount = cells.length;
  telemetry.droppedCellCount = decodedCells.length - cells.length;
  telemetry.unmatchedGridIdCount = telemetry.droppedCellCount;
  if (cells.length === 0) {
    throw new WeeklyLoadError(
      "grid_id_mismatch",
      "regional_payload",
      requestId,
      false,
      telemetry,
    );
  }

  const modelPolicy = record(payload.model_policy);
  const coverage = coverageFields(payload.coverage_metadata ?? detail.coverageMetadata);
  const hasCropPredictions = cells.some((cell) =>
    Object.keys(cell.predictions).some((target) => target.startsWith("crop_suitability_")),
  );

  return {
    mode: "weekly",
    requestedPeriod: "latest",
    region,
    weekStart: detail.weekStart,
    weekEnd: detail.weekEnd,
    observationDate: observationDate(detail.weekEnd),
    generatedAt,
    modelCatalogVersion: detail.modelCatalogVersion,
    schemaVersion: detail.schemaVersion,
    sourceSha256: detail.sourceSha256,
    predictionSha256: detail.predictionSha256,
    cropPredictionsAvailable:
      modelPolicy?.crop_predictions_available === true && hasCropPredictions,
    allowFlaggedModels: modelPolicy?.allow_flagged_models === true,
    coverageRatio: coverage.ratio,
    observationDays: coverage.observationDays,
    expectedDays: coverage.expectedDays,
    isPartialWeek: coverage.partial,
    unavailableReason: null,
    diagnostics: { requestId, failingStage: null, retryable: false },
    telemetry,
    cells,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawRegion = url.searchParams.get("region") ?? "ayeyawaddy";
  const rawPeriod = url.searchParams.get("period") ?? "latest";
  if (rawPeriod !== "latest" && rawPeriod !== "pilot") {
    return NextResponse.json(
      { error: { code: "INVALID_PERIOD", message: "Period must be latest or pilot." } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const region = resolvePilotRegion(rawRegion);
    const bundle = await loadPilotBundle(region);
    let live = historicalState(rawPeriod, region, null);
    if (rawPeriod === "latest") {
      try {
        live = await loadWeeklyState(
          region,
          new Set(bundle.cells.map((cell) => cell.id)),
          request.signal,
          (() => {
            const supplied = request.headers.get("x-request-id");
            return supplied && REQUEST_ID_PATTERN.test(supplied)
              ? supplied
              : crypto.randomUUID();
          })(),
        );
      } catch (error) {
        const failure = error instanceof WeeklyLoadError
          ? error
          : new WeeklyLoadError(
              "backend_unavailable",
              "latest_metadata",
              crypto.randomUUID(),
              true,
              emptyTelemetry(),
            );
        live = historicalState(
          "latest",
          region,
          failure.reason,
          {
            requestId: failure.requestId,
            failingStage: failure.stage,
            retryable: failure.retryable,
          },
          failure.telemetry,
        );
      }
    }

    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-Home-Data-Mode": live.mode,
      "X-API-Version": "1",
    };
    if (live.diagnostics.requestId) headers["X-Request-ID"] = live.diagnostics.requestId;
    if (live.diagnostics.failingStage) {
      headers["X-Home-Weekly-Failure-Stage"] = live.diagnostics.failingStage;
    }
    return NextResponse.json({ ...bundle, live }, { headers });
  } catch (error) {
    if (error instanceof PilotRegionError) {
      return NextResponse.json(
        { error: { code: "UNKNOWN_REGION", message: "Region is not supported." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: { code: "HOME_DATA_UNAVAILABLE", message: "Home data is unavailable." } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
