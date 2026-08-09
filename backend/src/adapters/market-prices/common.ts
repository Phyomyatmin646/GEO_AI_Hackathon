import type { CropKey } from '../../contracts/weekly.js';
import type { MarketPriceInput } from '../../db/store.js';

export const MARKET_SOURCE_NAMES = {
  doa: 'Department of Agriculture MIS',
  mrf: 'Myanmar Rice Federation',
  cso: 'Central Statistical Organization',
  wisarra: 'Wisarra',
} as const;

export const MARKET_SOURCE_PRIORITY: Readonly<Record<string, number>> = {
  [MARKET_SOURCE_NAMES.doa]: 1,
  [MARKET_SOURCE_NAMES.mrf]: 2,
  [MARKET_SOURCE_NAMES.cso]: 3,
  [MARKET_SOURCE_NAMES.wisarra]: 4,
};

export interface MarketPriceAdapter {
  readonly name: string;
  readonly priority: number;
  readonly sourceUrl: string;
  fetchLatest(signal: AbortSignal): Promise<MarketPriceInput[]>;
}

export type ParsedMarketRow = {
  commodityName: string;
  variety?: string | null;
  region?: string | null;
  marketplace?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  currency: string;
  quantity: number;
  unit: string;
  sourceDate: string;
  rawPayload: unknown;
};

export type MarketInputOptions = {
  includeUnmapped?: boolean;
};

export async function fetchHtml(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'MyanmarAgriMarketPriceBot/1.0 (+backend source adapter)',
    },
    redirect: 'error',
    signal,
  });
  if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new Error('source did not return HTML');
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > 5 * 1024 * 1024) {
    throw new Error('source response is too large');
  }
  const html = await response.text();
  if (Buffer.byteLength(html) > 5 * 1024 * 1024) throw new Error('source response is too large');
  return html;
}

export function marketInputs(
  row: ParsedMarketRow,
  sourceName: string,
  sourceUrl: string,
  fetchedAt: string,
  options: MarketInputOptions = {},
): MarketPriceInput[] {
  const commodityName = cleanText(row.commodityName);
  const currency = cleanText(row.currency).toUpperCase();
  const unit = cleanText(row.unit);
  const priceMin = row.priceMin ?? null;
  const priceMax = row.priceMax ?? null;
  if (
    isMissingText(commodityName) ||
    isProcessedMarketProduct(commodityName) ||
    isMissingText(currency) ||
    isMissingText(unit) ||
    !Number.isFinite(row.quantity) ||
    row.quantity <= 0 ||
    (priceMin === null && priceMax === null) ||
    (priceMin !== null && (!Number.isFinite(priceMin) || priceMin < 0)) ||
    (priceMax !== null && (!Number.isFinite(priceMax) || priceMax < 0)) ||
    (priceMin !== null && priceMax !== null && priceMax < priceMin)
  ) {
    return [];
  }
  const cropKeys = mapCommodityToCropKeys(commodityName);
  const storageKeys: Array<CropKey | null> =
    cropKeys.length > 0 ? cropKeys : options.includeUnmapped ? [null] : [];
  const riceFamily = /\b(rice|paddy)\b|စပါး|ဆန်/i.test(commodityName);
  return storageKeys.map((cropKey) => ({
    crop_key: cropKey,
    commodity_name_raw: commodityName,
    variety: optionalMarketText(row.variety),
    region: optionalMarketText(row.region),
    marketplace: optionalMarketText(row.marketplace),
    price_min: priceMin,
    price_max: priceMax,
    currency,
    quantity: row.quantity,
    unit,
    source_name: sourceName,
    source_date: row.sourceDate,
    source_url: sourceUrl,
    fetched_at: fetchedAt,
    raw_payload: {
      source_row: row.rawPayload,
      model_crop_keys: cropKeys,
      is_model_crop: cropKey !== null,
      is_season_specific: riceFamily ? cropKeys.length === 1 : null,
    },
  }));
}

