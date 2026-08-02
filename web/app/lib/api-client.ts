import type { PredictionResponse } from "./model-contract";
import { isPredictionResponse } from "./model-contract";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
// FastAPI admits for at most 5s and executes synchronously for at most 30s.
// The BFF leaves bounded transport overhead beyond the Node gateway deadline.
const REQUEST_TIMEOUT_MS = 45_000;

type BackendErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
  request_id?: string;
};

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
    throw new BackendApiError(
      503,
      "BACKEND_CONFIGURATION_INVALID",
      "The model gateway is not configured correctly.",
    );
  }
  return url.origin;
}

function backendHeaders(requestId: string, hasBody = false): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Request-ID": requestId,
  };
  if (hasBody) headers["Content-Type"] = "application/json";
  const apiKey = process.env.BACKEND_API_KEY?.trim();
  if (apiKey) headers["X-API-Key"] = apiKey;
  return headers;
}

async function errorFromResponse(response: Response): Promise<BackendApiError> {
  let payload: BackendErrorBody = {};
  try {
    payload = (await response.json()) as BackendErrorBody;
  } catch {
    // Do not expose non-JSON upstream bodies to the browser.
  }
  return new BackendApiError(
    response.status,
    payload.error?.code ?? "BACKEND_REQUEST_FAILED",
    payload.error?.message ?? "The model gateway could not complete the request.",
    payload.request_id ?? response.headers.get("x-request-id") ?? undefined,
  );
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
  return response.json() as Promise<unknown>;
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
}
