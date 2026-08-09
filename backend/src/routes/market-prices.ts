import type { FastifyInstance } from 'fastify';

import { CROP_KEYS } from '../contracts/weekly.js';
import { AppError, RequestValidationError } from '../errors.js';
import {
  CropKeySchema,
  MarketCommodityQuerySchema,
  MarketHistoryQuerySchema,
  MarketPriceQuerySchema,
} from '../schemas/market-prices.js';
import type { MarketPriceService } from '../services/market-price-service.js';

export default async function marketPriceRoutes(
  fastify: FastifyInstance,
  options: {
    service?: MarketPriceService;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  fastify.get('/latest', { config: { rateLimit: options.rateLimit } }, async (request, reply) => {
    const service = requireService(options.service);
    const query = MarketPriceQuerySchema.safeParse(request.query);
    if (!query.success) throw new RequestValidationError(query.error.issues);
    return reply.status(200).send(await service.latest(query.data));
  });

  fastify.get('/crops', { config: { rateLimit: options.rateLimit } }, async (_request, reply) =>
    reply.status(200).send({ crops: CROP_KEYS }),
  );

  fastify.get(
    '/commodities/latest',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      const service = requireService(options.service);
      const query = MarketCommodityQuerySchema.safeParse(request.query);
      if (!query.success) throw new RequestValidationError(query.error.issues);
      return reply.status(200).send(await service.commoditiesLatest(query.data));
    },
  );

  fastify.get(
    '/:crop/latest',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      const service = requireService(options.service);
      const crop = CropKeySchema.safeParse((request.params as { crop: string }).crop);
      if (!crop.success) throw new RequestValidationError(crop.error.issues);
      return reply.status(200).send(await service.latest({ crop: crop.data }));
    },
  );

  fastify.get(
    '/:crop/history',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      const service = requireService(options.service);
      const crop = CropKeySchema.safeParse((request.params as { crop: string }).crop);
      if (!crop.success) throw new RequestValidationError(crop.error.issues);
      const query = MarketHistoryQuerySchema.safeParse(request.query);
      if (!query.success) throw new RequestValidationError(query.error.issues);
      return reply.status(200).send(await service.history(crop.data, query.data.limit, query.data.offset));
    },
  );
}

function requireService(service: MarketPriceService | undefined): MarketPriceService {
  if (!service) {
    throw new AppError(
      503,
      'MARKET_PRICE_DATABASE_UNAVAILABLE',
      'Market-price persistence is unavailable because the database is not configured.',
    );
  }
  return service;
}
