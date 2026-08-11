import { GeoAIBackendClient } from "../../../../../lib/api-client";
import { proxyMarketGet } from "../../../../../lib/market-bff";
import { parseMarketCommodityLatestQuery } from "../../../../../lib/market-contract";

export async function GET(request: Request) {
  return proxyMarketGet(request, (requestId) =>
    GeoAIBackendClient.getLatestMarketCommodities(
      parseMarketCommodityLatestQuery(new URL(request.url).searchParams),
      requestId,
      request.signal,
    ),
  );
}
