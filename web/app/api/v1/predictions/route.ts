import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { BackendApiError, GeoAIBackendClient } from "../../../lib/api-client";

const MAX_REQUEST_BYTES = 16 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function responseHeaders(requestId: string): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": requestId,
  };
}

export async function POST(request: Request) {
  const candidateRequestId = request.headers.get("x-request-id");
  const requestId =
    candidateRequestId && REQUEST_ID_PATTERN.test(candidateRequestId)
      ? candidateRequestId
      : randomUUID();
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  let body: unknown;
  try {
    const text = await request.text();
    body = JSON.parse(text) as unknown;
  } catch (error) {
    const apiError = error instanceof BackendApiError ? error : undefined;
    return NextResponse.json(
      {
        error: {
          code: apiError?.code ?? "INVALID_JSON",
          message: apiError?.message ?? "The request body must be valid JSON.",
        },
        request_id: requestId,
      },
      { status: apiError?.status ?? 400, headers: responseHeaders(requestId) },
    );
  }

  try {
    const prediction = await GeoAIBackendClient.predict(body, requestId, request.signal);
    return NextResponse.json(prediction, {
      status: 200,
      headers: responseHeaders(prediction.request_id),
    });
  } catch (error) {
    const apiError =
      error instanceof BackendApiError
        ? error
        : new BackendApiError(
            500,
            "INTERNAL_SERVER_ERROR",
            "An unexpected server error occurred.",
            requestId,
          );
    return NextResponse.json(
      {
        error: { code: apiError.code, message: apiError.message },
        request_id: apiError.requestId ?? requestId,
      },
      {
        status: apiError.status,
        headers: responseHeaders(apiError.requestId ?? requestId),
      },
    );
  }
}
