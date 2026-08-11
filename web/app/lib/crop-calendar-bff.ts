import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { BackendApiError } from "./api-client";
import { CropCalendarValidationError } from "./crop-calendar-contract";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,80}$/;

export async function proxyCropCalendarGet<T>(
  request: Request,
  load: (requestId: string) => Promise<T>,
) {
  const candidate = request.headers.get("x-request-id");
  const requestId = candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
  try {
    return NextResponse.json(await load(requestId), {
      status: 200,
      headers: responseHeaders(requestId),
    });
  } catch (error) {
    const apiError =
      error instanceof BackendApiError
        ? error
        : error instanceof CropCalendarValidationError
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
    const code = ERROR_CODE_PATTERN.test(apiError.code)
      ? apiError.code
      : "BACKEND_REQUEST_FAILED";
    const message =
      apiError.message.length >= 1 && apiError.message.length <= 500
        ? apiError.message
        : "The Crop Calendar service could not complete the request.";
    return NextResponse.json(
      { error: { code, message }, request_id: responseRequestId },
      { status: apiError.status, headers: responseHeaders(responseRequestId) },
    );
  }
}

function responseHeaders(requestId: string): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": requestId,
  };
}

