export const CROP_CALENDAR_MODEL_KEYS = [
  "crop_suitability_monsoon_rice",
  "crop_suitability_dry_season_rice",
  "crop_suitability_black_gram",
  "crop_suitability_green_gram",
  "crop_suitability_maize",
  "crop_suitability_groundnut",
  "crop_suitability_chili",
  "crop_suitability_sesame",
  "crop_suitability_sugarcane",
  "crop_suitability_cassava",
  "crop_suitability_tomato",
  "crop_suitability_pigeon_pea",
  "crop_suitability_rubber",
  "crop_suitability_mango",
  "crop_suitability_durian",
  "crop_suitability_mangosteen",
  "crop_suitability_longan",
] as const;

export const CROP_CALENDAR_REGIONS = [
  "Ayeyarwady",
  "Bago",
  "Mandalay",
  "Sagaing",
  "Magway",
  "Yangon",
] as const;

export type CropCalendarModelKey = (typeof CROP_CALENDAR_MODEL_KEYS)[number];
export type CropCalendarRegion = (typeof CROP_CALENDAR_REGIONS)[number];

export type CropCalendarCrop = {
  model_key: CropCalendarModelKey;
  crop_name_en: string;
  crop_name_mm: string;
  crop_type: "annual" | "perennial";
};

export type CropCalendarMonthWindow = {
  start_month: number | null;
  end_month: number | null;
  start_label_en: string | null;
  start_label_mm: string | null;
  end_label_en: string | null;
  end_label_mm: string | null;
  label_en: string | null;
  label_mm: string | null;
  is_complete: boolean;
};

export type CropCalendarRecord = CropCalendarCrop & {
  region: CropCalendarRegion;
  township: string | null;
  season: string | null;
  planting: CropCalendarMonthWindow | null;
  harvest: CropCalendarMonthWindow | null;
  growing_duration: { min_days: number | null; max_days: number | null } | null;
  establishment: CropCalendarMonthWindow | null;
  first_harvest: { min_years: number | null; max_years: number | null } | null;
  harvest_season: CropCalendarMonthWindow | null;
  verification: {
    status:
      | "verified"
      | "needs_verification"
      | "insufficient_evidence"
      | "not_applicable"
      | "not_recommended";
    confidence: number | null;
    label_en: string;
    label_mm: string;
  };
  evidence_type: string | null;
  geographic_specificity: string | null;
  source: {
    code: string | null;
    organization: string | null;
    title: string | null;
    url: string | null;
    publication_year: number | null;
  } | null;
  notes: { en: string | null; mm: string | null; data_quality: string | null } | null;
  last_verified_date: string | null;
  last_updated: string;
  dataset_version: string;
};

export type CropCalendarCropsResponse = { crops: CropCalendarCrop[] };
export type CropCalendarsResponse = { calendars: CropCalendarRecord[] };
export type CropCalendarResponse = { calendar: CropCalendarRecord };

export type CropCalendarLookupQuery = {
  region: CropCalendarRegion;
  season?: string;
};

export class CropCalendarValidationError extends Error {
  constructor() {
    super("The Crop Calendar request is invalid.");
    this.name = "CropCalendarValidationError";
  }
}

const modelKeySet = new Set<string>(CROP_CALENDAR_MODEL_KEYS);
const regionAliases = new Map<string, CropCalendarRegion>([
  ["ayeyarwady", "Ayeyarwady"],
  ["ayeyawaddy", "Ayeyarwady"],
  ["bago", "Bago"],
  ["mandalay", "Mandalay"],
  ["sagaing", "Sagaing"],
  ["magway", "Magway"],
  ["yangon", "Yangon"],
]);

export function parseCropCalendarModelKey(value: string): CropCalendarModelKey {
  if (!modelKeySet.has(value)) throw new CropCalendarValidationError();
  return value as CropCalendarModelKey;
}

export function parseCropCalendarLookupQuery(
  searchParams: URLSearchParams,
): CropCalendarLookupQuery {
  assertAllowedQuery(searchParams, ["region", "season"]);
  return {
    region: requiredRegion(searchParams),
    season: optionalText(searchParams, "season", 160),
  };
}

export function parseCropCalendarRegionQuery(searchParams: URLSearchParams): {
  region: CropCalendarRegion;
} {
  assertAllowedQuery(searchParams, ["region"]);
  return { region: requiredRegion(searchParams) };
}

export function assertNoCropCalendarQuery(searchParams: URLSearchParams): void {
  assertAllowedQuery(searchParams, []);
}

export function isCropCalendarCropsResponse(value: unknown): value is CropCalendarCropsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.crops) &&
    value.crops.length <= CROP_CALENDAR_MODEL_KEYS.length &&
    value.crops.every(isCropCalendarCrop) &&
    new Set(value.crops.map((crop) => crop.model_key)).size === value.crops.length
  );
}

