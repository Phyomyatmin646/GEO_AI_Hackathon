import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  decodeDailyMapPayload,
  type DailyMapCellView,
} from "@/app/lib/daily-map-data";
import {
  loadPilotBundle,
  resolvePilotRegion,
} from "@/app/lib/pilot-data";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 30_000;
const RESPONSE_MAX_BYTES = 64 * 1024 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,80}$/;
const DATE_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

type UnknownRecord = Record<string, unknown>;
type ErrorPayload = {
  error: { code: string; message: string };
  request_id: string;
};

class BodyTooLargeError extends Error {}

const polygonCache: Record<string, Record<string, [number, number][]>> = {};

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requestIdFor(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
}

function responseHeaders(requestId: string, state?: "success" | "empty"): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": requestId,
    ...(state ? { "X-Daily-Data-State": state } : {}),
  };
}

function safeError(
  status: number,
  code: string,
  message: string,
  requestId: string,
): NextResponse<ErrorPayload> {
  return NextResponse.json(
    { error: { code, message }, request_id: requestId },
    { status, headers: responseHeaders(requestId) },
  );
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  const octets = normalized.split(".");
  return octets.length === 4 &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255) &&
    octets[0] === "127";
}

function allowInsecureBackendHttp(): boolean {
  const value = process.env.ALLOW_INSECURE_BACKEND_HTTP?.trim().toLowerCase();
  return value === "true" || value === "1";
}

function backendOrigin(): string {
  const configuredValue = process.env.BACKEND_URL?.trim();
  if (process.env.NODE_ENV === "production" && !configuredValue) {
    throw new Error("BACKEND_CONFIGURATION_INVALID");
  }
  const url = new URL(configuredValue || DEFAULT_BACKEND_URL);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash ||
    url.protocol === "http:" && !isLoopbackHostname(url.hostname) && !allowInsecureBackendHttp()
  ) {
    throw new Error("BACKEND_CONFIGURATION_INVALID");
  }
  return url.origin;
}

function backendHeaders(requestId: string): HeadersInit {
  const apiKey = process.env.BACKEND_API_KEY?.trim();
  if (!apiKey && process.env.NODE_ENV === "production") {
    throw new Error("BACKEND_CONFIGURATION_INVALID");
  }
  if (apiKey && [...apiKey].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint > 126;
  })) {
    throw new Error("BACKEND_CONFIGURATION_INVALID");
  }
  return {
    Accept: "application/json",
    "X-Request-ID": requestId,
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
  };
}

async function readJsonWithLimit(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > RESPONSE_MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new BodyTooLargeError();
  }
  if (!response.body) throw new Error("INVALID_JSON");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > RESPONSE_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text) as unknown;
}

function safeUpstreamError(payload: unknown): { code: string; message: string } | null {
  const source = record(payload);
  const error = record(source?.error);
  const code = typeof error?.code === "string" && ERROR_CODE_PATTERN.test(error.code)
    ? error.code
    : null;
  if (!code) return null;
  const messages: Record<string, string> = {
    WEEKLY_PREDICTIONS_NOT_FOUND: "Daily compatibility data was not found.",
    WEEKLY_PREDICTIONS_EXPIRED: "Daily compatibility data has expired.",
    DATABASE_NOT_CONFIGURED: "Daily compatibility storage is not configured.",
    UNAUTHORIZED: "The web gateway could not authenticate to the backend.",
  };
  return { code, message: messages[code] ?? "The backend rejected the map request." };
}

function mappedStatus(status: number): number {
  return [400, 401, 403, 404, 410, 429, 503, 504].includes(status) ? status : 502;
}

async function getPolygonsForRegion(
  region: string,
): Promise<Record<string, [number, number][]>> {
  if (polygonCache[region]) return polygonCache[region];
  const normalized = resolvePilotRegion(region);
  const bundle = await loadPilotBundle(normalized);
  const polygons = Object.fromEntries(
    bundle.cells.map((cell) => [cell.id, cell.polygon]),
  );
  polygonCache[region] = polygons;
  return polygons;
}

function validDateParameter(value: string): boolean {
  if (value === "latest") return true;
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(
  request: Request,
  { params }: { params: { date: string } },
) {
  const requestId = requestIdFor(request);
  if (!validDateParameter(params.date)) {
    return safeError(400, "INVALID_DATE", "Date must be latest or YYYY-MM-DD.", requestId);
  }
  let origin: string;
  let headers: HeadersInit;
  try {
    origin = backendOrigin();
    headers = backendHeaders(requestId);
  } catch {
    return safeError(
      503,
      "BACKEND_CONFIGURATION_INVALID",
      "The daily map service is not configured correctly.",
      requestId,
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `${origin}/api/v1/daily/${encodeURIComponent(params.date)}/map`,
      {
        method: "GET",
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.any([
          request.signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]),
      },
    );
  } catch (error) {
    if (request.signal.aborted) {
      return safeError(499, "CLIENT_CLOSED_REQUEST", "The client closed the request.", requestId);
    }
    const timedOut = error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    return safeError(
      timedOut ? 504 : 503,
      timedOut ? "BACKEND_TIMEOUT" : "BACKEND_UNAVAILABLE",
      timedOut
        ? "The daily map service did not respond in time."
        : "The daily map service is unavailable.",
      requestId,
    );
  }

  const upstreamRequestId = response.headers.get("x-request-id");
  if (
    response.headers.get("content-type")?.toLowerCase().includes("application/json") !== true ||
    upstreamRequestId !== requestId
  ) {
    await response.body?.cancel().catch(() => undefined);
    return safeError(
      502,
      "BACKEND_INVALID_RESPONSE",
      "The daily map service returned an invalid response.",
      requestId,
    );
  }

  let payload: unknown;
  try {
    payload = await readJsonWithLimit(response);
  } catch {
    return safeError(
      502,
      "BACKEND_INVALID_RESPONSE",
      "The daily map service returned an invalid response.",
      requestId,
    );
  }
  if (!response.ok) {
    const backendError = safeUpstreamError(payload);
    return safeError(
      mappedStatus(response.status),
      backendError?.code ?? "BACKEND_REQUEST_FAILED",
      backendError?.message ?? "The daily map request was rejected.",
      requestId,
    );
  }

  const cells = decodeDailyMapPayload(payload);
  if (!cells) {
    return safeError(
      502,
      "BACKEND_CONTRACT_ERROR",
      "The daily map service returned an invalid data contract.",
      requestId,
    );
  }

  const regions = [...new Set(cells.map((cell) => cell.region))];
  const polygonsByRegion = new Map<string, Record<string, [number, number][]>>();
  try {
    await Promise.all(regions.map(async (region) => {
      polygonsByRegion.set(region, await getPolygonsForRegion(region));
    }));
  } catch {
    return safeError(
      502,
      "GRID_GEOMETRY_UNAVAILABLE",
      "Canonical map geometry is unavailable.",
      requestId,
    );
  }

  const view: DailyMapCellView[] = cells.map((cell) => ({
    ...cell,
    polygon: polygonsByRegion.get(cell.region)?.[cell.index] ?? null,
  }));
  return NextResponse.json(view, {
    headers: responseHeaders(requestId, view.length === 0 ? "empty" : "success"),
  });
}
