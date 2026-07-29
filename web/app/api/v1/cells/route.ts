import { NextResponse } from "next/server";
import {
  ApiRequestError,
  apiHeaders,
  errorPayload,
  filterCells,
  parseCellFilters,
} from "../../../lib/cells-api";
import {
  DEFAULT_PILOT_REGION,
  PilotBundleValidationError,
  PilotRegionError,
  loadPilotBundle,
} from "../../../lib/pilot-data";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const filters = parseCellFilters(requestUrl);
    const bundle = await loadPilotBundle(filters.region ?? DEFAULT_PILOT_REGION);
    // `region` selects a regional bundle. Bundle cell records use the source
    // system's numeric region codes, so filtering them again by the public
    // region name would incorrectly return an empty list.
    const { cells, total } = filterCells(bundle, { ...filters, region: undefined });
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
            "/api/v1/cells/{cell_id}/report.csv?region={region}",
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
    if (error instanceof PilotRegionError) {
      return NextResponse.json(
        errorPayload(
          new ApiRequestError(
            400,
            "UNKNOWN_REGION",
            "region must be one of: Ayeyawaddy, Sagaing, Mandalay, Bago, Magway",
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
