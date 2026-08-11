export const MARKET_CROP_KEYS = [
  "monsoon_rice",
  "dry_season_rice",
  "black_gram",
  "green_gram",
  "maize",
  "groundnut",
  "chili",
  "sesame",
  "sugarcane",
  "cassava",
  "tomato",
  "pigeon_pea",
  "rubber",
  "mango",
  "durian",
  "mangosteen",
  "longan",
] as const;

export type MarketCropKey = (typeof MARKET_CROP_KEYS)[number];

export type MarketLatestQuery = {
  crop?: MarketCropKey;
  region?: string;
  source?: string;
};

export type MarketCommodityLatestQuery = {
  source?: string;
  region?: string;
  limit?: number;
  offset?: number;
};

export type MarketHistoryQuery = {
  limit?: number;
  offset?: number;
};

export type MarketPriceUnavailable = {
  crop: MarketCropKey;
  status: "no_current_data";
};

export type MarketPriceAvailable = {
  crop: MarketCropKey;
  status: "available";
  source: string;
  commodity_name_raw: string;
  variety: string | null;
  region: string | null;
  marketplace: string | null;
  price_min: string | null;
  price_max: string | null;
  currency: string;
  quantity: string;
  unit: string;
  source_date: string;
  source_url: string;
  fetched_at: string;
  is_stale: boolean;
  is_season_specific: boolean | null;
};

export type MarketLatestPrice = MarketPriceAvailable | MarketPriceUnavailable;

export type MarketLatestResponse = {
  label: string;
  fetched_at: string;
  prices: MarketLatestPrice[];
};

export type MarketCropsResponse = {
  crops: MarketCropKey[];
};

export type MarketPriceHistoryItem = {
  id: string;
  crop_key: MarketCropKey;
  commodity_name_raw: string;
  variety: string | null;
  region: string | null;
  marketplace: string | null;
  price_min: string | null;
  price_max: string | null;
  currency: string;
  quantity: string;
  unit: string;
  source_name: string;
  source_date: string;
  source_url: string;
  fetched_at: string;
  raw_payload: unknown;
  created_at: string;
};

export type MarketHistoryResponse = {
  crop: MarketCropKey;
  prices: MarketPriceHistoryItem[];
  pagination: {
    limit: number;
    offset: number;
  };
};

export type MarketCommodity = {
  commodity_name_raw: string;
  variety: string | null;
  region: string | null;
  marketplace: string | null;
  price_min: string | null;
  price_max: string | null;
  currency: string;
  quantity: string;
  unit: string;
  source: string;
  source_date: string;
  source_url: string;
  fetched_at: string;
  model_crop_keys: MarketCropKey[];
  is_model_crop: boolean;
};

export type MarketCommodityLatestResponse = {
  label: string;
  fetched_at: string;
  source: string;
  source_date: string | null;
  commodities: MarketCommodity[];
  pagination: {
    limit: number;
    offset: number;
    returned: number;
    total: number;
    has_more: boolean;
    next_offset: number | null;
  };
};

export class MarketQueryValidationError extends Error {
  constructor() {
    super("The market-price request query is invalid.");
    this.name = "MarketQueryValidationError";
  }
}

const cropKeySet = new Set<string>(MARKET_CROP_KEYS);

export function isMarketCropKey(value: unknown): value is MarketCropKey {
  return typeof value === "string" && cropKeySet.has(value);
}

export function parseMarketCropKey(value: string): MarketCropKey {
  if (!isMarketCropKey(value)) throw new MarketQueryValidationError();
  return value;
}

export function assertNoMarketQuery(searchParams: URLSearchParams): void {
  assertAllowedQuery(searchParams, []);
}

export function parseMarketLatestQuery(searchParams: URLSearchParams): MarketLatestQuery {
  assertAllowedQuery(searchParams, ["crop", "region", "source"]);
  const crop = optionalSingleValue(searchParams, "crop");
  return {
    crop: crop === undefined ? undefined : parseMarketCropKey(crop),
    region: optionalText(searchParams, "region", 100),
    source: optionalText(searchParams, "source", 200),
  };
}

export function parseMarketCommodityLatestQuery(
  searchParams: URLSearchParams,
): MarketCommodityLatestQuery {
  assertAllowedQuery(searchParams, ["source", "region", "limit", "offset"]);
  return {
    source: optionalText(searchParams, "source", 200),
    region: optionalText(searchParams, "region", 100),
    limit: optionalInteger(searchParams, "limit", 1, 500),
    offset: optionalInteger(searchParams, "offset", 0, 10_000),
  };
}

export function parseMarketHistoryQuery(searchParams: URLSearchParams): MarketHistoryQuery {
  assertAllowedQuery(searchParams, ["limit", "offset"]);
  return {
    limit: optionalInteger(searchParams, "limit", 1, 500),
    offset: optionalInteger(searchParams, "offset", 0, Number.MAX_SAFE_INTEGER),
  };
}

export function isMarketLatestResponse(value: unknown): value is MarketLatestResponse {
  if (
    !isRecord(value) ||
    typeof value.label !== "string" ||
    typeof value.fetched_at !== "string" ||
    !Array.isArray(value.prices) ||
    !value.prices.every(isMarketLatestPrice)
  ) {
    return false;
  }
  const crops = value.prices.map((price) => price.crop);
  return new Set(crops).size === crops.length;
}

