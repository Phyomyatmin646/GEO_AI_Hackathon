import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 30_000;
const REQUEST_BODY_MAX_BYTES = 8 * 1024;
const RESPONSE_BODY_MAX_BYTES = 32 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,80}$/;

type ErrorBody = {
  error: { code: string; message: string };
  request_id: string;
};

function requestIdFor(request: Request): string {
  const candidate = request.headers.get("x-request-id");
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

class BodyTooLargeError extends Error {}

function responseHeaders(requestId: string, retryAfter?: string): HeadersInit {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": requestId,
  };
  if (retryAfter && /^\d{1,10}$/.test(retryAfter)) {
    headers["Retry-After"] = retryAfter;
  }
  return headers;
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
    throw new Error("BACKEND_CONFIGURATION_INVALID");
  }
  return url.origin;
}

function safeError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  retryAfter?: string,
): NextResponse<ErrorBody> {
  return NextResponse.json(
    { error: { code, message }, request_id: requestId },
    { status, headers: responseHeaders(requestId, retryAfter) },
  );
}

async function readUtf8Body(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(combined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function registeredUserFrom(payload: unknown): Record<string, string | null> | undefined {
  if (!isRecord(payload) || !isRecord(payload.user)) return undefined;
  const user = payload.user;
  if (
    typeof user.id !== "string" ||
    typeof user.username !== "string" ||
    typeof user.phone !== "string" ||
    typeof user.location !== "string" ||
    (user.email !== null && typeof user.email !== "string") ||
    typeof user.created_at !== "string"
  ) {
    return undefined;
  }
  return {
    id: user.id,
    username: user.username,
    phone: user.phone,
    location: user.location,
    email: user.email,
    created_at: user.created_at,
  };
}

function upstreamErrorFrom(
  payload: unknown,
): { code: string; message: string } | undefined {
  if (!isRecord(payload) || !isRecord(payload.error)) return undefined;
  const { code, message } = payload.error;
  if (
    typeof code !== "string" ||
    !ERROR_CODE_PATTERN.test(code) ||
    typeof message !== "string" ||
    message.length < 1 ||
    message.length > 500
  ) {
    return undefined;
  }
  return { code, message };
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
    return safeError(
      403,
      "CROSS_SITE_REQUEST_REJECTED",
      "Cross-site requests are not permitted.",
      requestId,
    );
  }
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return safeError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json.",
      requestId,
    );
  }
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > REQUEST_BODY_MAX_BYTES
  ) {
    return safeError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.", requestId);
  }

  let body: unknown;
  try {
    body = JSON.parse(await readUtf8Body(request.body, REQUEST_BODY_MAX_BYTES)) as unknown;
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return safeError(
        413,
        "PAYLOAD_TOO_LARGE",
        "The request body is too large.",
        requestId,
      );
    }
    if (request.signal.aborted) {
      return safeError(499, "CLIENT_CLOSED_REQUEST", "The client closed the request.", requestId);
    }
    return safeError(
      400,
      "INVALID_JSON",
      "The request body must be valid JSON.",
      requestId,
    );
  }

  let origin: string;
  try {
    origin = backendOrigin();
  } catch {
    return safeError(
      503,
      "BACKEND_CONFIGURATION_INVALID",
      "The registration service is not configured correctly.",
      requestId,
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Request-ID": requestId,
  };
  const apiKey = process.env.BACKEND_API_KEY?.trim();
  if (apiKey) headers["X-API-Key"] = apiKey;

  let response: Response;
  try {
    response = await fetch(`${origin}/api/v1/users/register`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]),
    });
  } catch (error) {
    if (request.signal.aborted) {
      return safeError(
        499,
        "CLIENT_CLOSED_REQUEST",
        "The client closed the request.",
        requestId,
      );
    }
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      return safeError(
        504,
        "BACKEND_TIMEOUT",
        "The registration service did not respond in time.",
        requestId,
      );
    }
    return safeError(
      503,
      "BACKEND_UNAVAILABLE",
      "The registration service is unavailable.",
      requestId,
    );
  }

  const backendRequestId = response.headers.get("x-request-id");
  const responseRequestId =
    backendRequestId && REQUEST_ID_PATTERN.test(backendRequestId)
      ? backendRequestId
      : requestId;
  const responseContentType = response.headers.get("content-type")?.toLowerCase();
  if (!responseContentType?.includes("application/json")) {
    await response.body?.cancel();
    return safeError(
      502,
      "BACKEND_INVALID_RESPONSE",
      "The registration service returned an invalid response.",
      responseRequestId,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readUtf8Body(response.body, RESPONSE_BODY_MAX_BYTES)) as unknown;
  } catch {
    return safeError(
      502,
      "BACKEND_INVALID_RESPONSE",
      "The registration service returned an invalid response.",
      responseRequestId,
    );
  }

  if (!response.ok) {
    const backendError = upstreamErrorFrom(payload);
    return safeError(
      response.status,
      backendError?.code ?? "BACKEND_REQUEST_FAILED",
      backendError?.message ?? "The registration service rejected the request.",
      responseRequestId,
      response.headers.get("retry-after") ?? undefined,
    );
  }

  const user = response.status === 201 ? registeredUserFrom(payload) : undefined;
  if (!user) {
    return safeError(
      502,
      "BACKEND_INVALID_RESPONSE",
      "The registration service returned an invalid response.",
      responseRequestId,
    );
  }
  return NextResponse.json(
    { user },
    {
      status: 201,
      headers: responseHeaders(responseRequestId),
    },
  );
}
