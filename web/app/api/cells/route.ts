import { NextResponse } from "next/server";
import { ApiRequestError, errorPayload, parseDownloadRegion } from "../../lib/cells-api";
import {
  DEFAULT_PILOT_REGION,
  PilotBundleValidationError,
  PilotRegionError,
  loadPilotBundle,
} from "../../lib/pilot-data";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const region = parseDownloadRegion(requestUrl);
    const bundle = await loadPilotBundle(region ?? DEFAULT_PILOT_REGION);
    return NextResponse.json(
      {
        meta: {
          ...bundle.meta,
          // Compatibility aliases for the original pilot UI. New consumers
          // should use the structured v1 metadata.
          releaseKind: "REAL_EARTH_ENGINE_PILOT_NOT_OBSERVED",
          generatedFrom: bundle.meta.releaseId,
          gridResolution: `${bundle.meta.grid.sizeM / 1000} km centroid, ${bundle.meta.grid.crs}`,
          period: bundle.meta.periodStart.slice(0, 7),
          sourceFamilies: bundle.meta.sources.map((source) => source.name),
        },
        cells: bundle.cells,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
          "X-API-Deprecated": "true",
          "X-Data-Contract": bundle.meta.dataContract,
          "X-Data-Mode": bundle.meta.dataMode,
          "X-Release-ID": bundle.meta.releaseId,
          "X-Source-Manifest-SHA256": bundle.meta.sourceManifestSha256,
          Deprecation: "true",
          Link: '</api/v1/cells>; rel="successor-version"',
          Warning: '299 - "Deprecated endpoint; use /api/v1/cells"',
        },
      },
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return NextResponse.json(errorPayload(error), {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
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
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error instanceof PilotBundleValidationError) {
      return NextResponse.json(
        {
          error: {
            code: "PILOT_BUNDLE_INVALID",
            message: "The published pilot data bundle failed runtime validation.",
          },
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected server error occurred.",
        },
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
