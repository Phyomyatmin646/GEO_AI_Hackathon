import { load } from 'cheerio';

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

const WISARRA_COLUMNS = [
  'name',
  'location',
  'marketplace',
  'min',
  'max',
  'currency',
  'quantity',
  'unit',
] as const;
const MAX_WISARRA_PAGES = 50;
const MAX_WISARRA_SOURCE_ROWS = 10_000;
const MAX_WISARRA_AJAX_BYTES = 5 * 1024 * 1024;
const USER_AGENT = 'MyanmarAgriMarketPriceBot/1.0 (+backend source adapter)';

type ParsedWisarraPage = {
  prices: MarketPriceInput[];
  sourceRowCount: number;
};

type ParsedWisarraMainPage = ParsedWisarraPage & {
  sourceDate: string;
};

type WisarraAjaxPayload = {
  total: number;
  data: string;
};

export class WisarraMarketPriceAdapter implements MarketPriceAdapter {
  readonly name = MARKET_SOURCE_NAMES.wisarra;
  readonly priority = MARKET_SOURCE_PRIORITY[this.name];

  constructor(readonly sourceUrl: string) {}

  async fetchLatest(signal: AbortSignal): Promise<MarketPriceInput[]> {
    const fetchedAt = new Date().toISOString();
    const html = await fetchHtml(this.sourceUrl, signal);
    const firstPage = parseWisarraMainPage(html, fetchedAt, this.sourceUrl);
    if (firstPage.sourceRowCount === 0) {
      throw new Error('Wisarra first page contained no source rows');
    }
    if (firstPage.sourceRowCount > MAX_WISARRA_SOURCE_ROWS) {
      throw new Error('Wisarra source exceeded the row limit');
    }

    const prices = [...firstPage.prices];
    let sourceRowCount = firstPage.sourceRowCount;
    let terminated = false;

    for (let page = 2; page <= MAX_WISARRA_PAGES; page += 1) {
      const payload = await fetchWisarraAjaxPage(this.sourceUrl, page, signal);
      const parsed = parseWisarraFragment(
        payload.data,
        firstPage.sourceDate,
        fetchedAt,
        this.sourceUrl,
        page,
      );
      if (parsed.sourceRowCount !== payload.total) {
        throw new Error(
          `Wisarra page ${page} row count did not match total (${parsed.sourceRowCount} != ${payload.total})`,
        );
      }
      if (payload.total === 0) {
        terminated = true;
        break;
      }

      sourceRowCount += payload.total;
      if (sourceRowCount > MAX_WISARRA_SOURCE_ROWS) {
        throw new Error('Wisarra source exceeded the row limit');
      }
      prices.push(...parsed.prices);
    }

    if (!terminated) {
      throw new Error(`Wisarra pagination did not terminate within ${MAX_WISARRA_PAGES} pages`);
    }
    if (prices.length === 0) {
      throw new Error('Wisarra pages contained no valid crop or commodity prices');
    }

    const verificationHtml = await fetchHtml(this.sourceUrl, signal);
    const verificationDate = parseWisarraSourceDate(verificationHtml);
    if (verificationDate !== firstPage.sourceDate) {
      throw new Error('Wisarra source date changed while pages were being fetched');
    }

    return prices;
  }
}

export function parseWisarraMarketPrices(
  html: string,
  fetchedAt: string,
  sourceUrl: string,
): MarketPriceInput[] {
  return parseWisarraMainPage(html, fetchedAt, sourceUrl).prices;
}

function parseWisarraMainPage(
  html: string,
  fetchedAt: string,
  sourceUrl: string,
): ParsedWisarraMainPage {
  const $ = load(html);
  const sourceDate = parseWisarraSourceDate(html);
  const matchingTableIndexes: number[] = [];

  $('table').each((tableIndex, table) => {
    const headers = $(table)
      .find('thead th')
      .map((_index, element) => cleanText($(element).text()).toLowerCase())
      .get();
    if (headers.join('|') === WISARRA_COLUMNS.join('|')) {
      matchingTableIndexes.push(tableIndex);
    }
  });

  if (matchingTableIndexes.length !== 1) {
    throw new Error('Wisarra page did not contain exactly one expected 8-column price table');
  }

  const cellRows: string[][] = [];
  $('table')
    .eq(matchingTableIndexes[0] ?? -1)
    .find('tbody tr')
    .each((rowIndex, row) => {
      const cells = $(row)
        .find('td')
        .map((_index, element) => cleanText($(element).text()))
        .get();
      if (cells.length !== WISARRA_COLUMNS.length) {
        throw new Error(
          `Wisarra page 1 row ${rowIndex + 1} did not contain exactly 8 columns`,
        );
      }
      cellRows.push(cells);
    });

  return {
    sourceDate,
    ...marketPricesFromRows(cellRows, sourceDate, fetchedAt, sourceUrl, 1),
  };
}

