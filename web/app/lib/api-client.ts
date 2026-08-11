import type { PredictionResponse } from "./model-contract";
import { isPredictionResponse } from "./model-contract";
import type {
  MarketCommodityLatestQuery,
  MarketCommodityLatestResponse,
  MarketCropKey,
  MarketCropsResponse,
  MarketHistoryQuery,
  MarketHistoryResponse,
  MarketLatestQuery,
  MarketLatestResponse,
} from "./market-contract";
import {
  isMarketCommodityLatestResponse,
  isMarketCropsResponse,
  isMarketHistoryResponse,
  isMarketLatestResponse,
  MARKET_CROP_KEYS,
} from "./market-contract";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
// FastAPI admits for at most 5s and executes synchronously for at most 30s.
// The BFF leaves bounded transport overhead beyond the Node gateway deadline.
const REQUEST_TIMEOUT_MS = 45_000;

export class BackendApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

function backendOrigin(): string {
  const configuredValue = process.env.BACKEND_URL?.trim();
  if (isProductionRuntime() && !configuredValue) throw backendConfigurationError();
  const configured = configuredValue || DEFAULT_BACKEND_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw backendConfigurationError();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw backendConfigurationError();
  }
  if (
    url.protocol === "http:" &&
    !isLoopbackHostname(url.hostname) &&
    !allowInsecureBackendHttp()
  ) {
    throw backendConfigurationError();
  }
  return url.origin;
}

function backendConfigurationError(): BackendApiError {
  return new BackendApiError(
    503,
    "BACKEND_CONFIGURATION_INVALID",
    "The backend gateway is not configured correctly.",
  );
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

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

function backendHeaders(requestId: string, hasBody = false): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Request-ID": requestId,
  };
  if (hasBody) headers["Content-Type"] = "application/json";
  const apiKey = process.env.BACKEND_API_KEY?.trim();
  if (!apiKey && isProductionRuntime()) throw backendConfigurationError();
  if (apiKey) {
    if ([...apiKey].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint > 126;
    })) {
      throw backendConfigurationError();
    }
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

async function errorFromResponse(response: Response): Promise<BackendApiError> {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = await response.json() as unknown;
    if (isRecord(parsed)) payload = parsed;
  } catch {
    // Do not expose non-JSON upstream bodies to the browser.
  }
  const errorBody = isRecord(payload.error) ? payload.error : {};
  return new BackendApiError(
    response.status,
    typeof errorBody.code === "string" ? errorBody.code : "BACKEND_REQUEST_FAILED",
    typeof errorBody.message === "string"
      ? errorBody.message
      : "The model gateway could not complete the request.",
    typeof payload.request_id === "string"
      ? payload.request_id
      : response.headers.get("x-request-id") ?? undefined,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function request(
  path: string,
  requestId: string,
  init: { method: "GET" | "POST"; body?: unknown },
  externalSignal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${backendOrigin()}${path}`, {
      method: init.method,
      headers: backendHeaders(requestId, init.body !== undefined),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      redirect: "error",
      signal: externalSignal
        ? AbortSignal.any([externalSignal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new BackendApiError(
        504,
        "BACKEND_TIMEOUT",
        "The model gateway did not respond in time.",
        requestId,
      );
    }
    if (error instanceof BackendApiError) throw error;
    throw new BackendApiError(
      503,
      "BACKEND_UNAVAILABLE",
      "The model gateway is unavailable.",
      requestId,
    );
  }
  if (!response.ok) throw await errorFromResponse(response);
  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (!contentType?.includes("application/json")) {
    throw new BackendApiError(
      502,
      "BACKEND_INVALID_RESPONSE",
      "The model gateway returned an invalid response.",
      requestId,
    );
  }
  try {
    return await response.json() as unknown;
  } catch {
    throw new BackendApiError(
      502,
      "BACKEND_INVALID_RESPONSE",
      "The backend gateway returned invalid JSON.",
      requestId,
    );
  }
}

function withQuery(
  path: string,
  query: Record<string, string | number | undefined>,
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) searchParams.set(key, String(value));
  }
  const search = searchParams.toString();
  return search ? `${path}?${search}` : path;
}

function contractError(requestId: string): BackendApiError {
  return new BackendApiError(
    502,
    "BACKEND_CONTRACT_ERROR",
    "The market-price service returned an invalid response.",
    requestId,
  );
}

function hasExpectedLatestCrops(
  response: MarketLatestResponse,
  crop: MarketCropKey | undefined,
): boolean {
  const expected = crop === undefined ? MARKET_CROP_KEYS : [crop];
  return (
    response.prices.length === expected.length &&
    response.prices.every((price, index) => price.crop === expected[index])
  );
}

export class GeoAIBackendClient {
  static async getReadyStatus(requestId: string): Promise<unknown> {
    return request("/health/ready", requestId, { method: "GET" });
  }

  static async listModels(requestId: string): Promise<unknown> {
    return request("/api/v1/models", requestId, { method: "GET" });
  }

  static async predict(
    body: unknown,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<PredictionResponse> {
    const payload = await request("/api/v1/predictions", requestId, {
      method: "POST",
      body,
    }, signal);
    if (!isPredictionResponse(payload)) {
      throw new BackendApiError(
        502,
        "BACKEND_CONTRACT_ERROR",
        "The model gateway returned an invalid prediction response.",
        requestId,
      );
    }
    return payload;
  }

  static async getLatestMarketPrices(
    query: MarketLatestQuery,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<MarketLatestResponse> {
    const payload = await request(
      withQuery("/api/v1/market-prices/latest", query),
      requestId,
      { method: "GET" },
      signal,
    );
    if (!isMarketLatestResponse(payload) || !hasExpectedLatestCrops(payload, query.crop)) {
      throw contractError(requestId);
    }
    return payload;
  }

  static async listMarketCrops(
    requestId: string,
    signal?: AbortSignal,
  ): Promise<MarketCropsResponse> {
    const payload = await request(
      "/api/v1/market-prices/crops",
      requestId,
      { method: "GET" },
      signal,
    );
    if (!isMarketCropsResponse(payload)) throw contractError(requestId);
    return payload;
  }

  static async getLatestMarketCommodities(
    query: MarketCommodityLatestQuery,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<MarketCommodityLatestResponse> {
    const payload = await request(
      withQuery("/api/v1/market-prices/commodities/latest", query),
      requestId,
      { method: "GET" },
      signal,
    );
    if (!isMarketCommodityLatestResponse(payload)) throw contractError(requestId);
    return payload;
  }

  static async getLatestMarketPriceForCrop(
    crop: MarketCropKey,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<MarketLatestResponse> {
    const payload = await request(
      `/api/v1/market-prices/${encodeURIComponent(crop)}/latest`,
      requestId,
      { method: "GET" },
      signal,
    );
    if (!isMarketLatestResponse(payload) || !hasExpectedLatestCrops(payload, crop)) {
      throw contractError(requestId);
    }
    return payload;
  }

  static async getMarketPriceHistory(
    crop: MarketCropKey,
    query: MarketHistoryQuery,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<MarketHistoryResponse> {
    const payload = await request(
      withQuery(`/api/v1/market-prices/${encodeURIComponent(crop)}/history`, query),
      requestId,
      { method: "GET" },
      signal,
    );
    if (!isMarketHistoryResponse(payload) || payload.crop !== crop) {
      throw contractError(requestId);
    }
    return payload;
  }
}
