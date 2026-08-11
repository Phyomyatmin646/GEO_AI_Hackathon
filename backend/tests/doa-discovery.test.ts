import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DoaMarketPriceAdapter,
  discoverDoaMarketPages,
  parseDoaMarketPrices,
} from '../src/adapters/market-prices/doa.js';

const SOURCE_URL =
  'https://example.test/market?filter_category=44&filter_seller=4&route=market%2Fweekly_crop_price_by_seller';
const FETCHED_AT = '2026-08-11T00:00:00.000Z';
const SOURCE_DATE = '2026-08-04';
const CATEGORIES = [
  ['44', 'စပါး'],
  ['62', 'အခြားနှံစားသီးနှံ'],
  ['16', 'ပဲမျိုးစုံ'],
  ['63', 'ဆီထွက်'],
  ['64', 'စက်မှုကုန်ကြမ်းသီးနှံ'],
  ['1', 'ဆန်'],
  ['3', 'စားဖိုဆောင်သီးနှံ'],
  ['2', 'ဆီ'],
  ['65', 'ဟင်းခတ်အမွှေးအကြိုင်'],
  ['6', 'ဟင်းသီးဟင်းရွက်'],
  ['66', 'အခြားစားသုံး'],
  ['67', 'အခြားမစားသုံး'],
  ['13', 'သစ်သီးဝလံ'],
] as const;
const COVERAGE_SELLERS = [
  ['4', 'အာဟာရသုခဈေးကုန်စည်ဒိုင်'],
  ['7', 'ပြင်ဦးလွင်ကုန်စည်ဒိုင်'],
  ['8', 'ဘုရင့်နောင်ကုန်စည်ဒိုင်'],
  ['27', 'အောင်ပန်းကုန်စည်ဒိုင်'],
  ['23', 'တပ်ကုန်းကုန်စည်ဒိုင်'],
  ['5', 'သန်လျင်မြို့မဈေးကုန်စည်ဒိုင်'],
] as const;
const MATRIX_MARKETPLACES = ['Market A', 'Market B'] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DOA filter discovery', () => {
  it('discovers six bounded all-category seller pages and pins the source date', () => {
    const discovery = discoverDoaMarketPages(discoveryPage(), SOURCE_URL);

    expect(discovery.sourceDate).toBe(SOURCE_DATE);
    expect(discovery.categoryLabels).toEqual(CATEGORIES.map(([, label]) => label));
    expect(discovery.sellerPages.map((page) => page.marketplace)).toEqual(
      COVERAGE_SELLERS.map(([, label]) => label),
    );
    expect(
      discovery.sellerPages.map((page) => {
        const url = new URL(page.url);
        expect(url.origin + url.pathname).toBe('https://example.test/market');
        expect(url.searchParams.has('filter_category')).toBe(false);
        expect(url.searchParams.get('filter_date_start')).toBe(SOURCE_DATE);
        expect(url.searchParams.get('route')).toBe('market/weekly_crop_price_by_seller');
        return url.searchParams.get('filter_seller');
      }),
    ).toEqual(['4', '7', '8', '27', '23', '5']);
  });

  it('fails closed when the category inventory or a coverage seller changes', () => {
    const withoutFruit = discoveryPage(CATEGORIES.filter(([value]) => value !== '13'));
    expect(() => discoverDoaMarketPages(withoutFruit, SOURCE_URL)).toThrow(
      'DOA category filter inventory changed',
    );

    const renamedSeller = discoveryPage(
      CATEGORIES,
      COVERAGE_SELLERS.map(([value, label]) =>
        value === '27' ? ([value, 'Renamed exchange'] as const) : ([value, label] as const),
      ),
    );
    expect(() => discoverDoaMarketPages(renamedSeller, SOURCE_URL)).toThrow(
      'DOA coverage seller filter was not found: အောင်ပန်းကုန်စည်ဒိုင်',
    );
  });
});

