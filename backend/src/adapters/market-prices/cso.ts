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

export class CsoMarketPriceAdapter implements MarketPriceAdapter {
  readonly name = MARKET_SOURCE_NAMES.cso;
  readonly priority = MARKET_SOURCE_PRIORITY[this.name];

  constructor(readonly sourceUrl: string) {}

  async fetchLatest(signal: AbortSignal): Promise<MarketPriceInput[]> {
    const html = await fetchHtml(this.sourceUrl, signal);
    const parsed = parseCsoMarketPrices(html, new Date().toISOString(), this.sourceUrl);
    if (parsed.length === 0) throw new Error('CSO page contained no supported crop prices');
    return parsed;
  }
}

export function parseCsoMarketPrices(
  html: string,
  fetchedAt: string,
  sourceUrl: string,
): MarketPriceInput[] {
  const $ = load(html);
  const output: MarketPriceInput[] = [];
  $('table').each((_tableIndex, table) => {
    const rows: string[][] = [];
    $(table)
      .find('tr')
      .each((_rowIndex, row) => {
        rows.push(
          $(row)
            .find('th,td')
            .map((_cellIndex, cell) => cleanText($(cell).text()))
            .get(),
        );
      });
    const unitText = rows.flat().find((cell) => /^Kyat\s*\//i.test(cell));
    if (!unitText) return;
    const unit = cleanText(unitText.replace(/^Kyat\s*\//i, ''));
    const headerIndex = rows.findIndex((cells) => /commodit/i.test(cells[1] ?? ''));
    if (headerIndex < 0) return;
    const dateHeaders = rows[headerIndex]?.slice(2) ?? [];
    const latestHeader = dateHeaders
      .map((value, index) => ({ index, sourceDate: parseSourceDate(value) }))
      .filter((item): item is { index: number; sourceDate: string } => Boolean(item.sourceDate))
      .sort((left, right) => right.sourceDate.localeCompare(left.sourceDate))[0];
    if (!latestHeader) return;
    for (const cells of rows.slice(headerIndex + 1)) {
      if (!/^\d+$/.test(cells[0] ?? '') || !cells[1]) continue;
      const price = parseNumber(cells[latestHeader.index + 2] ?? '');
      if (price === null) continue;
      output.push(
        ...marketInputs(
          {
            commodityName: cells[1],
            variety: cells[1].match(/\(([^)]+)\)/)?.[1] ?? null,
            region: 'Yangon',
            marketplace: 'Yangon retail average',
            priceMin: price,
            priceMax: price,
            currency: 'MMK',
            quantity: 1,
            unit,
            sourceDate: latestHeader.sourceDate,
            rawPayload: cells,
          },
          MARKET_SOURCE_NAMES.cso,
          sourceUrl,
          fetchedAt,
        ),
      );
    }
  });
  const newestSourceDate = output.map((row) => row.source_date).sort().at(-1);
  return newestSourceDate ? output.filter((row) => row.source_date === newestSourceDate) : [];
}
