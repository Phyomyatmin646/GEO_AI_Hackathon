import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  MARKET_SOURCE_NAMES,
  MARKET_SOURCE_PRIORITY,
  mapCommodityToCropKeys,
  marketInputs,
  parseNumber,
  type MarketPriceAdapter,
} from '../src/adapters/market-prices/common.js';
import { parseCsoMarketPrices } from '../src/adapters/market-prices/cso.js';
import { parseDoaMarketPrices } from '../src/adapters/market-prices/doa.js';
import { parseMrfMarketPrices } from '../src/adapters/market-prices/mrf.js';
import { parseWisarraMarketPrices } from '../src/adapters/market-prices/wisarra.js';
import { CROP_KEYS, type CropKey } from '../src/contracts/weekly.js';
import type { MarketPrice, MarketPriceInput } from '../src/db/store.js';
import { MarketPriceService } from '../src/services/market-price-service.js';
import { MemoryStore } from './helpers.js';

const FETCHED_AT = '2026-08-09T00:00:00.000Z';

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

describe('market source parsers', () => {
  it('parses DOA prices in their original unit without filling a missing bound', async () => {
    const rows = parseDoaMarketPrices(
      await fixture('doa-market.html'),
      FETCHED_AT,
      'https://example.test/doa',
    );

    expect(rows.map((row) => row.crop_key).sort()).toEqual([
      'black_gram',
      'dry_season_rice',
      'monsoon_rice',
    ]);
    expect(rows.find((row) => row.crop_key === 'black_gram')).toMatchObject({
      price_min: null,
      price_max: 4500,
      currency: 'MMK',
      quantity: 1,
      unit: '1 ပိဿာ',
      source_date: '2026-08-08',
      marketplace: 'Bayintnaung Commodity Exchange',
    });
  });

  it('maps non-season-specific MRF rice rows to both rice crop keys', async () => {
    const rows = parseMrfMarketPrices(
      await fixture('mrf-market.html'),
      FETCHED_AT,
      'https://example.test/mrf',
    );

    const pawsan = rows.filter((row) => row.commodity_name_raw.includes('Shwebo Pawsan'));
    expect(pawsan).toHaveLength(2);
    expect(pawsan.map((row) => row.crop_key).sort()).toEqual([
      'dry_season_rice',
      'monsoon_rice',
    ]);
    expect(pawsan[0]).toMatchObject({
      price_min: 82000,
      price_max: 85000,
      quantity: 1,
      unit: 'Bag',
      source_date: '2026-08-08',
    });
    expect(pawsan[0]?.raw_payload).toMatchObject({ is_season_specific: false });

    const paddy = rows.find((row) => row.commodity_name_raw.includes('Ayeyar Min'));
    expect(paddy).toMatchObject({ price_min: 25000, price_max: null });
  });

  it('fails closed when MRF publishes only weekly PDF reports', async () => {
    const html = await fixture('mrf-pdf-listing.html');
    expect(() =>
      parseMrfMarketPrices(
        html,
        FETCHED_AT,
        'https://example.test/reference-domestic-price/',
      ),
    ).toThrow(
      'MRF latest report (2026-08-04) is PDF-only; no machine-readable HTML price table was published',
    );
  });

  it('does not infer an MRF report date from an invalid PDF period', () => {
    expect(() =>
      parseMrfMarketPrices(
        `
          <main>
            <a href="/reports/latest.pdf">
              Market Indicated Reference Domestic and FOB Rice Prices (2026 February 30 to March 8)
            </a>
          </main>
        `,
        FETCHED_AT,
        'https://example.test/reference-domestic-price/',
      ),
    ).toThrow('MRF page is PDF-only and its latest report period could not be validated');
  });

  it('selects the latest dated CSO column and preserves the stated retail unit', async () => {
    const rows = parseCsoMarketPrices(
      await fixture('cso-market.html'),
      FETCHED_AT,
      'https://example.test/cso',
    );

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.crop_key === 'black_gram')).toMatchObject({
      price_min: 3700,
      price_max: 3700,
      currency: 'MMK',
      unit: 'Viss',
      source_date: '2026-08-08',
      region: 'Yangon',
    });
    expect(rows.find((row) => row.crop_key === 'tomato')).toMatchObject({
      price_min: 2200,
      price_max: 2200,
    });
    expect(rows.find((row) => row.crop_key === 'maize')).toBeUndefined();
  });

  it('parses Wisarra columns strictly and does not turn a missing minimum into a maximum', async () => {
    const rows = parseWisarraMarketPrices(
      await fixture('wisarra-market.html'),
      FETCHED_AT,
      'https://example.test/wisarra',
    );

    expect(rows.map((row) => row.crop_key).sort()).toEqual([
      'dry_season_rice',
      'maize',
      'monsoon_rice',
    ]);
    expect(rows.find((row) => row.crop_key === 'maize')).toMatchObject({
      variety: 'Yellow',
      region: 'Shan',
      marketplace: 'Aungban',
      price_min: null,
      price_max: 650,
      currency: 'MMK',
      quantity: 1.5,
      unit: 'Viss',
      source_date: '2026-08-08',
    });
    expect(rows.every((row) => row.commodity_name_raw !== 'Groundnut Oil')).toBe(true);
  });

  it('uses explicit commodity mappings and never treats processed products as crop prices', () => {
    expect(mapCommodityToCropKeys('Rice')).toEqual(['monsoon_rice', 'dry_season_rice']);
    expect(mapCommodityToCropKeys('ပဲတီစိမ်း')).toEqual(['green_gram']);
    expect(mapCommodityToCropKeys('Groundnut Oil')).toEqual([]);
    expect(mapCommodityToCropKeys('Rice Flour')).toEqual([]);
    expect(mapCommodityToCropKeys('ဆီ မြေပဲဆီ')).toEqual([]);
    expect(mapCommodityToCropKeys('ဆီ နှမ်းဆီ')).toEqual([]);
    expect(mapCommodityToCropKeys('ဆန်မှုန့်')).toEqual([]);
    expect(mapCommodityToCropKeys('သရက်ဖျော်ရည်')).toEqual([]);
    expect(mapCommodityToCropKeys('ကြံသကာ')).toEqual([]);
    expect(mapCommodityToCropKeys('ဆီထွက် မြေပဲ(အဆန်)')).toEqual(['groundnut']);
    expect(mapCommodityToCropKeys('ဟင်းခတ်အမွှေးအကြိုင် ငရုတ်ကောင်း')).toEqual([]);
    expect(mapCommodityToCropKeys('ဟင်းခတ်အမွှေးအကြိုင် ငရုတ် ကောင်း')).toEqual([]);
    expect(mapCommodityToCropKeys('ဆီထွက် ပန်းနှမ်း')).toEqual([]);
    expect(mapCommodityToCropKeys('ဆီထွက် ပန်း နှမ်း')).toEqual([]);
    expect(mapCommodityToCropKeys('သစ်သီးဝလံ ဆန်းကစ်သီး')).toEqual([]);
    expect(mapCommodityToCropKeys('တညင်း')).toEqual([]);
    expect(mapCommodityToCropKeys('ဒညင်း')).toEqual([]);
    expect(mapCommodityToCropKeys('ဆန်(ရွှေဘိုပေါ်ဆန်း)')).toEqual([
      'monsoon_rice',
      'dry_season_rice',
    ]);
    expect(mapCommodityToCropKeys('ဆန်-ဧရာမင်း')).toEqual([
      'monsoon_rice',
      'dry_season_rice',
    ]);
    expect(mapCommodityToCropKeys('Green pea')).toEqual([]);
    expect(mapCommodityToCropKeys('Unknown Commodity')).toEqual([]);
  });

  it('rejects source dates more than one UTC day after collection', () => {
    const base = {
      commodityName: 'Maize',
      priceMin: 1_000,
      priceMax: 1_200,
      currency: 'MMK',
      quantity: 1,
      unit: 'Viss',
      rawPayload: {},
    };
    expect(
      marketInputs(
        { ...base, sourceDate: '2026-08-11' },
        MARKET_SOURCE_NAMES.wisarra,
        'https://example.test/wisarra',
        '2026-08-10T18:00:00.000Z',
      ),
    ).toHaveLength(1);
    expect(
      marketInputs(
        { ...base, sourceDate: '2026-08-12' },
        MARKET_SOURCE_NAMES.wisarra,
        'https://example.test/wisarra',
        '2026-08-10T18:00:00.000Z',
      ),
    ).toEqual([]);
  });

  it('parses source numbers without turning non-numeric placeholders into zero', () => {
    expect(parseNumber('၁,၂၃၄.၅')).toBe(1234.5);
    expect(parseNumber('MMK 2,500')).toBe(2500);
    expect(parseNumber('Ks. 2,500')).toBe(2500);
    expect(parseNumber('N/A')).toBeNull();
    expect(parseNumber('—')).toBeNull();
    expect(parseNumber('1-2')).toBeNull();
  });

  it.each<[string, CropKey]>([
    ['Monsoon Rice', 'monsoon_rice'],
    ['Dry Season Rice', 'dry_season_rice'],
    ['Black Gram', 'black_gram'],
    ['Groundnut', 'groundnut'],
    ['Maize', 'maize'],
    ['Sugarcane', 'sugarcane'],
    ['Cassava', 'cassava'],
    ['Chili', 'chili'],
    ['Tomato', 'tomato'],
    ['Mung Bean', 'green_gram'],
    ['Pigeon Pea', 'pigeon_pea'],
    ['Sesame', 'sesame'],
    ['Rubber', 'rubber'],
    ['Durian', 'durian'],
    ['Mangosteen', 'mangosteen'],
    ['Longan', 'longan'],
    ['Mango', 'mango'],
  ])('maps the configured model commodity %s to %s', (commodity, crop) => {
    expect(mapCommodityToCropKeys(commodity)).toEqual([crop]);
  });

  it.each<[string, CropKey]>([
    ['မိုးစပါး', 'monsoon_rice'],
    ['နွေစပါး', 'dry_season_rice'],
    ['မတ်ပဲ', 'black_gram'],
    ['မြေပဲ', 'groundnut'],
    ['ပြောင်း', 'maize'],
    ['ကြံ', 'sugarcane'],
    ['ပီလောပီနံ', 'cassava'],
    ['ငရုတ်', 'chili'],
    ['ခရမ်းချဉ်', 'tomato'],
    ['ပဲတီစိမ်း', 'green_gram'],
    ['ပဲစဉ်းငုံ', 'pigeon_pea'],
    ['နှမ်း', 'sesame'],
    ['ရော်ဘာ', 'rubber'],
    ['ဒူးရင်း', 'durian'],
    ['မင်းကွတ်', 'mangosteen'],
    ['လောင်ဂန်', 'longan'],
    ['သရက်', 'mango'],
  ])('maps the requested Myanmar model label %s to %s', (commodity, crop) => {
    expect(mapCommodityToCropKeys(commodity)).toEqual([crop]);
  });
});

