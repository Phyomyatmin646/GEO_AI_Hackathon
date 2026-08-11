import { GeoAIBackendClient } from "../../../../lib/api-client";
import { proxyCropCalendarGet } from "../../../../lib/crop-calendar-bff";
import { assertNoCropCalendarQuery } from "../../../../lib/crop-calendar-contract";

export async function GET(request: Request) {
  return proxyCropCalendarGet(request, (requestId) => {
    assertNoCropCalendarQuery(new URL(request.url).searchParams);
    return GeoAIBackendClient.listCropCalendarCrops(requestId, request.signal);
  });
}

