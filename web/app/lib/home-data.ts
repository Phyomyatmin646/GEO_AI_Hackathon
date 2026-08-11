import type { PilotBundle } from "./pilot-data";

export type HomePeriod = "latest" | "pilot";
export type HomeDataMode = "weekly" | "historical";

export type HomePrediction = {
  value: number | string | null;
  unit: string | null;
  taskType: string | null;
  confidence: number | null;
  validationStatus: string | null;
  modelVersion: string | null;
  warnings: string[];
};

export type HomeWeeklyCell = {
  gridId: string;
  latitude: number;
  longitude: number;
  predictions: Record<string, HomePrediction>;
  errors: Record<string, string>;
};

export type HomeLiveState = {
  mode: HomeDataMode;
  requestedPeriod: HomePeriod;
  weekStart: string | null;
  weekEnd: string | null;
  observationDate: string | null;
  modelCatalogVersion: string | null;
  cropPredictionsAvailable: boolean;
  allowFlaggedModels: boolean;
  coverageRatio: number | null;
  isPartialWeek: boolean;
  unavailableReason: string | null;
  cells: HomeWeeklyCell[];
};

export type HomePayload = PilotBundle & {
  live: HomeLiveState;
};

export type HomeCropRecommendation = {
  cropId: string;
  score: number;
  prediction: HomePrediction;
};

export function homeWeeklyCellMap(
  live: HomeLiveState,
): Map<string, HomeWeeklyCell> {
  return new Map(live.cells.map((cell) => [cell.gridId, cell]));
}

export function numericPrediction(
  cell: HomeWeeklyCell | undefined,
  target: string,
): number | null {
  const value = cell?.predictions[target]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function predictionScore(
  cell: HomeWeeklyCell | undefined,
  target: string,
): number | null {
  const prediction = cell?.predictions[target];
  if (!prediction || typeof prediction.value !== "number" || !Number.isFinite(prediction.value)) {
    return null;
  }
  return prediction.unit === "score_0_to_1"
    ? prediction.value * 100
    : prediction.value;
}

export function weeklyCropRecommendations(
  cell: HomeWeeklyCell | undefined,
): HomeCropRecommendation[] {
  if (!cell) return [];
  return Object.entries(cell.predictions)
    .flatMap(([target, prediction]) => {
      if (!target.startsWith("crop_suitability_")) return [];
      const score = predictionScore(cell, target);
      return score === null
        ? []
        : [{
            cropId: target.slice("crop_suitability_".length),
            score,
            prediction,
          }];
    })
    .sort((left, right) => right.score - left.score);
}

export function homeMapScore(cell: HomeWeeklyCell | undefined): {
  score: number;
  label: string;
  kind: "crop" | "health";
} | null {
  const crop = weeklyCropRecommendations(cell)[0];
  if (crop) return { score: crop.score, label: crop.cropId, kind: "crop" };
  const health = predictionScore(cell, "crop_health_score");
  return health === null
    ? null
    : { score: health, label: "crop_health_score", kind: "health" };
}
