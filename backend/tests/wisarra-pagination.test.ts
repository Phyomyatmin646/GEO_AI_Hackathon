import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WisarraMarketPriceAdapter,
  parseWisarraMarketPrices,
} from '../src/adapters/market-prices/wisarra.js';

const SOURCE_URL = 'https://example.test/en/market-price';
const FETCHED_AT = '2026-08-09T00:00:00.000Z';
const HEADERS = `
  <thead><tr>
    <th>Name</th><th>Location</th><th>Marketplace</th><th>Min</th>
    <th>Max</th><th>Currency</th><th>Quantity</th><th>Unit</th>
  </tr></thead>`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Wisarra first-page parser', () => {
  it('strictly parses the eight source columns and retains mapped and additional crops', () => {
    const rows = parseWisarraMarketPrices(
      mainPage([
        sourceRow('Rice', 'Sagaing', 'Shwebo', '100,000', '120,000', 'MMK', '1', 'Bag'),
        sourceRow(
          'Rice (Rainy - Emata)',
          'Bago',
          'Bago',
          '70,000',
          '75,000',
          'MMK',
          '1',
          'Bag',
        ),
        sourceRow('Onion', 'Mandalay', '-', '-', '3,200', 'MMK', '1', 'Viss'),
        sourceRow(
          'Groundnut Oil',
          'Yangon',
          'Bayintnaung',
          '8,000',
          '9,000',
          'MMK',
          '1',
          'Viss',
        ),
      ]),
      FETCHED_AT,
      SOURCE_URL,
    );

    expect(rows.map((row) => row.crop_key)).toEqual([
      'monsoon_rice',
      'dry_season_rice',
      'monsoon_rice',
      null,
    ]);
    expect(rows.find((row) => row.commodity_name_raw === 'Onion')).toMatchObject({
      crop_key: null,
      marketplace: null,
      price_min: null,
      price_max: 3200,
      source_date: '2026-08-08',
      raw_payload: { source_row: { page: 1 } },
    });
    expect(rows.filter((row) => row.commodity_name_raw === 'Rice')[0]?.raw_payload).toMatchObject({
      source_row: { page: 1 },
      model_crop_keys: ['monsoon_rice', 'dry_season_rice'],
      is_season_specific: false,
    });
    expect(rows.some((row) => row.commodity_name_raw === 'Groundnut Oil')).toBe(false);
  });

  it('rejects a table whose source contract is not exactly eight ordered columns', () => {
    const invalidHeaders = HEADERS.replace('<th>Min</th>', '<th>Minimum</th>');
    expect(() =>
      parseWisarraMarketPrices(
        mainPage([sourceRow('Rice')], 'August 8, 2026', invalidHeaders),
        FETCHED_AT,
        SOURCE_URL,
      ),
    ).toThrow('exactly one expected 8-column price table');

    const sevenCellRow = '<tr><td>Rice</td><td>Yangon</td><td>Market</td><td>1</td><td>2</td><td>MMK</td><td>1</td></tr>';
    expect(() =>
      parseWisarraMarketPrices(mainPage([sevenCellRow]), FETCHED_AT, SOURCE_URL),
    ).toThrow('did not contain exactly 8 columns');
  });
});

