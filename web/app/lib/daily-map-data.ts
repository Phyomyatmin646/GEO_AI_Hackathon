export type DailyPrediction = {
  value: number | string | null;
  label: string | null;
  unit: string | null;
};

export type DailyRecommendation = [crop: string, score: number];

export type DailyMapCell = {
  index: string;
  gridId: string;
  region: string;
  latitude: number;
  longitude: number;
  observationDate: string;
  weekStart: string;
  weekEnd: string;
  sourceDate: string;
  sourceAgeDays: number;
  predictions: Record<string, DailyPrediction>;
  recommendations: DailyRecommendation[];
  topCrop: string | null;
  topScore: number | null;
  color: string | null;
  warnings: string[];
};

export type DailyMapCellView = DailyMapCell & {
  polygon: [number, number][] | null;
};

type UnknownRecord = Record<string, unknown>;

const DATE_ONLY_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TARGET_PATTERN = /^[a-z][a-z0-9_]{0,119}$/;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function string(value: unknown, maximumLength = 500): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength
    ? value
    : null;
}

function optionalString(value: unknown, maximumLength = 500): string | null {
  return value === null || value === undefined ? null : string(value, maximumLength);
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateOnly(value: unknown): string | null {
  const parsed = string(value, 10);
  if (!parsed || !DATE_ONLY_PATTERN.test(parsed)) return null;
  const date = new Date(`${parsed}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === parsed
    ? parsed
    : null;
}

function prediction(value: unknown): DailyPrediction | null {
  const source = record(value);
  if (!source || !("value" in source)) return null;
  const rawValue = source.value;
  if (
    rawValue !== null &&
    !(typeof rawValue === "number" && Number.isFinite(rawValue)) &&
    !(typeof rawValue === "string" && rawValue.length <= 500)
  ) {
    return null;
  }
  const label = optionalString(source.label, 500);
  const unit = optionalString(source.unit, 160);
  if (
    source.label !== null && source.label !== undefined && label === null ||
    source.unit !== null && source.unit !== undefined && unit === null
  ) {
    return null;
  }
  return { value: rawValue as number | string | null, label, unit };
}

function recommendation(value: unknown): DailyRecommendation | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const crop = string(value[0], 120);
  const score = number(value[1]);
  return crop && score !== null ? [crop, score] : null;
}

function warnings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(
    (warning) => typeof warning === "string" && warning.length <= 500,
  )
    ? value
    : null;
}

function dailyCell(value: unknown): DailyMapCell | null {
  const source = record(value);
  const index = string(source?.index, 160);
  const gridId = string(source?.grid_id, 160);
  const region = string(source?.region, 80)?.toLocaleLowerCase("en") ?? null;
  const latitude = number(source?.lat);
  const longitude = number(source?.lon);
  const observationDate = dateOnly(source?.observation_date);
  const weekStart = dateOnly(source?.week_start);
  const weekEnd = dateOnly(source?.week_end);
  const sourceDate = dateOnly(source?.source_date);
  const sourceAgeDays = number(source?.source_age_days);
  const rawPredictions = record(source?.predictions);
  const rawRecommendations = source?.recommendations;
  const quality = record(source?.data_quality);
  const parsedWarnings = warnings(quality?.warnings);
  if (
    !source ||
    !index ||
    !/^mm_\d+_\d+$/.test(index) ||
    gridId !== index ||
    !region ||
    latitude === null || latitude < 9 || latitude > 29 ||
    longitude === null || longitude < 92 || longitude > 102 ||
    !observationDate ||
    !weekStart ||
    !weekEnd ||
    !sourceDate ||
    sourceAgeDays === null || !Number.isInteger(sourceAgeDays) || sourceAgeDays < 0 ||
    !rawPredictions ||
    !Array.isArray(rawRecommendations) ||
    !parsedWarnings
  ) {
    return null;
  }

  const predictions: Record<string, DailyPrediction> = {};
  for (const [target, rawPrediction] of Object.entries(rawPredictions)) {
    if (!TARGET_PATTERN.test(target)) return null;
    const parsed = prediction(rawPrediction);
    if (!parsed) return null;
    predictions[target] = parsed;
  }
  const recommendations = rawRecommendations.map(recommendation);
  if (recommendations.some((item) => item === null)) return null;
  const topCrop = optionalString(source.top_crop, 120);
  const topScore = source.top_score === null ? null : number(source.top_score);
  const color = optionalString(source.color, 80);
  if (
    source.top_crop !== null && topCrop === null ||
    source.top_score !== null && topScore === null ||
    source.color !== null && source.color !== undefined && color === null
  ) {
    return null;
  }
  return {
    index,
    gridId,
    region,
    latitude,
    longitude,
    observationDate,
    weekStart,
    weekEnd,
    sourceDate,
    sourceAgeDays,
    predictions,
    recommendations: recommendations as DailyRecommendation[],
    topCrop,
    topScore,
    color,
    warnings: parsedWarnings,
  };
}

export function decodeDailyMapPayload(value: unknown): DailyMapCell[] | null {
  if (!Array.isArray(value)) return null;
  const cells = value.map(dailyCell);
  if (cells.some((cell) => cell === null)) return null;
  const parsed = cells as DailyMapCell[];
  return new Set(parsed.map((cell) => cell.index)).size === parsed.length ? parsed : null;
}

function polygon(value: unknown): [number, number][] | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const points: [number, number][] = [];
  for (const rawPoint of value) {
    if (!Array.isArray(rawPoint) || rawPoint.length !== 2) return null;
    const latitude = number(rawPoint[0]);
    const longitude = number(rawPoint[1]);
    if (
      latitude === null || latitude < 9 || latitude > 29 ||
      longitude === null || longitude < 92 || longitude > 102
    ) {
      return null;
    }
    points.push([latitude, longitude]);
  }
  return points;
}

export function decodeDailyMapViewPayload(value: unknown): DailyMapCellView[] | null {
  if (!Array.isArray(value)) return null;
  const views: DailyMapCellView[] = [];
  for (const rawView of value) {
    const source = record(rawView);
    const cell = dailyCell(rawView);
    if (!source || !cell) return null;
    const parsedPolygon = source.polygon === null ? null : polygon(source.polygon);
    if (source.polygon !== null && !parsedPolygon) return null;
    views.push({ ...cell, polygon: parsedPolygon });
  }
  return new Set(views.map((cell) => cell.index)).size === views.length ? views : null;
}
