import { NextResponse } from "next/server";

import type {
  HomeLiveState,
  HomePeriod,
  HomePrediction,
  HomeWeeklyCell,
} from "@/app/lib/home-data";
import {
  loadPilotBundle,
  PilotRegionError,
  resolvePilotRegion,
} from "@/app/lib/pilot-data";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const HOME_BACKEND_TIMEOUT_MS = 3_500;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function backendOrigin(): string {
  const configured = process.env.BACKEND_URL?.trim() || DEFAULT_BACKEND_URL;
  const url = new URL(configured);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid backend origin");
  }
  return url.origin;
}

function observationDate(weekEnd: string | null): string | null {
  if (!weekEnd) return null;
  const date = new Date(`${weekEnd}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function historicalState(period: HomePeriod, reason: string | null): HomeLiveState {
  return {
    mode: "historical",
    requestedPeriod: period,
    weekStart: null,
    weekEnd: null,
    observationDate: null,
    modelCatalogVersion: null,
    cropPredictionsAvailable: false,
    allowFlaggedModels: false,
    coverageRatio: null,
    isPartialWeek: false,
    unavailableReason: reason,
    cells: [],
  };
}

function parsePrediction(value: unknown): HomePrediction | null {
  const source = record(value);
  if (!source) return null;
  const rawValue = source.value;
  if (
    rawValue !== null &&
    typeof rawValue !== "string" &&
    !(typeof rawValue === "number" && Number.isFinite(rawValue))
  ) {
    return null;
  }
  return {
    value: rawValue as number | string | null,
    unit: optionalString(source.unit),
    taskType: optionalString(source.task_type),
    confidence: finiteNumber(source.confidence),
    validationStatus: optionalString(source.validation_status),
    modelVersion: optionalString(source.model_version),
    warnings: Array.isArray(source.warnings)
      ? source.warnings.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function parseWeeklyCell(value: unknown, allowedGridIds: Set<string>): HomeWeeklyCell | null {
  const source = record(value);
  const gridId = optionalString(source?.grid_id);
  const latitude = finiteNumber(source?.latitude);
  const longitude = finiteNumber(source?.longitude);
  if (!source || !gridId || latitude === null || longitude === null || !allowedGridIds.has(gridId)) {
    return null;
  }
  const predictionContainer = record(source.predictions);
  const rawValues = record(predictionContainer?.values) ?? {};
  const rawErrors = record(predictionContainer?.errors) ?? {};
  const predictions: Record<string, HomePrediction> = {};
  for (const [target, prediction] of Object.entries(rawValues)) {
    const parsed = parsePrediction(prediction);
    if (parsed) predictions[target] = parsed;
  }
  const errors: Record<string, string> = {};
  for (const [target, error] of Object.entries(rawErrors)) {
    if (typeof error === "string") errors[target] = error;
  }
  return { gridId, latitude, longitude, predictions, errors };
}

async function loadWeeklyState(
  region: string,
  allowedGridIds: Set<string>,
): Promise<HomeLiveState> {
  const requestId = crypto.randomUUID();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Request-ID": requestId,
  };
  const apiKey = process.env.BACKEND_API_KEY?.trim();
  if (apiKey) headers["X-API-Key"] = apiKey;

  const response = await fetch(`${backendOrigin()}/api/v1/weekly/latest`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(HOME_BACKEND_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "no_weekly_data" : "backend_unavailable");
  }
  const envelope = record(await response.json());
  const regions = Array.isArray(envelope?.regions) ? envelope.regions : [];
  const selected = regions
    .map(record)
    .find((item) => optionalString(item?.region)?.toLocaleLowerCase("en") === region);
  if (!selected) throw new Error("region_unavailable");

  const payload = record(selected.payload);
  const rawCells = Array.isArray(payload?.cells) ? payload.cells : [];
  const cells = rawCells.flatMap((cell) => {
    const parsed = parseWeeklyCell(cell, allowedGridIds);
    return parsed ? [parsed] : [];
  });
  if (cells.length === 0) throw new Error("invalid_weekly_data");

  const modelPolicy = record(payload?.model_policy) ?? {};
  const coverage = record(payload?.coverage_metadata) ?? record(selected.coverage_metadata) ?? {};
  const weekStart = optionalString(selected.week_start) ?? optionalString(envelope?.week_start);
  const weekEnd = optionalString(selected.week_end) ?? optionalString(envelope?.week_end);
  const hasCropPredictions = cells.some((cell) =>
    Object.keys(cell.predictions).some((target) => target.startsWith("crop_suitability_")),
  );

  return {
    mode: "weekly",
    requestedPeriod: "latest",
    weekStart,
    weekEnd,
    observationDate: observationDate(weekEnd),
    modelCatalogVersion:
      optionalString(selected.model_catalog_version) ?? optionalString(envelope?.model_catalog_version),
    cropPredictionsAvailable:
      modelPolicy.crop_predictions_available === true && hasCropPredictions,
    allowFlaggedModels: modelPolicy.allow_flagged_models === true,
    coverageRatio: finiteNumber(coverage.coverage_ratio),
    isPartialWeek: coverage.is_partial_week === true,
    unavailableReason: null,
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
    let live = historicalState(rawPeriod, rawPeriod === "pilot" ? null : "no_weekly_data");
    if (rawPeriod === "latest") {
      try {
        live = await loadWeeklyState(region, new Set(bundle.cells.map((cell) => cell.id)));
      } catch (error) {
        const reason = error instanceof Error && [
          "no_weekly_data",
          "region_unavailable",
          "invalid_weekly_data",
        ].includes(error.message)
          ? error.message
          : "backend_unavailable";
        live = historicalState("latest", reason);
      }
    }

    return NextResponse.json(
      { ...bundle, live },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Home-Data-Mode": live.mode,
          "X-API-Version": "1",
        },
      },
    );
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
