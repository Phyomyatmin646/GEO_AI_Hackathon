import type { FastifyInstance } from 'fastify';

import type { AppStore } from '../db/store.js';
import { AppError, RequestValidationError } from '../errors.js';
import { WeeklyIngestRequestSchema } from '../schemas/weekly.js';
import type { WeeklyOrchestrator } from '../services/weekly-orchestrator.js';
import type { MarketPriceService } from '../services/market-price-service.js';

export default async function internalRoutes(
  fastify: FastifyInstance,
  options: {
    store?: AppStore;
    orchestrator?: WeeklyOrchestrator;
    marketPriceService?: MarketPriceService;
    marketPriceRefreshEnabled: boolean;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  fastify.post(
    '/weekly/ingest',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      if (!options.orchestrator) throw databaseUnavailable();
      const parsed = WeeklyIngestRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new RequestValidationError(parsed.error.issues);
      const result = await options.orchestrator.run(parsed.data, request.id);
      return reply.status(200).send(result);
    },
  );

  fastify.post(
    '/predictions/cleanup',
    { config: { rateLimit: options.rateLimit } },
    async (_request, reply) => {
      if (!options.store) throw databaseUnavailable();
      const deleted = await options.store.cleanupExpiredPredictions();
      return reply.status(200).send({ deleted });
    },
  );

  fastify.post(
    '/market-prices/refresh',
    { config: { rateLimit: options.rateLimit } },
    async (_request, reply) => {
      if (!options.marketPriceRefreshEnabled) {
        throw new AppError(503, 'MARKET_PRICE_REFRESH_DISABLED', 'Market-price refresh is disabled.');
      }
      if (!options.marketPriceService) throw databaseUnavailable();
      const result = await options.marketPriceService.refresh();
      return reply.status(200).send(result);
    },
  );
}

function databaseUnavailable(): AppError {
  return new AppError(
    503,
    'DATABASE_NOT_CONFIGURED',
    'Weekly persistence is unavailable because the database is not configured.',
  );
}
