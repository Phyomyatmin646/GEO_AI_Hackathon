import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 35_000;
const REQUEST_MAX_BYTES = 48 * 1024;
const RESPONSE_MAX_BYTES = 256 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,80}$/;

type UnknownRecord = Record<string, unknown>;
type ChatHistoryItem = { role: "user" | "assistant"; content: string };
type ChatRequest = {
  message: string;
  history: ChatHistoryItem[];
  language: "my" | "en";
};

class BodyTooLargeError extends Error {}

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requestIdFor(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
}

function headers(requestId: string, retryAfter?: string): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": requestId,
    ...(retryAfter && /^\d{1,10}$/.test(retryAfter) ? { "Retry-After": retryAfter } : {}),
  };
}

function safeError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  retryAfter?: string,
) {
  return NextResponse.json(
    { error: { code, message }, request_id: requestId },
    { status, headers: headers(requestId, retryAfter) },
  );
}

async function readUtf8(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
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
  return text + decoder.decode();
}

function parseRequest(value: unknown): ChatRequest | null {
  const source = record(value);
  if (!source) return null;
  const allowedKeys = new Set(["message", "history", "language"]);
  if (Object.keys(source).some((key) => !allowedKeys.has(key))) return null;
  const message = typeof source.message === "string" ? source.message.trim() : "";
  const language = source.language;
  const rawHistory = source.history ?? [];
  if (
    message.length < 1 ||
    message.length > 4_000 ||
    (language !== "my" && language !== "en") ||
    !Array.isArray(rawHistory) ||
    rawHistory.length > 30
  ) {
    return null;
  }
  const history: ChatHistoryItem[] = [];
  for (const item of rawHistory) {
    const entry = record(item);
    const content = typeof entry?.content === "string" ? entry.content.trim() : "";
    if (
      !entry ||
      Object.keys(entry).some((key) => key !== "role" && key !== "content") ||
      (entry.role !== "user" && entry.role !== "assistant") ||
      content.length < 1 ||
      content.length > 10_000
    ) {
      return null;
    }
    history.push({ role: entry.role, content });
  }
  return { message, history, language };
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
    "Content-Type": "application/json",
    "X-Request-ID": requestId,
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
  };
}

function upstreamErrorCode(value: unknown): string | null {
  const source = record(value);
  const error = record(source?.error);
  return typeof error?.code === "string" && ERROR_CODE_PATTERN.test(error.code)
    ? error.code
    : null;
}

function mappedError(
  status: number,
  code: string | null,
): { status: number; code: string; message: string } {
  if (status === 429 || code === "AI_RATE_LIMITED") {
    return {
      status: 429,
      code: "CHATBOT_RATE_LIMITED",
      message: "The assistant is busy. Please wait briefly and try again.",
    };
  }
  if (status === 504 || code === "CHATBOT_TIMEOUT") {
    return {
      status: 504,
      code: "CHATBOT_TIMEOUT",
      message: "The assistant did not respond in time.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      status: 400,
      code: "CHATBOT_REQUEST_REJECTED",
      message: "The assistant request was not accepted.",
    };
  }
  return {
    status: 503,
    code: code === "CHATBOT_API_KEY_NOT_CONFIGURED"
      ? "CHATBOT_NOT_CONFIGURED"
      : "CHATBOT_UNAVAILABLE",
    message: "The assistant is temporarily unavailable.",
  };
}

