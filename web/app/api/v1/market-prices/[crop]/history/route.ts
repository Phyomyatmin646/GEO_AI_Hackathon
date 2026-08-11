import { GeoAIBackendClient } from "../../../../../lib/api-client";
import { proxyMarketGet } from "../../../../../lib/market-bff";
import {
  parseMarketCropKey,
  parseMarketHistoryQuery,
} from "../../../../../lib/market-contract";

type RouteContext = {
  params: Promise<{ crop: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return proxyMarketGet(request, async (requestId) => {
    const { crop: rawCrop } = await context.params;
    return GeoAIBackendClient.getMarketPriceHistory(
      parseMarketCropKey(rawCrop),
      parseMarketHistoryQuery(new URL(request.url).searchParams),
      requestId,
      request.signal,
    );
  });
}
