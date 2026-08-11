import type { MarketPriceAdapter } from '../adapters/market-prices/common.js';
import {
  MARKET_SOURCE_NAMES,
  MARKET_SOURCE_PRIORITY,
} from '../adapters/market-prices/common.js';
import { CROP_KEYS, type CropKey } from '../contracts/weekly.js';
import type {
  AppStore,
  MarketCommodityPriceFilters,
  MarketPrice,
  MarketPriceFilters,
} from '../db/store.js';
import { AppError } from '../errors.js';

export type MarketRefreshResult = {
  status: 'succeeded' | 'partially_succeeded';
  inserted: number;
  coverage: {
    total_crops: number;
    current_crops: CropKey[];
    stale_crops: CropKey[];
    missing_crops: CropKey[];
  };
  sources: Array<{
    source: string;
    status: 'succeeded' | 'failed';
    parsed: number;
    inserted: number;
    error?: string;
  }>;
};

type MarketCommodityQuery = MarketCommodityPriceFilters;

type MarketCommodity = {
  commodity_name_raw: string;
  variety: string | null;
  region: string | null;
  marketplace: string | null;
  price_min: string | null;
  price_max: string | null;
  currency: string;
  quantity: string;
  unit: string;
  source: string;
  source_date: string;
  source_url: string;
  fetched_at: string;
  model_crop_keys: CropKey[];
  is_model_crop: boolean;
};

// A bounded Wisarra snapshot has at most 10,000 source observations. Generic
// rice is deliberately stored under two canonical season keys, so the raw
// storage scan must allow twice that number before grouping observations.
const MAX_STORAGE_ROWS_PER_SOURCE_SNAPSHOT = 20_000;

export class MarketPriceService {
  constructor(
    private readonly store: AppStore,
    private readonly adapters: readonly MarketPriceAdapter[],
    private readonly requestTimeoutMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async refresh(): Promise<MarketRefreshResult> {
    const settled = await Promise.allSettled(
      this.adapters.map(async (adapter) => {
        const prices = await adapter.fetchLatest(AbortSignal.timeout(this.requestTimeoutMs));
        const inserted = await this.store.upsertMarketPrices(prices);
        return { adapter, parsed: prices.length, inserted };
      }),
    );
    const sources = settled.map((result, index) => {
      const adapter = this.adapters[index];
      if (!adapter) throw new Error('Market adapter result alignment failed.');
      return result.status === 'fulfilled'
        ? {
            source: adapter.name,
            status: 'succeeded' as const,
            parsed: result.value.parsed,
            inserted: result.value.inserted,
          }
        : {
            source: adapter.name,
            status: 'failed' as const,
            parsed: 0,
            inserted: 0,
            error: safeAdapterError(result.reason),
          };
    });
    const successes = sources.filter((source) => source.status === 'succeeded');
    if (successes.length === 0) {
      throw new AppError(
        503,
        'MARKET_PRICE_SOURCES_UNAVAILABLE',
        'No market-price source could be refreshed.',
      );
    }
    const coverage = await this.canonicalCoverage();
    return {
      status: successes.length === sources.length ? 'succeeded' : 'partially_succeeded',
      inserted: successes.reduce((total, source) => total + source.inserted, 0),
      coverage,
      sources,
    };
  }

  async latest(filters: MarketPriceFilters = {}) {
    const rows = await this.store.listMarketPrices({ ...filters, limit: 2_000, offset: 0 });
    const crops: readonly CropKey[] = filters.crop ? [filters.crop] : CROP_KEYS;
    return {
      label: 'Latest available market price',
      fetched_at: this.now().toISOString(),
      prices: crops.map((crop) => this.latestForCrop(crop, rows.filter((row) => row.crop_key === crop))),
    };
  }

  async history(crop: CropKey, limit: number, offset: number) {
    const prices = await this.store.listMarketPriceHistory(crop, limit, offset);
    return { crop, prices, pagination: { limit, offset } };
  }

  async commoditiesLatest(filters: MarketCommodityQuery) {
    const source = filters.source ?? MARKET_SOURCE_NAMES.wisarra;
    const rows = await this.store.listMarketCommodityPrices({
      source,
      region: filters.region,
      limit: MAX_STORAGE_ROWS_PER_SOURCE_SNAPSHOT + 1,
      offset: 0,
    });
    const newestSourceDate = rows[0]?.source_date ?? null;
    const snapshotRows = newestSourceDate
      ? rows.filter((row) => row.source_date === newestSourceDate)
      : [];
    if (snapshotRows.length > MAX_STORAGE_ROWS_PER_SOURCE_SNAPSHOT) {
      throw new AppError(
        503,
        'MARKET_PRICE_SNAPSHOT_TOO_LARGE',
        'The latest market-price snapshot is too large to serve safely.',
      );
    }
    const grouped = groupMarketCommodities(snapshotRows);
    const page = grouped.slice(filters.offset, filters.offset + filters.limit);
    const hasMore = grouped.length > filters.offset + page.length;

    return {
      label: 'Latest available market commodity prices',
      fetched_at: this.now().toISOString(),
      source,
      source_date: newestSourceDate,
      commodities: page,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        returned: page.length,
        total: grouped.length,
        has_more: hasMore,
        next_offset: hasMore ? filters.offset + page.length : null,
      },
    };
  }

