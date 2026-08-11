import type { FastifyInstance } from 'fastify';

import { AppError, RequestValidationError } from '../errors.js';
import {
  CropCalendarLookupParamsSchema,
  CropCalendarLookupQuerySchema,
  CropCalendarRegionQuerySchema,
} from '../schemas/crop-calendars.js';
import type { CropCalendarService } from '../services/crop-calendar-service.js';

export default async function cropCalendarRoutes(
  fastify: FastifyInstance,
  options: {
    service?: CropCalendarService;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  fastify.get('/crops', { config: { rateLimit: options.rateLimit } }, async (_request, reply) => {
    return reply.status(200).send(await requireService(options.service).crops());
  });

  fastify.get('/', { config: { rateLimit: options.rateLimit } }, async (request, reply) => {
    const query = CropCalendarRegionQuerySchema.safeParse(request.query);
    if (!query.success) throw new RequestValidationError(query.error.issues);
    return reply.status(200).send(await requireService(options.service).byRegion(query.data.region));
  });

  fastify.get(
    '/:modelKey',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      const params = CropCalendarLookupParamsSchema.safeParse(request.params);
      if (!params.success) throw new RequestValidationError(params.error.issues);
      const query = CropCalendarLookupQuerySchema.safeParse(request.query);
      if (!query.success) throw new RequestValidationError(query.error.issues);
      const record = await requireService(options.service).one({
        modelKey: params.data.modelKey,
        ...query.data,
      });
      if (!record) {
        throw new AppError(
          404,
          'CROP_CALENDAR_NOT_FOUND',
          'No Crop Calendar record exists for the requested crop and location.',
        );
      }
      return reply.status(200).send({ calendar: record });
    },
  );
}

function requireService(service: CropCalendarService | undefined): CropCalendarService {
  if (!service) {
    throw new AppError(
      503,
      'CROP_CALENDAR_DATABASE_UNAVAILABLE',
      'Crop Calendar persistence is unavailable because the database is not configured.',
    );
  }
  return service;
}
