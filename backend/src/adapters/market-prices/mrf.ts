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