export function mapCommodityToCropKeys(rawName: string): CropKey[] {
  const name = cleanText(rawName).toLowerCase();
  if (!name || isProcessedMarketProduct(name)) return [];
  if (/\b(rice|paddy)\b/.test(name) || /စပါး|ဆန်/.test(name)) {
    if (/\b(dry|summer)\b|နွေ/.test(name)) return ['dry_season_rice'];
    if (/\b(rainy|monsoon)\b|မိုး/.test(name)) return ['monsoon_rice'];
    return ['monsoon_rice', 'dry_season_rice'];
  }
  if (/black\s*gram|blackgram|မတ်ပဲ/.test(name)) return ['black_gram'];
  if (/green\s*gram|mung\s*bean|ပဲတီစိမ်း/.test(name)) return ['green_gram'];
  if (/pigeon\s*pea|ပဲစင်းငုံ|ပဲစဉ်းငုံ/.test(name)) return ['pigeon_pea'];
  if (/\b(maize|corn)\b|ပြောင်း/.test(name)) return ['maize'];
  if (/\bgroundnut\b|\bpeanut\b|မြေပဲ/.test(name)) return ['groundnut'];
  if (/chilli|chili|ငရုတ်/.test(name)) return ['chili'];
  if (/sesam|နှမ်း/.test(name)) return ['sesame'];
  if (/sugar\s*cane|sugarcane|ကြံ/.test(name)) return ['sugarcane'];
  if (/cassava|ပီလောပီနံ/.test(name)) return ['cassava'];
  if (/tomato|ခရမ်းချဉ်/.test(name)) return ['tomato'];
  if (/rubber|ရာဘာ|ရော်ဘာ/.test(name)) return ['rubber'];
  if (/mangosteen|မင်းကွတ်/.test(name)) return ['mangosteen'];
  if (/\bmango\b|သရက်/.test(name)) return ['mango'];
  if (/durian|ဒူးရင်း/.test(name)) return ['durian'];
  if (/longan|လောင်ဂန်|တညင်း/.test(name)) return ['longan'];
  return [];
}

export function isProcessedMarketProduct(rawName: string): boolean {
  const name = cleanText(rawName).toLowerCase();
  return /\b(oil|flour|powder|juice|jaggery)\b/.test(name);
}

export function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function optionalMarketText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = cleanText(value);
  return isMissingText(cleaned) ? null : cleaned;
}

export function parseNumber(value: string): number | null {
  const translated = translateMyanmarDigits(value)
    .replaceAll(',', '')
    .replaceAll('၊', '')
    .trim();
  if (!translated || isMissingText(translated)) return null;
  const numericTokens = translated.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g);
  if (numericTokens?.length !== 1) return null;
  const parsed = Number(numericTokens[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSourceDate(value: string): string | undefined {
  const cleaned = cleanText(translateMyanmarDigits(value)).replace(/\.$/, '');
  const isoMatch = cleaned.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) return validDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  const dmyMatch = cleaned.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (dmyMatch) return validDate(Number(dmyMatch[3]), Number(dmyMatch[2]), Number(dmyMatch[1]));
  const englishMatch = cleaned.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i,
  );
  if (englishMatch) {
    const month = new Date(`${englishMatch[1]} 1, 2000 UTC`).getUTCMonth() + 1;
    return validDate(Number(englishMatch[3]), month, Number(englishMatch[2]));
  }
  return undefined;
}

function validDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : undefined;
}

function translateMyanmarDigits(value: string): string {
  const digits: Record<string, string> = {
    '၀': '0',
    '၁': '1',
    '၂': '2',
    '၃': '3',
    '၄': '4',
    '၅': '5',
    '၆': '6',
    '၇': '7',
    '၈': '8',
    '၉': '9',
  };
  return [...value].map((character) => digits[character] ?? character).join('');
}

function isMissingText(value: string): boolean {
  return value === '' || value === '-' || value === '–' || value === '—';
}
