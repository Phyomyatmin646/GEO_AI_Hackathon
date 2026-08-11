import { GeoAIBackendClient } from "../../../../lib/api-client";
import { proxyMarketGet } from "../../../../lib/market-bff";
import { assertNoMarketQuery } from "../../../../lib/market-contract";

export async function GET(request: Request) {
  return proxyMarketGet(request, (requestId) => {
    assertNoMarketQuery(new URL(request.url).searchParams);
    return GeoAIBackendClient.listMarketCrops(requestId, request.signal);
  });
}
