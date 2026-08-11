import { GeoAIBackendClient } from "../../../../lib/api-client";
import { proxyMarketGet } from "../../../../lib/market-bff";
import { parseMarketLatestQuery } from "../../../../lib/market-contract";

export async function GET(request: Request) {
  return proxyMarketGet(request, (requestId) =>
    GeoAIBackendClient.getLatestMarketPrices(
      parseMarketLatestQuery(new URL(request.url).searchParams),
      requestId,
      request.signal,
    ),
  );
}