function parseUpstreamSuccess(value: unknown, requestId: string) {
  const source = record(value);
  const metadata = record(source?.metadata);
  const context = record(source?.context_used);
  const rawSources = context?.knowledge_sources;
  if (
    !source ||
    source.api_version !== "v1" ||
    source.status !== "success" ||
    source.request_id !== requestId ||
    typeof source.response !== "string" ||
    source.response.trim().length < 1 ||
    source.response.length > 20_000 ||
    typeof source.language !== "string" ||
    source.language.length < 2 ||
    source.language.length > 10 ||
    !metadata ||
    typeof metadata.model !== "string" ||
    typeof metadata.response_time_ms !== "number" ||
    !Number.isFinite(metadata.response_time_ms) ||
    metadata.response_time_ms < 0 ||
    typeof metadata.grounding_enabled !== "boolean" ||
    !context ||
    !Array.isArray(rawSources)
  ) {
    return null;
  }
  const sources: Array<{ title: string; reference: string | null }> = [];
  for (const rawSource of rawSources) {
    const sourceRecord = record(rawSource);
    if (
      !sourceRecord ||
      typeof sourceRecord.title !== "string" ||
      sourceRecord.title.length < 1 ||
      sourceRecord.title.length > 300 ||
      sourceRecord.reference !== undefined && typeof sourceRecord.reference !== "string"
    ) {
      return null;
    }
    sources.push({
      title: sourceRecord.title,
      reference: typeof sourceRecord.reference === "string" ? sourceRecord.reference : null,
    });
  }
  return {
    reply: source.response.trim(),
    language: source.language,
    requestId,
    sources,
    metadata: {
      responseTimeMs: metadata.response_time_ms,
      groundingEnabled: metadata.grounding_enabled,
    },
  };
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
    return safeError(403, "CROSS_SITE_REQUEST_REJECTED", "Cross-site requests are not permitted.", requestId);
  }
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return safeError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.", requestId);
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(await readUtf8(request.body, REQUEST_MAX_BYTES)) as unknown;
  } catch (error) {
    return safeError(
      error instanceof BodyTooLargeError ? 413 : 400,
      error instanceof BodyTooLargeError ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON",
      error instanceof BodyTooLargeError ? "The request body is too large." : "The request body must be valid JSON.",
      requestId,
    );
  }
  const body = parseRequest(rawBody);
  if (!body) {
    return safeError(400, "VALIDATION_ERROR", "The assistant request is invalid.", requestId);
  }

  let origin: string;
  let upstreamHeaders: HeadersInit;
  try {
    origin = backendOrigin();
    upstreamHeaders = backendHeaders(requestId);
  } catch {
    return safeError(503, "BACKEND_CONFIGURATION_INVALID", "The assistant is not configured correctly.", requestId);
  }

  let response: Response;
  try {
    response = await fetch(`${origin}/api/v1/chatbot`, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify({
        message: body.message,
        history: body.history,
        user_info: { preferred_language: body.language },
        include_market_prices: true,
        include_model_predictions: false,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]),
    });
  } catch (error) {
    if (request.signal.aborted) {
      return safeError(499, "CLIENT_CLOSED_REQUEST", "The client closed the request.", requestId);
    }
    const timedOut = error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    return safeError(
      timedOut ? 504 : 503,
      timedOut ? "CHATBOT_TIMEOUT" : "CHATBOT_UNAVAILABLE",
      timedOut ? "The assistant did not respond in time." : "The assistant is temporarily unavailable.",
      requestId,
    );
  }

  if (
    response.headers.get("content-type")?.toLowerCase().includes("application/json") !== true ||
    response.headers.get("x-request-id") !== requestId
  ) {
    await response.body?.cancel().catch(() => undefined);
    return safeError(502, "BACKEND_INVALID_RESPONSE", "The assistant returned an invalid response.", requestId);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(await readUtf8(response.body, RESPONSE_MAX_BYTES)) as unknown;
  } catch {
    return safeError(502, "BACKEND_INVALID_RESPONSE", "The assistant returned an invalid response.", requestId);
  }
  if (!response.ok) {
    const mapped = mappedError(response.status, upstreamErrorCode(payload));
    return safeError(
      mapped.status,
      mapped.code,
      mapped.message,
      requestId,
      response.headers.get("retry-after") ?? undefined,
    );
  }
  const success = parseUpstreamSuccess(payload, requestId);
  if (!success) {
    return safeError(502, "BACKEND_CONTRACT_ERROR", "The assistant returned an invalid response contract.", requestId);
  }
  return NextResponse.json(success, { headers: headers(requestId) });
}
