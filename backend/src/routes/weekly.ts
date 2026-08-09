import type { FastifyInstance } from 'fastify';

import { normalizeRegion } from '../contracts/weekly.js';
import type { AppStore } from '../db/store.js';
import { AppError, RequestValidationError } from '../errors.js';
import { WeekStartSchema } from '../schemas/weekly.js';

export default async function weeklyRoutes(
  fastify: FastifyInstance,
  options: {
    store?: AppStore;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  fastify.get('/latest', { config: { rateLimit: options.rateLimit } }, async (_request, reply) => {
    const store = requireStore(options.store);
    const predictions = await store.getLatestWeeklyPredictions();
    if (predictions.length === 0) {
      throw new AppError(404, 'WEEKLY_PREDICTIONS_NOT_FOUND', 'No active weekly predictions exist.');
    }
    return reply.status(200).send(weeklyEnvelope(predictions));
  });

  fastify.get(
    '/:weekStart/:region',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      const store = requireStore(options.store);
      const params = request.params as { weekStart: string; region: string };
      const week = WeekStartSchema.safeParse(params.weekStart);
      if (!week.success) throw new RequestValidationError(week.error.issues);
      const region = normalizeRegion(params.region);
      if (!region) throw new AppError(400, 'INVALID_REGION', 'Region is not supported.');
      const prediction = await store.getWeeklyRegionPrediction(week.data, region);
      if (!prediction) {
        const expired = await store.hasExpiredWeeklyRun(week.data, region);
        if (expired) {
          throw new AppError(410, 'WEEKLY_PREDICTION_EXPIRED', 'The weekly prediction payload has expired.');
        }
        throw new AppError(404, 'WEEKLY_PREDICTION_NOT_FOUND', 'Weekly prediction was not found.');
      }
      return reply.status(200).send(prediction);
    },
  );

  fastify.get(
    '/:weekStart',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      const store = requireStore(options.store);
      const week = WeekStartSchema.safeParse((request.params as { weekStart: string }).weekStart);
      if (!week.success) throw new RequestValidationError(week.error.issues);
      const predictions = await store.getWeeklyPredictions(week.data);
      if (predictions.length === 0) {
        const expired = await store.hasExpiredWeeklyRun(week.data);
        if (expired) {
          throw new AppError(410, 'WEEKLY_PREDICTIONS_EXPIRED', 'The weekly prediction payloads have expired.');
        }
        throw new AppError(404, 'WEEKLY_PREDICTIONS_NOT_FOUND', 'Weekly predictions were not found.');
      }
      return reply.status(200).send(weeklyEnvelope(predictions));
    },
  );
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

function weeklyEnvelope(predictions: Awaited<ReturnType<AppStore['getWeeklyPredictions']>>) {
  const first = predictions[0];
  if (!first) throw new Error('Cannot build an empty weekly envelope.');
  return {
    week_start: first.week_start,
    week_end: first.week_end,
    model_catalog_version: first.model_catalog_version,
    schema_version: first.schema_version,
    regions: predictions,
  };
}