  private latestForCrop(crop: CropKey, rows: MarketPrice[]) {
    const selected = [...rows].sort((left, right) => {
      const leftStale = this.isStale(left);
      const rightStale = this.isStale(right);
      if (leftStale !== rightStale) return leftStale ? 1 : -1;
      if (leftStale && rightStale) {
        const dateDifference = right.source_date.localeCompare(left.source_date);
        if (dateDifference !== 0) return dateDifference;
      }
      const priorityDifference = sourcePriority(left.source_name) - sourcePriority(right.source_name);
      if (priorityDifference !== 0) return priorityDifference;
      const dateDifference = right.source_date.localeCompare(left.source_date);
      if (dateDifference !== 0) return dateDifference;
      return right.fetched_at.localeCompare(left.fetched_at);
    })[0];
    if (!selected) return { crop, status: 'no_current_data' as const };
    return {
      crop,
      status: 'available' as const,
      source: selected.source_name,
      commodity_name_raw: selected.commodity_name_raw,
      variety: selected.variety,
      region: selected.region,
      marketplace: selected.marketplace,
      price_min: selected.price_min,
      price_max: selected.price_max,
      currency: selected.currency,
      quantity: selected.quantity,
      unit: selected.unit,
      source_date: selected.source_date,
      source_url: selected.source_url,
      fetched_at: selected.fetched_at,
      is_stale: this.isStale(selected),
      is_season_specific:
        crop === 'monsoon_rice' || crop === 'dry_season_rice'
          ? rawSeasonSpecific(selected.raw_payload) ?? false
          : null,
    };
  }

  private async canonicalCoverage(): Promise<MarketRefreshResult['coverage']> {
    const rows = await this.store.listMarketPrices({ limit: 2_000, offset: 0 });
    const currentCrops: CropKey[] = [];
    const staleCrops: CropKey[] = [];
    const missingCrops: CropKey[] = [];
    for (const crop of CROP_KEYS) {
      const cropRows = rows.filter((row) => row.crop_key === crop);
      if (cropRows.length === 0) {
        missingCrops.push(crop);
        continue;
      }
      const hasCurrentRow = cropRows.some((row) => !this.isStale(row));
      if (hasCurrentRow) currentCrops.push(crop);
      else staleCrops.push(crop);
    }
    return {
      total_crops: CROP_KEYS.length,
      current_crops: currentCrops,
      stale_crops: staleCrops,
      missing_crops: missingCrops,
    };
  }

