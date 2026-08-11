import { GeoAIBackendClient } from "../../../../../lib/api-client";
import { proxyMarketGet } from "../../../../../lib/market-bff";
import {
  assertNoMarketQuery,
  parseMarketCropKey,
} from "../../../../../lib/market-contract";

type RouteContext = {
  params: Promise<{ crop: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return proxyMarketGet(request, async (requestId) => {
    assertNoMarketQuery(new URL(request.url).searchParams);
    const { crop: rawCrop } = await context.params;
    return GeoAIBackendClient.getLatestMarketPriceForCrop(
      parseMarketCropKey(rawCrop),
      requestId,
      request.signal,
    );
  });
}
