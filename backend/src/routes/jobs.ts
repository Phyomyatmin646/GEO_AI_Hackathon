import type { FastifyInstance } from 'fastify';

export default async function jobRoutes(
  fastify: FastifyInstance,
  options: {
    enabled: boolean;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  const disabledResponse = (requestId: string) => ({
    error: {
      code: options.enabled ? 'ASYNC_JOBS_NOT_IMPLEMENTED' : 'ASYNC_JOBS_DISABLED',
      message: options.enabled
        ? 'Asynchronous jobs are not available in this release.'
        : 'Asynchronous jobs are disabled.',
    },
    request_id: requestId,
  });

  fastify.post(
    '/',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => reply.status(503).send(disabledResponse(request.id)),
  );
  fastify.get(
    '/:jobId',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => reply.status(503).send(disabledResponse(request.id)),
  );
  fastify.delete(
    '/:jobId',
    { config: { rateLimit: options.rateLimit } },
    async (request, reply) => reply.status(503).send(disabledResponse(request.id)),
  );
}