export function isCropCalendarsResponse(value: unknown): value is CropCalendarsResponse {
  return isRecord(value) && Array.isArray(value.calendars) && value.calendars.every(isCalendar);
}

export function isCropCalendarResponse(value: unknown): value is CropCalendarResponse {
  return isRecord(value) && isCalendar(value.calendar);
}

function isCropCalendarCrop(
  value: unknown,
): value is CropCalendarCrop & Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.model_key === "string" &&
    modelKeySet.has(value.model_key) &&
    typeof value.crop_name_en === "string" &&
    typeof value.crop_name_mm === "string" &&
    (value.crop_type === "annual" || value.crop_type === "perennial")
  );
}

function isCalendar(value: unknown): value is CropCalendarRecord {
  if (
    !isRecord(value) ||
    !isCropCalendarCrop(value) ||
    !CROP_CALENDAR_REGIONS.includes(value.region as CropCalendarRegion) ||
    !isNullableString(value.township) ||
    !isNullableString(value.season) ||
    !isNullableMonthWindow(value.planting) ||
    !isNullableMonthWindow(value.harvest) ||
    !isNullablePair(value.growing_duration, "min_days", "max_days") ||
    !isNullableMonthWindow(value.establishment) ||
    !isNullablePair(value.first_harvest, "min_years", "max_years") ||
    !isNullableMonthWindow(value.harvest_season) ||
    !isVerification(value.verification) ||
    !isNullableString(value.evidence_type) ||
    !isNullableString(value.geographic_specificity) ||
    !isNullableSource(value.source) ||
    !isNullableNotes(value.notes) ||
    !(value.last_verified_date === null || isIsoDate(value.last_verified_date)) ||
    !isIsoDate(value.last_updated) ||
    typeof value.dataset_version !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.dataset_version)
  ) {
    return false;
  }
  return value.crop_type === "annual"
    ? value.establishment === null && value.first_harvest === null && value.harvest_season === null
    : value.planting === null && value.harvest === null && value.growing_duration === null;
}

function isMonthWindow(value: unknown): value is CropCalendarMonthWindow {
  return (
    isRecord(value) &&
    isNullableMonth(value.start_month) &&
    isNullableMonth(value.end_month) &&
    isNullableString(value.start_label_en) &&
    isNullableString(value.start_label_mm) &&
    isNullableString(value.end_label_en) &&
    isNullableString(value.end_label_mm) &&
    isNullableString(value.label_en) &&
    isNullableString(value.label_mm) &&
    typeof value.is_complete === "boolean" &&
    value.is_complete === (value.start_month !== null && value.end_month !== null)
  );
}

function isNullableMonthWindow(value: unknown): value is CropCalendarMonthWindow | null {
  return value === null || isMonthWindow(value);
}

function isNullablePair(value: unknown, minimum: string, maximum: string): boolean {
  return (
    value === null ||
    (isRecord(value) && isNullableNonNegativeNumber(value[minimum]) && isNullableNonNegativeNumber(value[maximum]))
  );
}

function isVerification(value: unknown): boolean {
  return (
    isRecord(value) &&
    ["verified", "needs_verification", "insufficient_evidence", "not_applicable", "not_recommended"].includes(String(value.status)) &&
    isNullableNonNegativeNumber(value.confidence) &&
    (value.confidence === null || value.confidence <= 1) &&
    typeof value.label_en === "string" &&
    typeof value.label_mm === "string"
  );
}

function isNullableSource(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      isNullableString(value.code) &&
      isNullableString(value.organization) &&
      isNullableString(value.title) &&
      (value.url === null || isSafeHttpUrl(value.url)) &&
      (value.publication_year === null ||
        (Number.isInteger(value.publication_year) &&
          Number(value.publication_year) >= 1800 &&
          Number(value.publication_year) <= 2100)))
  );
}

function isNullableNotes(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      isNullableString(value.en) &&
      isNullableString(value.mm) &&
      isNullableString(value.data_quality))
  );
}

function requiredRegion(searchParams: URLSearchParams): CropCalendarRegion {
  const values = searchParams.getAll("region");
  if (values.length !== 1) throw new CropCalendarValidationError();
  const region = regionAliases.get(values[0]!.trim().toLocaleLowerCase("en"));
  if (!region) throw new CropCalendarValidationError();
  return region;
}

function assertAllowedQuery(searchParams: URLSearchParams, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) {
      throw new CropCalendarValidationError();
    }
  }
}

function optionalText(
  searchParams: URLSearchParams,
  key: string,
  maximumLength: number,
): string | undefined {
  const values = searchParams.getAll(key);
  if (values.length === 0) return undefined;
  if (values.length !== 1) throw new CropCalendarValidationError();
  const value = values[0]!.trim();
  if (!value || value.length > maximumLength || hasControlCharacter(value)) {
    throw new CropCalendarValidationError();
  }
  return value;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableMonth(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 12);
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
