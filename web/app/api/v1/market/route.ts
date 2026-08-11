import { GeoAIBackendClient } from "../../../lib/api-client";
import { proxyMarketGet } from "../../../lib/market-bff";
import {
  parseMarketCommodityLatestQuery,
  type MarketCommodityLatestResponse,
} from "../../../lib/market-contract";

type MarketPageCommodity = {
  id: string;
  name: string;
  location: string | null;
  marketplace: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  quantity: number | null;
  unit: string | null;
  priceDate: string | null;
  source: string | null;
};

type MarketPagePayload = {
  label: string;
  recordedAt: string;
  commodities: MarketPageCommodity[];
};

export async function GET(request: Request) {
  return proxyMarketGet(request, async (requestId): Promise<MarketPagePayload> => {
    const payload = await GeoAIBackendClient.getLatestMarketCommodities(
      parseMarketCommodityLatestQuery(new URL(request.url).searchParams),
      requestId,
      request.signal,
    );
    return marketPagePayload(payload);
  });
}

function marketPagePayload(payload: MarketCommodityLatestResponse): MarketPagePayload {
  return {
    label: payload.label,
    recordedAt: payload.source_date
      ? `${payload.source_date}T00:00:00.000Z`
      : payload.fetched_at,
    commodities: payload.commodities.map((commodity, index) => ({
      id: `market-${commodity.source_date}-${index}`,
      name: commodity.commodity_name_raw,
      location: commodity.region,
      marketplace: commodity.marketplace,
      minPrice: finiteNumber(commodity.price_min),
      maxPrice: finiteNumber(commodity.price_max),
      currency: commodity.currency,
      quantity: finiteNumber(commodity.quantity),
      unit: commodity.unit,
      priceDate: commodity.source_date,
      source: commodity.source,
    })),
  };
}

function finiteNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
