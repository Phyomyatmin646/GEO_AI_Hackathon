import { describe, expect, it, vi } from 'vitest';

import { MARKET_SOURCE_NAMES } from '../src/adapters/market-prices/common.js';
import { buildApp } from '../src/app.js';
import type { CropKey } from '../src/contracts/weekly.js';
import type { MarketPrice } from '../src/db/store.js';
import { MarketPriceService } from '../src/services/market-price-service.js';
import { MemoryStore, testConfig } from './helpers.js';

const NOW = '2026-08-09T00:00:00.000Z';

function storedPrice(
  commodity: string,
  cropKey: CropKey | null,
  overrides: Partial<MarketPrice> = {},
): MarketPrice {
  return {
    id: `${commodity}-${cropKey ?? 'unmapped'}-${overrides.source_date ?? '2026-08-08'}`,
    crop_key: cropKey,
    commodity_name_raw: commodity,
    variety: null,
    region: 'Yangon',
    marketplace: 'Bayintnaung',
    price_min: '1000.000000',
    price_max: '1200.000000',
    currency: 'MMK',
    quantity: '1.000000',
    unit: 'Viss',
    source_name: MARKET_SOURCE_NAMES.wisarra,
    source_date: '2026-08-08',
    source_url: 'https://wisarra.com/en/market-price',
    fetched_at: '2026-08-08T12:00:00.000Z',
    raw_payload: {
      model_crop_keys: cropKey ? [cropKey] : [],
      is_model_crop: cropKey !== null,
    },
    created_at: '2026-08-08T12:00:01.000Z',
    ...overrides,
  };
}

describe('raw market commodity API', () => {
  it('preserves explicit seasonal metadata in the canonical rice response', async () => {
    const store = new MemoryStore();
    store.marketPrices.push(
      storedPrice('Rice (Rainy)', 'monsoon_rice', {
        raw_payload: {
          model_crop_keys: ['monsoon_rice'],
          is_season_specific: true,
        },
      }),
    );
    const service = new MarketPriceService(store, [], 1_000, () => new Date(NOW));

    const response = await service.latest({ crop: 'monsoon_rice' });

    expect(response.prices).toEqual([
      expect.objectContaining({ crop: 'monsoon_rice', is_season_specific: true }),
    ]);
  });

  it('groups seasonal Rice storage rows and preserves unmapped Wisarra observations', async () => {
    const store = new MemoryStore();
    store.marketPrices.push(
      storedPrice('Rice', 'monsoon_rice', {
        raw_payload: { model_crop_keys: ['monsoon_rice', 'dry_season_rice'] },
      }),
      storedPrice('Rice', 'dry_season_rice', {
        raw_payload: { model_crop_keys: ['monsoon_rice', 'dry_season_rice'] },
      }),
      storedPrice('Onion', null),
      storedPrice('Avocado', null, {
        source_date: '2026-08-01',
        fetched_at: '2026-08-01T12:00:00.000Z',
      }),
    );
    const service = new MarketPriceService(store, [], 1_000, () => new Date(NOW));

    const response = await service.commoditiesLatest({
      source: MARKET_SOURCE_NAMES.wisarra,
      limit: 100,
      offset: 0,
    });

    expect(response.source_date).toBe('2026-08-08');
    expect(response.commodities).toHaveLength(2);
    expect(response.commodities.map((row) => row.commodity_name_raw)).toEqual(['Onion', 'Rice']);
    expect(response.commodities.find((row) => row.commodity_name_raw === 'Onion')).toMatchObject({
      price_min: '1000.000000',
      price_max: '1200.000000',
      quantity: '1.000000',
      model_crop_keys: [],
      is_model_crop: false,
      source: MARKET_SOURCE_NAMES.wisarra,
      source_url: 'https://wisarra.com/en/market-price',
      fetched_at: '2026-08-08T12:00:00.000Z',
    });
    expect(response.commodities.find((row) => row.commodity_name_raw === 'Rice')).toMatchObject({
      model_crop_keys: ['monsoon_rice', 'dry_season_rice'],
      is_model_crop: true,
    });
    expect(response.pagination).toEqual({
      limit: 100,
      offset: 0,
      returned: 2,
      total: 2,
      has_more: false,
      next_offset: null,
    });
  });

  it('groups the complete newest snapshot before applying offset and limit', async () => {
    const store = new MemoryStore();
    store.marketPrices.push(
      storedPrice('Onion', null),
      storedPrice('Rice', 'monsoon_rice', {
        raw_payload: { model_crop_keys: ['monsoon_rice', 'dry_season_rice'] },
      }),
      storedPrice('Rice', 'dry_season_rice', {
        raw_payload: { model_crop_keys: ['monsoon_rice', 'dry_season_rice'] },
      }),
      storedPrice('Tomato', 'tomato'),
      storedPrice('Chick Pea', null, {
        source_date: '2026-08-01',
        fetched_at: '2026-08-01T12:00:00.000Z',
      }),
    );
    const list = vi.spyOn(store, 'listMarketCommodityPrices');
    const service = new MarketPriceService(store, [], 1_000, () => new Date(NOW));

    const response = await service.commoditiesLatest({ limit: 1, offset: 1 });

    expect(list).toHaveBeenCalledWith({
      source: MARKET_SOURCE_NAMES.wisarra,
      region: undefined,
      limit: 20_001,
      offset: 0,
    });
    expect(response.commodities).toHaveLength(1);
    expect(response.commodities[0]).toMatchObject({
      commodity_name_raw: 'Rice',
      model_crop_keys: ['monsoon_rice', 'dry_season_rice'],
    });
    expect(response.pagination).toEqual({
      limit: 1,
      offset: 1,
      returned: 1,
      total: 3,
      has_more: true,
      next_offset: 2,
    });
  });

  it('registers the static route, defaults to Wisarra, and validates query keys strictly', async () => {
    const store = new MemoryStore();
    store.marketPrices.push(
      storedPrice('Onion', null),
      storedPrice('Maize', 'maize', {
        source_name: MARKET_SOURCE_NAMES.doa,
        source_date: '2026-08-09',
        source_url: 'https://example.test/doa',
        fetched_at: '2026-08-09T01:00:00.000Z',
      }),
    );
    const service = new MarketPriceService(store, [], 1_000, () => new Date(NOW));
    const app = await buildApp({
      config: testConfig(),
      marketPriceService: service,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/market-prices/commodities/latest?limit=1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      source: MARKET_SOURCE_NAMES.wisarra,
      source_date: '2026-08-08',
      commodities: [{ commodity_name_raw: 'Onion', is_model_crop: false }],
    });

    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v1/market-prices/commodities/latest?unknown=true',
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    await app.close();
  });
});
