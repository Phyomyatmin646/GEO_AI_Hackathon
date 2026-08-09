import { NextResponse } from "next/server";
import {
  ApiRequestError,
  apiHeaders,
  errorPayload,
  findCell,
  parseDownloadRegion,
  selectedCellCsv,
} from "../../../../../lib/cells-api";
import {
  DEFAULT_PILOT_REGION,
  PilotBundleValidationError,
  PilotRegionError,
  loadPilotBundle,
} from "../../../../../lib/pilot-data";

type RouteContext = {
  params: Promise<{ cellId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const requestUrl = new URL(request.url);
    const region = parseDownloadRegion(requestUrl);
    const bundle = await loadPilotBundle(region ?? DEFAULT_PILOT_REGION);
    const { cellId } = await context.params;
    const cell = findCell(bundle, cellId);
    const headers = apiHeaders(bundle);
    return new Response(selectedCellCsv(bundle, cell), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${cell.id}_${cell.month}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return NextResponse.json(errorPayload(error), {
        status: error.status,
        headers: { "Cache-Control": "no-store", "X-API-Version": "1" },
      });
    }
    if (error instanceof PilotBundleValidationError) {
      return NextResponse.json(
        {
          error: {
            code: "PILOT_BUNDLE_INVALID",
            message: "The published pilot data bundle failed runtime validation.",
          },
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store", "X-API-Version": "1" },
        },
      );
    }
    if (error instanceof PilotRegionError) {
      return NextResponse.json(
        errorPayload(
          new ApiRequestError(
            400,
            "UNKNOWN_REGION",
            "region must be one of: Ayeyawaddy, Sagaing, Mandalay, Bago, Magway, Yangon",
            "region",
          ),
        ),
        {
          status: 400,
          headers: { "Cache-Control": "no-store", "X-API-Version": "1" },
        },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected server error occurred.",
        },
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store", "X-API-Version": "1" },
      },
    );
  }
}
