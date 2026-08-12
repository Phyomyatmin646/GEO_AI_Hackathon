import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { BackendApiError } from "./api-client";
import { MarketQueryValidationError } from "./market-contract";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,80}$/;
const MARKET_CACHE_FRESH_MS = 15 * 60_000;
const MARKET_CACHE_STALE_MS = 24 * 60 * 60_000;
const MARKET_CACHE_MAX_ENTRIES = 128;

type MarketCacheStatus = "bypass" | "miss" | "hit" | "stale";

type MarketCacheEntry = {
  payload: unknown;
  cachedAt: number;
};

const marketCache = new Map<string, MarketCacheEntry>();
const marketLoads = new Map<string, Promise<unknown>>();

function requestContext(request: Request): { requestId: string; supplied: boolean } {
  const candidate = request.headers.get("x-request-id");
  return candidate && REQUEST_ID_PATTERN.test(candidate)
    ? { requestId: candidate, supplied: true }
    : { requestId: randomUUID(), supplied: false };
}

function responseHeaders(
  requestId: string,
  cacheStatus?: MarketCacheStatus,
): HeadersInit {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": requestId,
  };
  if (cacheStatus) headers["X-Market-Cache"] = cacheStatus;
  return headers;
}

function storeMarketCache(key: string, payload: unknown): void {
  marketCache.delete(key);
  marketCache.set(key, { payload, cachedAt: Date.now() });
  while (marketCache.size > MARKET_CACHE_MAX_ENTRIES) {
    const oldestKey = marketCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    marketCache.delete(oldestKey);
  }
}

async function loadMarketWithCache<T>(input: {
  key: string;
  requestId: string;
  bypass: boolean;
  load: (requestId: string) => Promise<T>;
}): Promise<{ payload: T; cacheStatus: MarketCacheStatus }> {
  if (input.bypass) {
    return {
      payload: await input.load(input.requestId),
      cacheStatus: "bypass",
    };
  }

  const cached = marketCache.get(input.key);
  const now = Date.now();
  if (cached && cached.cachedAt + MARKET_CACHE_FRESH_MS > now) {
    return { payload: cached.payload as T, cacheStatus: "hit" };
  }

  let pending = marketLoads.get(input.key) as Promise<T> | undefined;
  if (!pending) {
    pending = input.load(input.requestId);
    marketLoads.set(input.key, pending);
  }
  try {
    const payload = await pending;
    storeMarketCache(input.key, payload);
    return { payload, cacheStatus: "miss" };
  } catch (error) {
    const retryable = error instanceof BackendApiError
      ? error.status === 429 || error.status >= 500
      : true;
    if (
      cached &&
      cached.cachedAt + MARKET_CACHE_STALE_MS > Date.now() &&
      retryable
    ) {
      return { payload: cached.payload as T, cacheStatus: "stale" };
    }
    throw error;
  } finally {
    if (marketLoads.get(input.key) === pending) marketLoads.delete(input.key);
  }
}

export async function proxyMarketGet<T>(
  request: Request,
  load: (requestId: string) => Promise<T>,
) {
  const { requestId, supplied } = requestContext(request);
  try {
    const url = new URL(request.url);
    const result = await loadMarketWithCache({
      key: `${process.env.BACKEND_URL?.trim() ?? ""}|${url.pathname}${url.search}`,
      requestId,
      bypass: supplied,
      load,
    });
    return NextResponse.json(result.payload, {
      status: 200,
      headers: responseHeaders(requestId, result.cacheStatus),
    });
  } catch (error) {
    const apiError =
      error instanceof BackendApiError
        ? error
        : error instanceof MarketQueryValidationError
          ? new BackendApiError(400, "VALIDATION_ERROR", error.message, requestId)
          : new BackendApiError(
              500,
              "INTERNAL_SERVER_ERROR",
              "An unexpected server error occurred.",
              requestId,
            );
    const responseRequestId =
      apiError.requestId && REQUEST_ID_PATTERN.test(apiError.requestId)
        ? apiError.requestId
        : requestId;
    const responseCode = ERROR_CODE_PATTERN.test(apiError.code)
      ? apiError.code
      : "BACKEND_REQUEST_FAILED";
    const responseMessage =
      apiError.message.length >= 1 && apiError.message.length <= 500
        ? apiError.message
        : "The market-price service could not complete the request.";
    return NextResponse.json(
      {
        error: { code: responseCode, message: responseMessage },
        request_id: responseRequestId,
      },
      {
        status: apiError.status,
        headers: responseHeaders(responseRequestId),
      },
    );
  }
}