describe('DOA price-table parser', () => {
  it('emits one observation per populated marketplace and rejects lookalikes and products', () => {
    const rows = parseDoaMarketPrices(
      matrixPage(
        [
          {
            category: 'ဆီထွက်',
            name: 'မြေပဲ(အဆန်)',
            prices: [
              ['', '1000'],
              ['1200', '1400'],
            ],
          },
          {
            category: 'ဆီထွက်',
            name: 'ပန်း နှမ်း',
            prices: [
              ['900', '1000'],
              ['', ''],
            ],
          },
          {
            category: 'ဆီ',
            name: 'မြေပဲဆီ',
            prices: [
              ['5000', '5500'],
              ['', ''],
            ],
          },
          {
            category: 'ဟင်းခတ်အမွှေးအကြိုင်',
            name: 'ငရုတ် ကောင်း',
            prices: [
              ['6000', '6500'],
              ['', ''],
            ],
          },
        ],
        SOURCE_DATE,
        MATRIX_MARKETPLACES,
      ),
      FETCHED_AT,
      'https://example.test/market?filter_seller=8',
      MATRIX_MARKETPLACES,
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.crop_key)).toEqual(['groundnut', 'groundnut']);
    expect(rows[0]).toMatchObject({
      marketplace: 'Market A',
      price_min: null,
      price_max: 1000,
      source_date: SOURCE_DATE,
      raw_payload: { is_season_specific: null, source_row: { marketplace_index: 0 } },
    });
    expect(rows[1]).toMatchObject({
      marketplace: 'Market B',
      price_min: 1200,
      price_max: 1400,
      raw_payload: { source_row: { marketplace_index: 1 } },
    });
  });

  it('fails on marketplace, category-inventory, and empty-table drift', () => {
    const oneRow = matrixPage(
      [
        {
          category: 'စပါး',
          name: 'ဧရာမင်း',
          prices: [
            ['100', '120'],
            ['', ''],
          ],
        },
      ],
      SOURCE_DATE,
      MATRIX_MARKETPLACES,
    );
    expect(() =>
      parseDoaMarketPrices(
        oneRow,
        FETCHED_AT,
        'https://example.test/market?filter_seller=8',
        ['Market A', 'Renamed Market'],
      ),
    ).toThrow('DOA marketplace columns did not match the discovered seller filters');
    expect(() =>
      parseDoaMarketPrices(
        oneRow,
        FETCHED_AT,
        'https://example.test/market?filter_seller=8',
        MATRIX_MARKETPLACES,
        CATEGORIES.map(([, label]) => label),
      ),
    ).toThrow('DOA seller page categories did not match the discovered category filters');
    expect(() =>
      parseDoaMarketPrices(
        matrixPage([], SOURCE_DATE, MATRIX_MARKETPLACES),
        FETCHED_AT,
        'https://example.test/market?filter_seller=8',
      ),
    ).toThrow('DOA price table contained no commodity rows');
  });
});

describe('DOA bounded seller fetch', () => {
  it('aggregates six all-category seller pages with at most three concurrent requests', async () => {
    let activeSellerFetches = 0;
    let maximumConcurrency = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.has('filter_category')) return htmlResponse(discoveryPage());

      activeSellerFetches += 1;
      maximumConcurrency = Math.max(maximumConcurrency, activeSellerFetches);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeSellerFetches -= 1;
      const seller = url.searchParams.get('filter_seller') ?? '';
      return htmlResponse(sellerPage(seller));
    });

    const rows = await new DoaMarketPriceAdapter(SOURCE_URL).fetchLatest(
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(maximumConcurrency).toBe(3);
    expect(
      fetchMock.mock.calls.slice(1).map(([input]) => {
        const url = new URL(String(input));
        expect(url.searchParams.has('filter_category')).toBe(false);
        expect(url.searchParams.get('filter_date_start')).toBe(SOURCE_DATE);
        return url.searchParams.get('filter_seller');
      }),
    ).toEqual(['4', '7', '8', '27', '23', '5']);
    expect(new Set(rows.map((row) => row.crop_key))).toEqual(
      new Set([
        'monsoon_rice',
        'dry_season_rice',
        'maize',
        'black_gram',
        'groundnut',
        'sugarcane',
        'tomato',
        'mango',
        'green_gram',
        'chili',
        'pigeon_pea',
        'sesame',
        'rubber',
      ]),
    );
  });

  it('rejects seller pages from a different source date', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.has('filter_category')) return htmlResponse(discoveryPage());
      const seller = url.searchParams.get('filter_seller') ?? '';
      return htmlResponse(sellerPage(seller, seller === '27' ? '2026-08-05' : SOURCE_DATE));
    });

    await expect(
      new DoaMarketPriceAdapter(SOURCE_URL).fetchLatest(new AbortController().signal),
    ).rejects.toThrow('DOA source date changed while seller pages were being fetched');
  });

  it('rejects the whole snapshot when any seller fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.has('filter_category')) return htmlResponse(discoveryPage());
      const seller = url.searchParams.get('filter_seller') ?? '';
      if (seller === '27') {
        return new Response('temporarily unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return htmlResponse(sellerPage(seller));
    });

    await expect(
      new DoaMarketPriceAdapter(SOURCE_URL).fetchLatest(new AbortController().signal),
    ).rejects.toThrow('source returned HTTP 503');
  });
});