export function isMarketCropsResponse(value: unknown): value is MarketCropsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.crops) &&
    value.crops.length === MARKET_CROP_KEYS.length &&
    value.crops.every((crop, index) => crop === MARKET_CROP_KEYS[index])
  );
}

export function isMarketHistoryResponse(value: unknown): value is MarketHistoryResponse {
  return (
    isRecord(value) &&
    isMarketCropKey(value.crop) &&
    Array.isArray(value.prices) &&
    value.prices.every(isMarketPriceHistoryItem) &&
    isRecord(value.pagination) &&
    isNonNegativeInteger(value.pagination.limit) &&
    isNonNegativeInteger(value.pagination.offset)
  );
}

export function isMarketCommodityLatestResponse(
  value: unknown,
): value is MarketCommodityLatestResponse {
  if (
    !isRecord(value) ||
    typeof value.label !== "string" ||
    typeof value.fetched_at !== "string" ||
    typeof value.source !== "string" ||
    !isNullableString(value.source_date) ||
    !Array.isArray(value.commodities) ||
    !value.commodities.every(isMarketCommodity) ||
    !isRecord(value.pagination)
  ) {
    return false;
  }
  const pagination = value.pagination;
  return (
    isNonNegativeInteger(pagination.limit) &&
    isNonNegativeInteger(pagination.offset) &&
    isNonNegativeInteger(pagination.returned) &&
    isNonNegativeInteger(pagination.total) &&
    typeof pagination.has_more === "boolean" &&
    (pagination.next_offset === null || isNonNegativeInteger(pagination.next_offset)) &&
    pagination.returned === value.commodities.length &&
    pagination.returned <= pagination.total
  );
}

function isMarketLatestPrice(value: unknown): value is MarketLatestPrice {
  if (!isRecord(value) || !isMarketCropKey(value.crop)) return false;
  if (value.status === "no_current_data") return true;
  return (
    value.status === "available" &&
    typeof value.source === "string" &&
    typeof value.commodity_name_raw === "string" &&
    isNullableString(value.variety) &&
    isNullableString(value.region) &&
    isNullableString(value.marketplace) &&
    isNullableString(value.price_min) &&
    isNullableString(value.price_max) &&
    typeof value.currency === "string" &&
    typeof value.quantity === "string" &&
    typeof value.unit === "string" &&
    typeof value.source_date === "string" &&
    typeof value.source_url === "string" &&
    typeof value.fetched_at === "string" &&
    typeof value.is_stale === "boolean" &&
    (value.is_season_specific === null || typeof value.is_season_specific === "boolean")
  );
}

function isMarketPriceHistoryItem(value: unknown): value is MarketPriceHistoryItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isMarketCropKey(value.crop_key) &&
    typeof value.commodity_name_raw === "string" &&
    isNullableString(value.variety) &&
    isNullableString(value.region) &&
    isNullableString(value.marketplace) &&
    isNullableString(value.price_min) &&
    isNullableString(value.price_max) &&
    typeof value.currency === "string" &&
    typeof value.quantity === "string" &&
    typeof value.unit === "string" &&
    typeof value.source_name === "string" &&
    typeof value.source_date === "string" &&
    typeof value.source_url === "string" &&
    typeof value.fetched_at === "string" &&
    "raw_payload" in value &&
    typeof value.created_at === "string"
  );
}

function isMarketCommodity(value: unknown): value is MarketCommodity {
  return (
    isRecord(value) &&
    typeof value.commodity_name_raw === "string" &&
    isNullableString(value.variety) &&
    isNullableString(value.region) &&
    isNullableString(value.marketplace) &&
    isNullableString(value.price_min) &&
    isNullableString(value.price_max) &&
    typeof value.currency === "string" &&
    typeof value.quantity === "string" &&
    typeof value.unit === "string" &&
    typeof value.source === "string" &&
    typeof value.source_date === "string" &&
    typeof value.source_url === "string" &&
    typeof value.fetched_at === "string" &&
    Array.isArray(value.model_crop_keys) &&
    value.model_crop_keys.every(isMarketCropKey) &&
    new Set(value.model_crop_keys).size === value.model_crop_keys.length &&
    typeof value.is_model_crop === "boolean" &&
    value.is_model_crop === (value.model_crop_keys.length > 0)
  );
}

function assertAllowedQuery(
  searchParams: URLSearchParams,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) {
      throw new MarketQueryValidationError();
    }
  }
}

function optionalSingleValue(searchParams: URLSearchParams, key: string): string | undefined {
  const values = searchParams.getAll(key);
  if (values.length === 0) return undefined;
  if (values.length !== 1) throw new MarketQueryValidationError();
  return values[0];
}

function optionalText(
  searchParams: URLSearchParams,
  key: string,
  maximumLength: number,
): string | undefined {
  const value = optionalSingleValue(searchParams, key);
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > maximumLength) {
    throw new MarketQueryValidationError();
  }
  return trimmed;
}

function optionalInteger(
  searchParams: URLSearchParams,
  key: string,
  minimum: number,
  maximum: number,
): number | undefined {
  const value = optionalSingleValue(searchParams, key);
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new MarketQueryValidationError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new MarketQueryValidationError();
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