  private isStale(row: MarketPrice): boolean {
    const ageDays = Math.floor(
      (this.now().getTime() - new Date(`${row.source_date}T00:00:00.000Z`).getTime()) /
        (24 * 60 * 60_000),
    );
    return ageDays < -1 || ageDays > 7;
  }
}

function groupMarketCommodities(rows: readonly MarketPrice[]): MarketCommodity[] {
  const grouped = new Map<string, { commodity: MarketCommodity; cropKeys: Set<CropKey> }>();
  for (const row of rows) {
    const identity = observationIdentity(row);
    const existing = grouped.get(identity);
    if (existing) {
      if (row.crop_key) existing.cropKeys.add(row.crop_key);
      addRawPayloadCropKeys(existing.cropKeys, row.raw_payload);
      continue;
    }
    const cropKeys = new Set<CropKey>();
    if (row.crop_key) cropKeys.add(row.crop_key);
    addRawPayloadCropKeys(cropKeys, row.raw_payload);
    grouped.set(identity, {
      cropKeys,
      commodity: {
        commodity_name_raw: row.commodity_name_raw,
        variety: row.variety ?? null,
        region: row.region ?? null,
        marketplace: row.marketplace ?? null,
        price_min: row.price_min,
        price_max: row.price_max,
        currency: row.currency,
        quantity: row.quantity,
        unit: row.unit,
        source: row.source_name,
        source_date: row.source_date,
        source_url: row.source_url,
        fetched_at: row.fetched_at,
        model_crop_keys: [],
        is_model_crop: false,
      },
    });
  }

  return [...grouped.values()]
    .map(({ commodity, cropKeys }) => {
      const modelCropKeys = CROP_KEYS.filter((crop) => cropKeys.has(crop));
      return {
        ...commodity,
        model_crop_keys: modelCropKeys,
        is_model_crop: modelCropKeys.length > 0,
      };
    })
    .sort(compareMarketCommodities);
}

function compareMarketCommodities(left: MarketCommodity, right: MarketCommodity): number {
  return (
    right.source_date.localeCompare(left.source_date) ||
    right.fetched_at.localeCompare(left.fetched_at) ||
    marketCommodityOrderKey(left).localeCompare(marketCommodityOrderKey(right))
  );
}

function marketCommodityOrderKey(commodity: MarketCommodity): string {
  return JSON.stringify([
    commodity.commodity_name_raw,
    commodity.variety,
    commodity.region,
    commodity.marketplace,
    commodity.price_min,
    commodity.price_max,
    commodity.currency,
    commodity.quantity,
    commodity.unit,
    commodity.source,
    commodity.source_url,
    commodity.model_crop_keys,
  ]);
}

function observationIdentity(row: MarketPrice): string {
  return JSON.stringify([
    row.commodity_name_raw,
    row.variety ?? null,
    row.region ?? null,
    row.marketplace ?? null,
    row.price_min,
    row.price_max,
    row.currency,
    row.quantity,
    row.unit,
    row.source_name,
    row.source_date,
    row.source_url,
    row.fetched_at,
  ]);
}

function addRawPayloadCropKeys(target: Set<CropKey>, rawPayload: unknown): void {
  if (!isRecord(rawPayload) || !Array.isArray(rawPayload.model_crop_keys)) return;
  for (const crop of rawPayload.model_crop_keys) {
    if (typeof crop === 'string' && (CROP_KEYS as readonly string[]).includes(crop)) {
      target.add(crop as CropKey);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rawSeasonSpecific(rawPayload: unknown): boolean | undefined {
  if (!isRecord(rawPayload)) return undefined;
  return typeof rawPayload.is_season_specific === 'boolean'
    ? rawPayload.is_season_specific
    : undefined;
}

function sourcePriority(source: string): number {
  return MARKET_SOURCE_PRIORITY[source] ?? Number.MAX_SAFE_INTEGER;
}

function safeAdapterError(reason: unknown): string {
  if (reason instanceof Error && reason.name === 'TimeoutError') return 'SOURCE_TIMEOUT';
  return 'SOURCE_UNAVAILABLE';
}
