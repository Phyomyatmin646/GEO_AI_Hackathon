import { load, type CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';

import type { MarketPriceInput } from '../../db/store.js';
import {
  MARKET_SOURCE_NAMES,
  MARKET_SOURCE_PRIORITY,
  cleanText,
  fetchHtml,
  marketInputs,
  parseNumber,
  parseSourceDate,
  type MarketPriceAdapter,
} from './common.js';

const DOA_CATEGORY_FILTERS = [
  { value: '44', label: 'စပါး' },
  { value: '62', label: 'အခြားနှံစားသီးနှံ' },
  { value: '16', label: 'ပဲမျိုးစုံ' },
  { value: '63', label: 'ဆီထွက်' },
  { value: '64', label: 'စက်မှုကုန်ကြမ်းသီးနှံ' },
  { value: '1', label: 'ဆန်' },
  { value: '3', label: 'စားဖိုဆောင်သီးနှံ' },
  { value: '2', label: 'ဆီ' },
  { value: '65', label: 'ဟင်းခတ်အမွှေးအကြိုင်' },
  { value: '6', label: 'ဟင်းသီးဟင်းရွက်' },
  { value: '66', label: 'အခြားစားသုံး' },
  { value: '67', label: 'အခြားမစားသုံး' },
  { value: '13', label: 'သစ်သီးဝလံ' },
] as const;
// These official exchanges had complementary canonical-crop coverage in the
// live DOA snapshot. Each seller-filtered page contains the complete crop
// category inventory, keeping refreshes bounded to six source requests.
const DOA_COVERAGE_SELLERS = [
  'အာဟာရသုခဈေးကုန်စည်ဒိုင်',
  'ပြင်ဦးလွင်ကုန်စည်ဒိုင်',
  'ဘုရင့်နောင်ကုန်စည်ဒိုင်',
  'အောင်ပန်းကုန်စည်ဒိုင်',
  'တပ်ကုန်းကုန်စည်ဒိုင်',
  'သန်လျင်မြို့မဈေးကုန်စည်ဒိုင်',
] as const;
const DOA_SELLER_FETCH_CONCURRENCY = 3;
const MAX_DOA_CATEGORY_FILTER_OPTIONS = 50;
const MAX_DOA_MARKETPLACES = 40;
const MAX_DOA_COMMODITY_ROWS_PER_PAGE = 500;
const MAX_DOA_OUTPUT_ROWS = 5_000;
const MAX_DOA_SELLER_PAGES_BYTES = 5 * 1024 * 1024;

type DoaSellerPage = {
  url: string;
  marketplace: string;
};

type DoaDiscovery = {
  sourceDate: string;
  categoryLabels: string[];
  sellerPages: DoaSellerPage[];
};

export class DoaMarketPriceAdapter implements MarketPriceAdapter {
  readonly name = MARKET_SOURCE_NAMES.doa;
  readonly priority = MARKET_SOURCE_PRIORITY[this.name];

  constructor(readonly sourceUrl: string) {}

  async fetchLatest(signal: AbortSignal): Promise<MarketPriceInput[]> {
    const discoveryHtml = await fetchHtml(this.sourceUrl, signal);
    const discovery = discoverDoaMarketPages(discoveryHtml, this.sourceUrl);
    const pages = await fetchDoaSellerPages(discovery.sellerPages, signal);
    const totalBytes = pages.reduce((total, page) => total + Buffer.byteLength(page.html), 0);
    if (totalBytes > MAX_DOA_SELLER_PAGES_BYTES) {
      throw new Error('DOA seller pages exceeded the aggregate response limit');
    }

    const fetchedAt = new Date().toISOString();
    const prices: MarketPriceInput[] = [];
    for (const page of pages) {
      const sourceDate = parseDoaSourceDate(page.html);
      if (sourceDate !== discovery.sourceDate) {
        throw new Error('DOA source date changed while seller pages were being fetched');
      }
      prices.push(
        ...parseDoaMarketPrices(
          page.html,
          fetchedAt,
          page.url,
          [page.marketplace],
          discovery.categoryLabels,
        ),
      );
      if (prices.length > MAX_DOA_OUTPUT_ROWS) {
        throw new Error('DOA source exceeded the parsed row limit');
      }
    }

    if (prices.length === 0) throw new Error('DOA page contained no supported dated crop prices');
    return prices;
  }
}

export function discoverDoaMarketPages(html: string, sourceUrl: string): DoaDiscovery {
  const $ = load(html);
  const sourceDate = parseDoaSourceDate(html);
  const categorySelect = $('select[name="filter_category"]');
  const sellerSelect = $('select[name="filter_seller"]');
  if (categorySelect.length !== 1 || sellerSelect.length !== 1) {
    throw new Error('DOA page did not contain exactly one category and seller filter');
  }

  const categoryOptions = selectOptions($, categorySelect.find('option').toArray());
  const sellerOptions = selectOptions($, sellerSelect.find('option').toArray());
  validateFilterOptions(categoryOptions, 'category', MAX_DOA_CATEGORY_FILTER_OPTIONS);
  validateFilterOptions(sellerOptions, 'seller', MAX_DOA_MARKETPLACES);
  if (
    categoryOptions.length !== DOA_CATEGORY_FILTERS.length ||
    categoryOptions.some(
      (option, index) =>
        option.value !== DOA_CATEGORY_FILTERS[index]?.value ||
        option.label !== DOA_CATEGORY_FILTERS[index]?.label,
    )
  ) {
    throw new Error('DOA category filter inventory changed');
  }

  const sellerByLabel = new Map(sellerOptions.map((option) => [option.label, option.value]));
  const sellerPages = DOA_COVERAGE_SELLERS.map((marketplace) => {
    const value = sellerByLabel.get(marketplace);
    if (!value) throw new Error(`DOA coverage seller filter was not found: ${marketplace}`);
    const url = new URL(sourceUrl);
    url.searchParams.delete('filter_category');
    url.searchParams.set('filter_seller', value);
    url.searchParams.set('filter_date_start', sourceDate);
    url.hash = '';
    return { url: url.toString(), marketplace };
  });

  return {
    sourceDate,
    categoryLabels: DOA_CATEGORY_FILTERS.map((option) => option.label),
    sellerPages,
  };
}

export function parseDoaMarketPrices(
  html: string,
  fetchedAt: string,
  sourceUrl: string,
  expectedMarketplaces?: readonly string[],
  expectedCategories?: readonly string[],
): MarketPriceInput[] {
  const $ = load(html);
  const sourceDate = parseDoaSourceDate(html);
  const matchingTables = $('table')
    .filter((_tableIndex, table) => isDoaPriceTable($, table))
    .toArray();
  if (matchingTables.length !== 1) {
    throw new Error('DOA page did not contain exactly one supported price table');
  }

  const table = matchingTables[0];
  if (!table) throw new Error('DOA price table alignment failed');
  const marketplaces = parseDoaMarketplaces($, table);
  if (
    expectedMarketplaces &&
    (marketplaces.length !== expectedMarketplaces.length ||
      marketplaces.some((marketplace, index) => marketplace !== expectedMarketplaces[index]))
  ) {
    throw new Error('DOA marketplace columns did not match the discovered seller filters');
  }

  const output: MarketPriceInput[] = [];
  let category = '';
  let sourceRowCount = 0;
  const categoryHeadings: string[] = [];
  $(table)
    .find('tbody tr')
    .each((_rowIndex, row) => {
      const cells = $(row)
        .children('th,td')
        .map((_cellIndex, cell) => cleanText($(cell).text()))
        .get();
      if (cells.length === 1) {
        category = cells[0] ?? '';
        if (category) categoryHeadings.push(category);
        return;
      }
      if (parseNumber(cells[0] ?? '') === null) return;
      if (!category) throw new Error('DOA commodity row appeared before its category heading');

      sourceRowCount += 1;
      if (sourceRowCount > MAX_DOA_COMMODITY_ROWS_PER_PAGE) {
        throw new Error('DOA page exceeded the commodity row limit');
      }
      const expectedCellCount = 4 + marketplaces.length * 2;
      if (cells.length !== expectedCellCount) {
        throw new Error(
          `DOA commodity row did not contain exactly ${expectedCellCount} cells`,
        );
      }

      const commodityName = cleanText(`${category} ${cells[1] ?? ''}`);
      const unitDetails = cleanText([cells[2], cells[3]].filter(Boolean).join(' '));
      for (const [marketplaceIndex, marketplace] of marketplaces.entries()) {
        const priceOffset = 4 + marketplaceIndex * 2;
        const priceMin = parseNumber(cells[priceOffset] ?? '');
        const priceMax = parseNumber(cells[priceOffset + 1] ?? '');
        if (priceMin === null && priceMax === null) continue;
        output.push(
          ...marketInputs(
            {
              commodityName,
              variety: cells[1] ?? null,
              marketplace,
              priceMin,
              priceMax,
              currency: 'MMK',
              quantity: 1,
              unit: unitDetails,
              sourceDate,
              rawPayload: {
                cells: [
                  ...cells.slice(0, 4),
                  cells[priceOffset] ?? '',
                  cells[priceOffset + 1] ?? '',
                ],
                marketplace_index: marketplaceIndex,
              },
            },
            MARKET_SOURCE_NAMES.doa,
            sourceUrl,
            fetchedAt,
          ),
        );
      }
    });

  if (sourceRowCount === 0) throw new Error('DOA price table contained no commodity rows');
  if (expectedCategories) {
    const discoveredCategories = new Set(categoryHeadings);
    if (
      discoveredCategories.size !== categoryHeadings.length ||
      categoryHeadings.length !== expectedCategories.length ||
      expectedCategories.some((categoryName) => !discoveredCategories.has(categoryName))
    ) {
      throw new Error('DOA seller page categories did not match the discovered category filters');
    }
  }
  return output;
}

function parseDoaSourceDate(html: string): string {
  const $ = load(html);
  const dateCandidate =
    $('input[name="filter_date_start"]').first().attr('value') ??
    $('input[type="date"]').first().attr('value') ??
    $('input[name*="date" i]').first().attr('value') ??
    $('body').text();
  const sourceDate = parseSourceDate(dateCandidate);
  if (!sourceDate) throw new Error('DOA source date was not found');
  return sourceDate;
}

function isDoaPriceTable($: CheerioAPI, table: AnyNode): boolean {
  const rows = $(table).find('thead tr');
  if (rows.length !== 3) return false;
  const firstRow = rows
    .eq(0)
    .children('th,td')
    .map((_index, cell) => cleanText($(cell).text()))
    .get();
  return (
    firstRow[0] === 'စဉ်' &&
    /သီးနှံ/.test(firstRow[1] ?? '') &&
    firstRow[2] === 'ယူနစ်' &&
    /အနိမ့်ဈေး/.test(rows.eq(2).text()) &&
    /အမြင့်ဈေး/.test(rows.eq(2).text())
  );
}

function parseDoaMarketplaces($: CheerioAPI, table: AnyNode): string[] {
  const rows = $(table).find('thead tr');
  const firstCells = rows.eq(0).children('th,td').toArray();
  const unitCell = firstCells[2];
  if (!unitCell || $(unitCell).attr('colspan') !== '2') {
    throw new Error('DOA price table unit header did not span two columns');
  }

  const marketCells = firstCells.slice(3);
  if (marketCells.length === 0 || marketCells.length > MAX_DOA_MARKETPLACES) {
    throw new Error('DOA price table exceeded the marketplace column limit');
  }
  const marketplaces = marketCells.map((cell) => {
    if ($(cell).attr('colspan') !== '2') {
      throw new Error('DOA marketplace header did not span two price columns');
    }
    const marketplace = cleanText($(cell).text());
    if (!marketplace) throw new Error('DOA marketplace header was empty');
    return marketplace;
  });
  if (new Set(marketplaces).size !== marketplaces.length) {
    throw new Error('DOA marketplace headers were duplicated');
  }

  const unitHeaders = rows
    .eq(1)
    .children('th,td')
    .map((_index, cell) => cleanText($(cell).text()))
    .get();
  if (
    unitHeaders.length !== 2 ||
    unitHeaders[0] !== 'ရေတွက်ပုံ' ||
    unitHeaders[1] !== 'တစ်ယူနစ် ပမာဏ'
  ) {
    throw new Error('DOA price table unit columns changed');
  }

  const priceHeaders = rows
    .eq(2)
    .children('th,td')
    .map((_index, cell) => cleanText($(cell).text()))
    .get();
  if (
    priceHeaders.length !== marketplaces.length * 2 ||
    priceHeaders.some(
      (header, index) => header !== (index % 2 === 0 ? 'အနိမ့်ဈေး' : 'အမြင့်ဈေး'),
    )
  ) {
    throw new Error('DOA price table min/max columns changed');
  }
  return marketplaces;
}

function selectOptions(
  $: CheerioAPI,
  elements: AnyNode[],
): Array<{ value: string; label: string }> {
  return elements
    .map((element) => ({
      value: cleanText($(element).attr('value') ?? ''),
      label: cleanText($(element).text()),
    }))
    .filter((option) => option.value !== '');
}

function validateFilterOptions(
  options: ReadonlyArray<{ value: string; label: string }>,
  filterName: string,
  maximumOptions: number,
): void {
  if (
    options.length === 0 ||
    options.length > maximumOptions ||
    options.some((option) => !/^\d{1,3}$/.test(option.value) || !option.label) ||
    new Set(options.map((option) => option.value)).size !== options.length ||
    new Set(options.map((option) => option.label)).size !== options.length
  ) {
    throw new Error(`DOA ${filterName} filter options were invalid`);
  }
}

async function fetchDoaSellerPages(
  pages: readonly DoaSellerPage[],
  signal: AbortSignal,
): Promise<Array<DoaSellerPage & { html: string }>> {
  const results = new Array<DoaSellerPage & { html: string }>(pages.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(DOA_SELLER_FETCH_CONCURRENCY, pages.length) },
    async () => {
      while (nextIndex < pages.length) {
        const index = nextIndex;
        nextIndex += 1;
        const page = pages[index];
        if (!page) throw new Error('DOA seller page alignment failed');
        results[index] = { ...page, html: await fetchHtml(page.url, signal) };
      }
    },
  );
  await Promise.all(workers);
  return results;
}