function parseWisarraFragment(
  fragment: string,
  sourceDate: string,
  fetchedAt: string,
  sourceUrl: string,
  page: number,
): ParsedWisarraPage {
  const $ = load(`<table><tbody>${fragment}</tbody></table>`);
  const cellRows: string[][] = [];
  $('table > tbody > tr').each((rowIndex, row) => {
    const cells = $(row)
      .children('td')
      .map((_index, element) => cleanText($(element).text()))
      .get();
    if (cells.length !== WISARRA_COLUMNS.length) {
      throw new Error(
        `Wisarra page ${page} row ${rowIndex + 1} did not contain exactly 8 columns`,
      );
    }
    cellRows.push(cells);
  });
  return marketPricesFromRows(cellRows, sourceDate, fetchedAt, sourceUrl, page);
}

function marketPricesFromRows(
  cellRows: string[][],
  sourceDate: string,
  fetchedAt: string,
  sourceUrl: string,
  page: number,
): ParsedWisarraPage {
  const prices: MarketPriceInput[] = [];
  for (const cells of cellRows) {
    const quantity = parseNumber(cells[6] ?? '');
    const priceMin = parseNumber(cells[3] ?? '');
    const priceMax = parseNumber(cells[4] ?? '');
    if (!quantity || quantity <= 0 || (priceMin === null && priceMax === null)) continue;

    const commodityName = sourceText(cells[0] ?? '') ?? '';
    const variety = [...commodityName.matchAll(/\(([^)]+)\)/g)]
      .map((match) => cleanText(match[1] ?? ''))
      .filter(Boolean)
      .join(' / ');
    prices.push(
      ...marketInputs(
        {
          commodityName,
          variety: variety || null,
          region: sourceText(cells[1] ?? ''),
          marketplace: sourceText(cells[2] ?? ''),
          priceMin,
          priceMax,
          currency: sourceText(cells[5] ?? '') ?? '',
          quantity,
          unit: sourceText(cells[7] ?? '') ?? '',
          sourceDate,
          rawPayload: { page, cells },
        },
        MARKET_SOURCE_NAMES.wisarra,
        sourceUrl,
        fetchedAt,
        { includeUnmapped: true },
      ),
    );
  }
  return { prices, sourceRowCount: cellRows.length };
}

function parseWisarraSourceDate(html: string): string {
  const $ = load(html);
  const sourceDate = parseSourceDate($('.pageContent, main, body').first().text());
  if (!sourceDate) throw new Error('Wisarra source date was not found');
  return sourceDate;
}

async function fetchWisarraAjaxPage(
  sourceUrl: string,
  page: number,
  signal: AbortSignal,
): Promise<WisarraAjaxPayload> {
  const url = new URL(sourceUrl);
  url.searchParams.set('page', String(page));
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      'X-Requested-With': 'XMLHttpRequest',
    },
    redirect: 'error',
    signal,
  });
  if (!response.ok) throw new Error(`Wisarra page ${page} returned HTTP ${response.status}`);

  const contentType = response.headers.get('content-type')?.toLowerCase().trim() ?? '';
  if (!/^(?:application\/json|[^;]+\+json)(?:;|$)/.test(contentType)) {
    throw new Error(`Wisarra page ${page} did not return JSON`);
  }
  const declaredLengthHeader = response.headers.get('content-length');
  if (declaredLengthHeader !== null) {
    const declaredLength = Number(declaredLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WISARRA_AJAX_BYTES) {
      throw new Error(`Wisarra page ${page} response was too large`);
    }
  }

  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_WISARRA_AJAX_BYTES) {
    throw new Error(`Wisarra page ${page} response was too large`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`Wisarra page ${page} returned malformed JSON`);
  }
  if (!isExactAjaxPayload(parsed)) {
    throw new Error(`Wisarra page ${page} returned an invalid pagination payload`);
  }
  return parsed;
}

function isExactAjaxPayload(value: unknown): value is WisarraAjaxPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    keys.length === 2 &&
    keys[0] === 'data' &&
    keys[1] === 'total' &&
    typeof record.total === 'number' &&
    Number.isInteger(record.total) &&
    record.total >= 0 &&
    record.total <= MAX_WISARRA_SOURCE_ROWS &&
    typeof record.data === 'string'
  );
}

function sourceText(value: string): string | null {
  const cleaned = cleanText(value);
  return !cleaned || cleaned === '-' || cleaned === '–' ? null : cleaned;
}
