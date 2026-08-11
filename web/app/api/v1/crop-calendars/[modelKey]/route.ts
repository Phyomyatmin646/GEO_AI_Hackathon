import { GeoAIBackendClient } from "../../../../lib/api-client";
import { proxyCropCalendarGet } from "../../../../lib/crop-calendar-bff";
import {
  parseCropCalendarLookupQuery,
  parseCropCalendarModelKey,
} from "../../../../lib/crop-calendar-contract";

type RouteContext = {
  params: Promise<{ modelKey: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return proxyCropCalendarGet(request, async (requestId) => {
    const { modelKey: rawModelKey } = await context.params;
    const modelKey = parseCropCalendarModelKey(rawModelKey);
    const query = parseCropCalendarLookupQuery(new URL(request.url).searchParams);
    return GeoAIBackendClient.getCropCalendar(modelKey, query, requestId, request.signal);
  });
}

