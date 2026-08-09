import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppStore } from '../db/store.js';
import { AppError, RequestValidationError } from '../errors.js';
import {
  PipelineRunsQuerySchema,
  WeeklyIngestRequestSchema,
} from '../schemas/weekly.js';
import type { WeeklyOrchestrator } from '../services/weekly-orchestrator.js';

const RunIdSchema = z.uuid();

export default async function pipelineRoutes(
  fastify: FastifyInstance,
  options: {
    store?: AppStore;
    orchestrator?: WeeklyOrchestrator;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  fastify.post(
    '/weekly/run',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      if (!options.orchestrator) throw databaseUnavailable();
      const parsed = WeeklyIngestRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new RequestValidationError(parsed.error.issues);
      const result = await options.orchestrator.run(parsed.data, request.id);
      return reply.status(200).send(result);
    },
  );

  fastify.get('/runs', { config: { rateLimit: options.rateLimit } }, async (request, reply) => {
    if (!options.store) throw databaseUnavailable();
    const query = PipelineRunsQuerySchema.safeParse(request.query);
    if (!query.success) throw new RequestValidationError(query.error.issues);
    const runs = await options.store.listPipelineRuns(query.data.limit, query.data.offset);
    return reply.status(200).send({ runs, pagination: query.data });
  });

  fastify.get(
    '/runs/:id',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => {
      if (!options.store) throw databaseUnavailable();
      const parsedId = RunIdSchema.safeParse((request.params as { id?: unknown }).id);
      if (!parsedId.success) throw new RequestValidationError(parsedId.error.issues);
      const run = await options.store.getPipelineRun(parsedId.data);
      if (!run) throw new AppError(404, 'PIPELINE_RUN_NOT_FOUND', 'Pipeline run was not found.');
      return reply.status(200).send(run);
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