describe('MarketPriceService', () => {
  function storedPrice(
    crop: CropKey,
    sourceName: string,
    sourceDate: string,
    overrides: Partial<MarketPrice> = {},
  ): MarketPrice {
    return {
      id: `${crop}-${sourceName}-${sourceDate}`,
      crop_key: crop,
      commodity_name_raw: crop,
      variety: null,
      region: 'Yangon',
      marketplace: 'Test market',
      price_min: '1000',
      price_max: '1200',
      currency: 'MMK',
      quantity: '1',
      unit: 'Viss',
      source_name: sourceName,
      source_date: sourceDate,
      source_url: 'https://example.test/source',
      fetched_at: `${sourceDate}T01:00:00.000Z`,
      raw_payload: {},
      created_at: `${sourceDate}T01:00:00.000Z`,
      ...overrides,
    };
  }

  it('prefers current data over a higher-priority stale source without fabricating data', async () => {
    const store = new MemoryStore();
    store.marketPrices.push(
      storedPrice('maize', MARKET_SOURCE_NAMES.wisarra, '2026-08-08'),
      storedPrice('maize', MARKET_SOURCE_NAMES.doa, '2026-08-01', {
        price_min: null,
        unit: 'Basket',
      }),
    );
    const service = new MarketPriceService(
      store,
      [],
      1_000,
      () => new Date('2026-08-09T00:00:00.000Z'),
    );

    const response = await service.latest();

    expect(response.prices).toHaveLength(CROP_KEYS.length);
    expect(response.prices.find((price) => price.crop === 'maize')).toMatchObject({
      status: 'available',
      source: MARKET_SOURCE_NAMES.wisarra,
      price_min: '1000',
      price_max: '1200',
      quantity: '1',
      unit: 'Viss',
      is_stale: false,
    });
    expect(response.prices.find((price) => price.crop === 'durian')).toEqual({
      crop: 'durian',
      status: 'no_current_data',
    });
  });

  it('uses source priority within the current window and recency when every source is stale', async () => {
    const currentStore = new MemoryStore();
    currentStore.marketPrices.push(
      storedPrice('maize', MARKET_SOURCE_NAMES.wisarra, '2026-08-08'),
      storedPrice('maize', MARKET_SOURCE_NAMES.doa, '2026-08-03'),
    );
    const currentService = new MarketPriceService(
      currentStore,
      [],
      1_000,
      () => new Date('2026-08-09T00:00:00.000Z'),
    );
    expect((await currentService.latest({ crop: 'maize' })).prices[0]).toMatchObject({
      source: MARKET_SOURCE_NAMES.doa,
      is_stale: false,
    });

    const staleStore = new MemoryStore();
    staleStore.marketPrices.push(
      storedPrice('maize', MARKET_SOURCE_NAMES.wisarra, '2026-08-01'),
      storedPrice('maize', MARKET_SOURCE_NAMES.doa, '2026-07-01'),
    );
    const staleService = new MarketPriceService(
      staleStore,
      [],
      1_000,
      () => new Date('2026-08-20T00:00:00.000Z'),
    );
    expect((await staleService.latest({ crop: 'maize' })).prices[0]).toMatchObject({
      source: MARKET_SOURCE_NAMES.wisarra,
      is_stale: true,
    });
  });

  it('commits successful sources independently and returns a safe partial status', async () => {
    const store = new MemoryStore();
    const successInput: MarketPriceInput = {
      crop_key: 'maize',
      commodity_name_raw: 'Maize',
      variety: null,
      region: 'Shan',
      marketplace: 'Aungban',
      price_min: null,
      price_max: 650,
      currency: 'MMK',
      quantity: 1.5,
      unit: 'Viss',
      source_name: MARKET_SOURCE_NAMES.wisarra,
      source_date: '2026-08-08',
      source_url: 'https://example.test/wisarra',
      fetched_at: FETCHED_AT,
      raw_payload: {},
    };
    const successful: MarketPriceAdapter = {
      name: MARKET_SOURCE_NAMES.wisarra,
      priority: MARKET_SOURCE_PRIORITY[MARKET_SOURCE_NAMES.wisarra],
      sourceUrl: 'https://example.test/wisarra',
      async fetchLatest() {
        return [successInput];
      },
    };
    const failed: MarketPriceAdapter = {
      name: MARKET_SOURCE_NAMES.doa,
      priority: MARKET_SOURCE_PRIORITY[MARKET_SOURCE_NAMES.doa],
      sourceUrl: 'https://example.test/doa',
      async fetchLatest() {
        throw new Error('private source parsing detail');
      },
    };
    const service = new MarketPriceService(
      store,
      [successful, failed],
      1_000,
      () => new Date('2026-08-09T00:00:00.000Z'),
    );

    await expect(service.refresh()).resolves.toEqual({
      status: 'partially_succeeded',
      inserted: 1,
      coverage: {
        total_crops: CROP_KEYS.length,
        current_crops: ['maize'],
        stale_crops: [],
        missing_crops: CROP_KEYS.filter((crop) => crop !== 'maize'),
      },
      sources: [
        { source: MARKET_SOURCE_NAMES.wisarra, status: 'succeeded', parsed: 1, inserted: 1 },
        {
          source: MARKET_SOURCE_NAMES.doa,
          status: 'failed',
          parsed: 0,
          inserted: 0,
          error: 'SOURCE_UNAVAILABLE',
        },
      ],
    });
    expect(store.marketPrices).toHaveLength(1);
  });

  it('replaces one source/date snapshot so same-day corrections and removals stay truthful', async () => {
    const store = new MemoryStore();
    const base: MarketPriceInput = {
      crop_key: null,
      commodity_name_raw: 'Onion',
      variety: null,
      region: 'Mandalay',
      marketplace: 'Zay Cho',
      price_min: 1_800,
      price_max: 2_000,
      currency: 'MMK',
      quantity: 1,
      unit: 'Viss',
      source_name: MARKET_SOURCE_NAMES.wisarra,
      source_date: '2026-08-08',
      source_url: 'https://example.test/wisarra',
      fetched_at: '2026-08-08T01:00:00.000Z',
      raw_payload: {},
    };
    await store.upsertMarketPrices([
      base,
      {
        ...base,
        crop_key: 'maize',
        commodity_name_raw: 'Maize',
      },
    ]);

    await store.upsertMarketPrices([
      {
        ...base,
        price_min: 2_100,
        price_max: 2_300,
        fetched_at: '2026-08-08T02:00:00.000Z',
      },
    ]);

    expect(store.marketPrices).toHaveLength(1);
    expect(store.marketPrices[0]).toMatchObject({
      commodity_name_raw: 'Onion',
      price_min: '2100',
      price_max: '2300',
      fetched_at: '2026-08-08T02:00:00.000Z',
    });
    await expect(
      store.upsertMarketPrices([
        base,
        { ...base, source_date: '2026-08-09' },
      ]),
    ).rejects.toThrow('one complete source/date snapshot');
  });

  it('selects the latest row per crop and source before applying the global response limit', async () => {
    const store = new MemoryStore();
    for (let index = 0; index < 2_100; index += 1) {
      store.marketPrices.push(
        storedPrice('maize', MARKET_SOURCE_NAMES.wisarra, '2026-08-08', {
          id: `maize-${String(index).padStart(4, '0')}`,
        }),
      );
    }
    store.marketPrices.push(storedPrice('durian', MARKET_SOURCE_NAMES.wisarra, '2026-08-07'));
    const service = new MarketPriceService(
      store,
      [],
      1_000,
      () => new Date('2026-08-09T00:00:00.000Z'),
    );

    const response = await service.latest();

    expect(response.prices.find((price) => price.crop === 'durian')).toMatchObject({
      crop: 'durian',
      status: 'available',
      source_date: '2026-08-07',
    });
  });
});