describe('Wisarra pagination', () => {
  it('fetches every AJAX page sequentially, checks the source snapshot, and preserves page provenance', async () => {
    const firstHtml = mainPage([
      sourceRow('Rice', 'Sagaing', 'Shwebo', '100000', '120000', 'MMK', '1', 'Bag'),
      sourceRow('Onion', 'Mandalay', 'Zay Cho', '2500', '3000', 'MMK', '1', 'Viss'),
    ]);
    const pageTwo = [
      sourceRow('Rice (Rainy)', 'Bago', 'Bago', '70000', '75000', 'MMK', '1', 'Bag'),
      sourceRow('Rice (Dry)', 'Ayeyarwady', 'Pathein', '68000', '73000', 'MMK', '1', 'Bag'),
      sourceRow('Black Gram', 'Yangon', 'Bayintnaung', '3900', '4100', 'MMK', '1', 'Viss'),
    ].join('');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(htmlResponse(firstHtml))
      .mockResolvedValueOnce(jsonResponse({ total: 3, data: pageTwo }))
      .mockResolvedValueOnce(jsonResponse({ total: 0, data: '' }))
      .mockResolvedValueOnce(htmlResponse(firstHtml));

    const rows = await new WisarraMarketPriceAdapter(SOURCE_URL).fetchLatest(
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(`${SOURCE_URL}?page=2`);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(`${SOURCE_URL}?page=3`);
    const ajaxOptions = fetchMock.mock.calls[1]?.[1];
    const ajaxHeaders = new Headers(ajaxOptions?.headers);
    expect(ajaxHeaders.get('accept')).toBe('application/json');
    expect(ajaxHeaders.get('x-requested-with')).toBe('XMLHttpRequest');
    expect(ajaxOptions).toMatchObject({ redirect: 'error' });

    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.commodity_name_raw === 'Rice')).toHaveLength(2);
    expect(rows.find((row) => row.commodity_name_raw === 'Onion')?.crop_key).toBeNull();
    expect(rows.find((row) => row.commodity_name_raw === 'Rice (Rainy)')).toMatchObject({
      crop_key: 'monsoon_rice',
      raw_payload: {
        source_row: { page: 2 },
        model_crop_keys: ['monsoon_rice'],
        is_season_specific: true,
      },
    });
    expect(rows.find((row) => row.commodity_name_raw === 'Rice (Dry)')?.crop_key).toBe(
      'dry_season_rice',
    );
    expect(rows.find((row) => row.commodity_name_raw === 'Black Gram')?.crop_key).toBe(
      'black_gram',
    );
  });

  it('rejects malformed JSON instead of returning a partial first page', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(htmlResponse(mainPage([sourceRow('Rice')])))
      .mockResolvedValueOnce(
        new Response('{"total":1', { headers: { 'Content-Type': 'application/json' } }),
      );

    await expect(
      new WisarraMarketPriceAdapter(SOURCE_URL).fetchLatest(new AbortController().signal),
    ).rejects.toThrow('returned malformed JSON');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a pagination row-count mismatch', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(htmlResponse(mainPage([sourceRow('Rice')])))
      .mockResolvedValueOnce(jsonResponse({ total: 2, data: sourceRow('Maize') }));

    await expect(
      new WisarraMarketPriceAdapter(SOURCE_URL).fetchLatest(new AbortController().signal),
    ).rejects.toThrow('row count did not match total (1 != 2)');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      label: 'non-JSON content type',
      response: () =>
        new Response('{"total":0,"data":""}', {
          headers: { 'Content-Type': 'text/html' },
        }),
      message: 'did not return JSON',
    },
    {
      label: 'oversized declared body',
      response: () =>
        new Response('{"total":0,"data":""}', {
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(5 * 1024 * 1024 + 1),
          },
        }),
      message: 'response was too large',
    },
    {
      label: 'HTTP failure',
      response: () =>
        new Response('unavailable', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      message: 'returned HTTP 503',
    },
    {
      label: 'unexpected payload fields',
      response: () => jsonResponse({ total: 0, data: '', next: null }),
      message: 'invalid pagination payload',
    },
  ])('rejects $label', async ({ response, message }) => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(htmlResponse(mainPage([sourceRow('Rice')])))
      .mockResolvedValueOnce(response());

    await expect(
      new WisarraMarketPriceAdapter(SOURCE_URL).fetchLatest(new AbortController().signal),
    ).rejects.toThrow(message);
  });

  it('fails when pagination has not terminated by page 50', async () => {
    let requestCount = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      requestCount += 1;
      if (requestCount === 1) {
        return Promise.resolve(htmlResponse(mainPage([sourceRow('Rice')])));
      }
      return Promise.resolve(jsonResponse({ total: 1, data: sourceRow('Maize') }));
    });

    await expect(
      new WisarraMarketPriceAdapter(SOURCE_URL).fetchLatest(new AbortController().signal),
    ).rejects.toThrow('pagination did not terminate within 50 pages');
    expect(fetchMock).toHaveBeenCalledTimes(50);
  });

  it('fails the complete fetch when the source date changes during pagination', async () => {
    const firstHtml = mainPage([sourceRow('Rice')]);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(htmlResponse(firstHtml))
      .mockResolvedValueOnce(jsonResponse({ total: 0, data: '' }))
      .mockResolvedValueOnce(htmlResponse(mainPage([sourceRow('Rice')], 'August 9, 2026')));

    await expect(
      new WisarraMarketPriceAdapter(SOURCE_URL).fetchLatest(new AbortController().signal),
    ).rejects.toThrow('source date changed while pages were being fetched');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

function mainPage(
  rows: string[],
  date = 'August 8, 2026',
  headers = HEADERS,
): string {
  return `<!doctype html><html><body><main class="pageContent">
    <p>Market prices updated ${date}</p>
    <table>${headers}<tbody>${rows.join('')}</tbody></table>
  </main></body></html>`;
}

function sourceRow(
  name: string,
  location = 'Shan',
  marketplace = 'Aungban',
  min = '500',
  max = '600',
  currency = 'MMK',
  quantity = '1',
  unit = 'Viss',
): string {
  return `<tr><td>${name}</td><td>${location}</td><td>${marketplace}</td><td>${min}</td><td>${max}</td><td>${currency}</td><td>${quantity}</td><td>${unit}</td></tr>`;
}

function htmlResponse(html: string): Response {
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
