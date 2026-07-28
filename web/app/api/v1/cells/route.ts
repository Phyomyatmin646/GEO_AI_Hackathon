import { NextResponse } from "next/server";
import {
  ApiRequestError,
  apiHeaders,
  errorPayload,
  filterCells,
  parseCellFilters,
} from "../../../lib/cells-api";
import {
  PilotBundleValidationError,
  loadPilotBundle,
} from "../../../lib/pilot-data";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const region = requestUrl.searchParams.get("region") || "ayeyawaddy";
    const bundle = await loadPilotBundle(region);
    const filters = parseCellFilters(requestUrl);
    const { cells, total } = filterCells(bundle, filters);
    if (filters.cellId && total === 0) {
      throw new ApiRequestError(
        404,
        "CELL_NOT_FOUND",
        `No pilot cell exists with ID ${filters.cellId}`,
        "cell_id",
      );
    }

    return NextResponse.json(
      {
        apiVersion: "v1",
        schemaVersion: bundle.schemaVersion,
        meta: bundle.meta,
        cells,
        pagination: {
          total,
          offset: filters.offset,
          limit: filters.limit,
          returned: cells.length,
        },
        links: {
          self: `${requestUrl.pathname}${requestUrl.search}`,
          selectedCellCsvTemplate:
            "/api/v1/cells/{cell_id}/report.csv",
        },
      },
      { headers: apiHeaders(bundle) },
    );
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
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
