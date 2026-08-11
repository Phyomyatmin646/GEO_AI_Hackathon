import { load } from 'cheerio';

import type { MarketPriceInput } from '../../db/store.js';
import {
  MARKET_SOURCE_NAMES,
  MARKET_SOURCE_PRIORITY,
  cleanText,
  fetchHtml,
  marketInputs,
  mapCommodityToCropKeys,
  parseNumber,
  parseSourceDate,
  type MarketPriceAdapter,
} from './common.js';

export class MrfMarketPriceAdapter implements MarketPriceAdapter {
  readonly name = MARKET_SOURCE_NAMES.mrf;
  readonly priority = MARKET_SOURCE_PRIORITY[this.name];

  constructor(readonly sourceUrl: string) {}

  async fetchLatest(signal: AbortSignal): Promise<MarketPriceInput[]> {
    const html = await fetchHtml(this.sourceUrl, signal);
    const parsed = parseMrfMarketPrices(html, new Date().toISOString(), this.sourceUrl);
    if (parsed.length === 0) throw new Error('MRF page contained no supported dated rice prices');
    return parsed;
  }
}

export function parseMrfMarketPrices(
  html: string,
  fetchedAt: string,
  sourceUrl: string,
): MarketPriceInput[] {
  const $ = load(html);
  const reportListing = findMrfReportListing($, sourceUrl);
  if ($('table').length === 0 && reportListing.hasPdfReport) {
    if (!reportListing.latest) {
      throw new Error('MRF page is PDF-only and its latest report period could not be validated');
    }
    throw new Error(
      `MRF latest report (${reportListing.latest.sourceDate}) is PDF-only; no machine-readable HTML price table was published`,
    );
  }
  const sourceDate = parseSourceDate($('main, article, body').first().text());
  if (!sourceDate) throw new Error('MRF source date was not found');
  const output: MarketPriceInput[] = [];
  $('table').each((_tableIndex, table) => {
    const unitText = cleanText(
      $(table).find('caption').first().text() || $(table).find('thead').first().text(),
    );
    const unitMatch = unitText.match(/(?:MMK|Kyat)\s*\/\s*([A-Za-z][A-Za-z -]{0,30}?)(?=$|[,;()])/i);
    if (!unitMatch) return;
    const unit = cleanText(unitMatch[1] ?? '');
    const headers = $(table)
      .find('thead tr')
      .last()
      .find('th,td')
      .map((_cellIndex, cell) => cleanText($(cell).text()).toLowerCase())
      .get();
    const minimumIndex = headers.findIndex((header) => /\b(low|minimum|min)\b/.test(header));
    const maximumIndex = headers.findIndex((header) => /\b(high|maximum|max)\b/.test(header));
    const pointPriceIndex = headers.findIndex((header) => /^price$/.test(header));
    if (minimumIndex < 0 && maximumIndex < 0 && pointPriceIndex < 0) return;
    $(table)
      .find('tr')
      .each((_rowIndex, row) => {
        const cells = $(row)
          .find('th,td')
          .map((_cellIndex, cell) => cleanText($(cell).text()))
          .get();
        const commodityName = cells.find((cell) => mapCommodityToCropKeys(cell).length > 0);
        if (!commodityName) return;
        const pointPrice = pointPriceIndex >= 0 ? parseNumber(cells[pointPriceIndex] ?? '') : null;
        const priceMin = minimumIndex >= 0 ? parseNumber(cells[minimumIndex] ?? '') : pointPrice;
        const priceMax = maximumIndex >= 0 ? parseNumber(cells[maximumIndex] ?? '') : pointPrice;
        if (priceMin === null && priceMax === null) return;
        output.push(
          ...marketInputs(
            {
              commodityName,
              variety: commodityName,
              marketplace: 'Myanmar Rice Federation reference',
              priceMin,
              priceMax,
              currency: 'MMK',
              quantity: 1,
              unit,
              sourceDate,
              rawPayload: cells,
            },
            MARKET_SOURCE_NAMES.mrf,
            sourceUrl,
            fetchedAt,
          ),
        );
      });
  });
  return output;
}

type MrfReport = {
  documentUrl: string;
  sourceDate: string;
};

type MrfReportListing = {
  hasPdfReport: boolean;
  latest?: MrfReport;
};

const MRF_REPORT_LABEL = /\bReference\s+Domestic\s+and\s+FOB\s+Rice\s+Prices\b/i;
const ENGLISH_MONTH =
  '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const MRF_REPORT_PERIOD = new RegExp(
  `\\b(20\\d{2})\\s+${ENGLISH_MONTH}\\s+(\\d{1,2})\\s+(?:to|[-\u2013\u2014])\\s+(?:${ENGLISH_MONTH}\\s+)?(\\d{1,2})\\b`,
  'i',
);
const MONTH_NUMBERS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function findMrfReportListing(
  $: ReturnType<typeof load>,
  sourceUrl: string,
): MrfReportListing {
  const reports: MrfReport[] = [];
  let hasPdfReport = false;
  $('a[href]').each((_linkIndex, link) => {
    const label = cleanText($(link).text() || $(link).attr('title') || '');
    if (!MRF_REPORT_LABEL.test(label)) return;
    const href = $(link).attr('href');
    if (!href) return;
    let documentUrl: URL;
    try {
      documentUrl = new URL(href, sourceUrl);
    } catch {
      return;
    }
    if (
      (documentUrl.protocol !== 'https:' && documentUrl.protocol !== 'http:') ||
      !documentUrl.pathname.toLowerCase().endsWith('.pdf')
    ) {
      return;
    }
    hasPdfReport = true;
    const sourceDate = parseMrfReportPeriodEnd(label);
    if (sourceDate) reports.push({ documentUrl: documentUrl.toString(), sourceDate });
  });
  const latest = reports.sort(
    (left, right) =>
      right.sourceDate.localeCompare(left.sourceDate) ||
      left.documentUrl.localeCompare(right.documentUrl),
  )[0];
  return { hasPdfReport, ...(latest ? { latest } : {}) };
}

function parseMrfReportPeriodEnd(value: string): string | undefined {
  const match = cleanText(value).match(MRF_REPORT_PERIOD);
  if (!match) return undefined;
  const year = Number(match[1]);
  const startMonth = monthNumber(match[2]);
  const startDay = Number(match[3]);
  const endMonth = monthNumber(match[4] ?? match[2]);
  const endDay = Number(match[5]);
  if (!startMonth || !endMonth) return undefined;

  const startDate = isoDate(year, startMonth, startDay);
  const endYear = endMonth < startMonth ? year + 1 : year;
  const endDate = isoDate(endYear, endMonth, endDay);
  if (!startDate || !endDate) return undefined;
  const spanDays = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000;
  return spanDays >= 0 && spanDays <= 13 ? endDate : undefined;
}

function monthNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  return MONTH_NUMBERS[value.slice(0, 3).toLowerCase()];
}

function isoDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : undefined;
}
