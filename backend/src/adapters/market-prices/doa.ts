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

export class DoaMarketPriceAdapter implements MarketPriceAdapter {
  readonly name = MARKET_SOURCE_NAMES.doa;
  readonly priority = MARKET_SOURCE_PRIORITY[this.name];

  constructor(readonly sourceUrl: string) {}

  async fetchLatest(signal: AbortSignal): Promise<MarketPriceInput[]> {
    const html = await fetchHtml(this.sourceUrl, signal);
    const parsed = parseDoaMarketPrices(html, new Date().toISOString(), this.sourceUrl);
    if (parsed.length === 0) throw new Error('DOA page contained no supported dated crop prices');
    return parsed;
  }
}

export function parseDoaMarketPrices(
  html: string,
  fetchedAt: string,
  sourceUrl: string,
): MarketPriceInput[] {
  const $ = load(html);
  const dateCandidate =
    $('input[type="date"]').first().attr('value') ??
    $('input[name*="date" i]').first().attr('value') ??
    $('body').text();
  const sourceDate = parseSourceDate(dateCandidate);
  if (!sourceDate) throw new Error('DOA source date was not found');
  const marketplace = cleanText(
    $('select[name*="seller" i] option:selected').first().text() || 'DOA commodity exchange',
  );
  const output: MarketPriceInput[] = [];
  $('table').each((_tableIndex, table) => {
    if (!/အနိမ့်ဈေး|အမြင့်ဈေး/.test($(table).text())) return;
    let category = '';
    $(table)
      .find('tr')
      .each((_rowIndex, row) => {
        const cells = $(row)
          .find('th,td')
          .map((_cellIndex, cell) => cleanText($(cell).text()))
          .get();
        if (cells.length === 1) {
          category = cells[0] ?? '';
          return;
        }
        if (cells.length < 6 || parseNumber(cells[0] ?? '') === null) return;
        const priceMin = parseNumber(cells.at(-2) ?? '');
        const priceMax = parseNumber(cells.at(-1) ?? '');
        if (priceMin === null && priceMax === null) return;
        const commodityName = cleanText(`${category} ${cells[1] ?? ''}`);
        const unitDetails = cleanText([cells[2], cells[3]].filter(Boolean).join(' '));
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
              rawPayload: cells,
            },
            MARKET_SOURCE_NAMES.doa,
            sourceUrl,
            fetchedAt,
          ),
        );
      });
  });
  return output;
}
