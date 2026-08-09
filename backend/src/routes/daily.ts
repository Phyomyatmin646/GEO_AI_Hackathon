import type { FastifyInstance } from 'fastify';

import type { AppStore, WeeklyRegionPrediction } from '../db/store.js';
import { AppError } from '../errors.js';
import { DateOnlySchema } from '../schemas/weekly.js';

type PersistedPrediction = {
  value?: unknown;
  unit?: unknown;
};

type LegacyRecommendation = [crop: string, score: number];

export default async function dailyCompatibilityRoutes(
  fastify: FastifyInstance,
  options: {
    store?: AppStore;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  fastify.get('/latest', { config: { rateLimit: options.rateLimit } }, async (_request, reply) => {
    const predictions = await latestPredictions(options.store);
    const first = predictions[0];
    if (!first) throw persistedPayloadInvalid();
    return reply.status(200).send({
      cadence: 'weekly',
      week_start: first.week_start,
      week_end: first.week_end,
      regions: predictions.map((prediction) => prediction.region),
      compatibility_route: true,
    });
  });

  fastify.get(
    '/:date/map',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      const store = requireStore(options.store);
      const date = (request.params as { date: string }).date;
      const predictions =
        date === 'latest'
          ? await latestPredictions(store)
          : await predictionsForDate(store, date);
      return reply.status(200).send(predictions.flatMap(toLegacyCells));
    },
  );
}

async function latestPredictions(store: AppStore | undefined): Promise<WeeklyRegionPrediction[]> {
  const configuredStore = requireStore(store);
  const predictions = await configuredStore.getLatestWeeklyPredictions();
  if (predictions.length === 0) {
    throw new AppError(404, 'WEEKLY_PREDICTIONS_NOT_FOUND', 'No active weekly predictions exist.');
  }
  return predictions;
}

async function predictionsForDate(
  store: AppStore,
  date: string,
): Promise<WeeklyRegionPrediction[]> {
  const parsed = DateOnlySchema.safeParse(date);
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_DATE', 'The compatibility date must use YYYY-MM-DD.');
  }
  const weekStart = mondayContaining(parsed.data);
  const predictions = await store.getWeeklyPredictions(weekStart);
  if (predictions.length > 0) return predictions;
  if (await store.hasExpiredWeeklyRun(weekStart)) {
    throw new AppError(410, 'WEEKLY_PREDICTIONS_EXPIRED', 'The weekly prediction payloads have expired.');
  }
  throw new AppError(404, 'WEEKLY_PREDICTIONS_NOT_FOUND', 'Weekly predictions were not found.');
}

function mondayContaining(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function toLegacyCells(prediction: WeeklyRegionPrediction): unknown[] {
  const payload = record(prediction.payload);
  const cells = payload.cells;
  if (!Array.isArray(cells)) throw persistedPayloadInvalid();
  const observationDate = previousDate(prediction.week_end);
  const coverage = recordOrEmpty(payload.coverage_metadata);
  const modelPolicy = recordOrEmpty(payload.model_policy);

  return cells.map((unknownCell) => {
    const cell = record(unknownCell);
    const predictionContainer = record(cell.predictions);
    const values = record(predictionContainer.values);
    const recommendations = numericCropRecommendations(values);
    const top = recommendations[0];
    const warnings: string[] = [];
    if (coverage.is_partial_week === true) warnings.push('The source week has partial coverage.');
    if (modelPolicy.crop_predictions_available !== true) {
      warnings.push('Flagged crop-suitability models are disabled.');
    }
    return {
      index: requiredString(cell.grid_id),
      grid_id: requiredString(cell.grid_id),
      region: prediction.region,
      lat: requiredFiniteNumber(cell.latitude),
      lon: requiredFiniteNumber(cell.longitude),
      observation_date: observationDate,
      week_start: prediction.week_start,
      week_end: prediction.week_end,
      source_date: observationDate,
      source_age_days: ageInDays(observationDate),
      predictions: values,
      recommendations,
      top_crop: top?.[0] ?? null,
      top_score: top?.[1] ?? null,
      color: null,
      data_quality: {
        coverage_metadata: coverage,
        warnings,
      },
    };
  });
}

function numericCropRecommendations(values: Record<string, unknown>): LegacyRecommendation[] {
  const recommendations: LegacyRecommendation[] = [];
  for (const [target, unknownPrediction] of Object.entries(values)) {
    if (!target.startsWith('crop_suitability_')) continue;
    const prediction = record(unknownPrediction) as PersistedPrediction;
    if (typeof prediction.value !== 'number' || !Number.isFinite(prediction.value)) continue;
    const score = prediction.unit === 'score_0_to_1' ? prediction.value * 100 : prediction.value;
    recommendations.push([target.slice('crop_suitability_'.length), score]);
  }
  return recommendations.sort((left, right) => right[1] - left[1]);
}

function previousDate(exclusiveDate: string): string {
  const date = new Date(`${exclusiveDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function ageInDays(dateOnly: string): number {
  const observed = new Date(`${dateOnly}T23:59:59.999Z`).getTime();
  return Math.max(0, Math.floor((Date.now() - observed) / (24 * 60 * 60_000)));
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw persistedPayloadInvalid();
  }
  return value as Record<string, unknown>;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw persistedPayloadInvalid();
  return value;
}

function requiredFiniteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw persistedPayloadInvalid();
  return value;
}

function requireStore(store: AppStore | undefined): AppStore {
  if (!store) {
    throw new AppError(
      503,
      'DATABASE_NOT_CONFIGURED',
      'Weekly persistence is unavailable because the database is not configured.',
    );
  }
  return store;
}

function persistedPayloadInvalid(): AppError {
  return new AppError(
    500,
    'PERSISTED_PREDICTION_INVALID',
    'Stored weekly prediction data is invalid.',
  );
}
