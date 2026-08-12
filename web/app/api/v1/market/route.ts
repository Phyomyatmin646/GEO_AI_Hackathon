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
    const parsedQuery = parseMarketCommodityLatestQuery(new URL(request.url).searchParams);
    const payload = await GeoAIBackendClient.getLatestMarketCommodities(
      { ...parsedQuery, limit: parsedQuery.limit ?? 500 },
      requestId,
      request.signal,
    );
    return marketPagePayload(payload);
  });
}

function marketPagePayload(payload: MarketCommodityLatestResponse): MarketPagePayload {
  const sourceDate = normalizedSourceDate(payload.source_date);
  return {
    label: payload.label,
    recordedAt: sourceDate ? `${sourceDate}T00:00:00.000Z` : payload.fetched_at,
    commodities: payload.commodities.map((commodity, index) => {
      const priceDate = normalizedSourceDate(commodity.source_date) ?? commodity.source_date;
      return {
        id: `market-${priceDate}-${index}`,
        name: commodity.commodity_name_raw,
        location: commodity.region,
        marketplace: commodity.marketplace,
        minPrice: finiteNumber(commodity.price_min),
        maxPrice: finiteNumber(commodity.price_max),
        currency: commodity.currency,
        quantity: finiteNumber(commodity.quantity),
        unit: commodity.unit,
        priceDate,
        source: commodity.source,
      };
    }),
  };
}

function normalizedSourceDate(value: string | null): string | null {
  if (value === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function finiteNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