const SELLER_ROWS: Record<string, Record<string, string>> = {
  '4': {
    '44': 'ဧရာမင်း',
    '62': 'အစေ့ထုတ်ပြောင်း',
    '16': 'မတ်ပဲ',
    '63': 'မြေပဲ(အဆန်)',
    '64': 'ချက်ကြံ',
    '3': 'ခရမ်းချဉ်(ရှမ်း)',
  },
  '7': { '13': 'သရက်သီး' },
  '8': { '16': 'ပဲတီစိမ်း', '3': 'ငရုတ်အခြောက်(ရှည်)' },
  '27': { '16': 'ပဲစင်းငုံ' },
  '23': { '63': 'နှမ်းနက်' },
  '5': { '67': 'ရော်ဘာ' },
};

function discoveryPage(
  categories: ReadonlyArray<readonly [string, string]> = CATEGORIES,
  sellers: ReadonlyArray<readonly [string, string]> = COVERAGE_SELLERS,
): string {
  return `<!doctype html><html><body>
    <input name="filter_date_start" value="${SOURCE_DATE}" />
    <select name="filter_category">
      <option value="">All crops</option>
      ${categories.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
    </select>
    <select name="filter_seller">
      <option value="">All exchanges</option>
      <option value="6">Other exchange</option>
      ${sellers.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
    </select>
  </body></html>`;
}

function sellerPage(seller: string, sourceDate = SOURCE_DATE): string {
  const marketplace = COVERAGE_SELLERS.find(([value]) => value === seller)?.[1];
  if (!marketplace) throw new Error(`Unknown test seller: ${seller}`);
  const configuredRows = SELLER_ROWS[seller] ?? {};
  return matrixPage(
    CATEGORIES.map(([value, category]) => {
      const name = configuredRows[value] ?? `Unknown ${value}`;
      const hasPrice = value in configuredRows;
      return {
        category,
        name,
        prices: [[hasPrice ? '1000' : '', hasPrice ? '1200' : '']] as Array<
          readonly [string, string]
        >,
      };
    }),
    sourceDate,
    [marketplace],
  );
}

function matrixPage(
  rows: Array<{
    category: string;
    name: string;
    prices: Array<readonly [string, string]>;
  }>,
  sourceDate: string,
  marketplaces: readonly string[],
): string {
  return `<!doctype html><html><body>
    <input name="filter_date_start" value="${sourceDate}" />
    <table>
      <thead>
        <tr>
          <td rowspan="3">စဉ်</td><td rowspan="3">သီးနှံအမည်</td><td colspan="2">ယူနစ်</td>
          ${marketplaces.map((marketplace) => `<td colspan="2">${marketplace}</td>`).join('')}
        </tr>
        <tr><td rowspan="2">ရေတွက်ပုံ</td><td rowspan="2">တစ်ယူနစ် ပမာဏ</td></tr>
        <tr>${marketplaces.map(() => '<td>အနိမ့်ဈေး</td><td>အမြင့်ဈေး</td>').join('')}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row, index) => `<tr><td colspan="4">${row.category}</td></tr>
              <tr><td>${index + 1}</td><td>${row.name}</td><td>တင်း</td><td>၁ ပိဿာ</td>
                ${row.prices.map(([minimum, maximum]) => `<td>${minimum}</td><td>${maximum}</td>`).join('')}
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </body></html>`;
}

function htmlResponse(html: string): Response {
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
