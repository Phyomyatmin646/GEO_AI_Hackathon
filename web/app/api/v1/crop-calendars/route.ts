import { GeoAIBackendClient } from "../../../lib/api-client";
import { proxyCropCalendarGet } from "../../../lib/crop-calendar-bff";
import { parseCropCalendarRegionQuery } from "../../../lib/crop-calendar-contract";

export async function GET(request: Request) {
  return proxyCropCalendarGet(request, (requestId) => {
    const { region } = parseCropCalendarRegionQuery(new URL(request.url).searchParams);
    return GeoAIBackendClient.listCropCalendarsByRegion(region, requestId, request.signal);
  });
}

