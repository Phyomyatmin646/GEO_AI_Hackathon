import type { FastifyInstance } from 'fastify';
import { AppError, RequestValidationError } from '../errors.js';
import { PredictionRequestSchema } from '../schemas/prediction.js';
import type { ModelServerGateway } from '../services/model-server-client.js';

export default async function predictionRoutes(
  fastify: FastifyInstance,
  options: {
    modelServer: ModelServerGateway;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  fastify.post('/', { config: { rateLimit: options.rateLimit } }, async (request, reply) => {
    const parsedRequest = PredictionRequestSchema.safeParse(request.body);

    const controller = new AbortController();
    const handleClientAbort = () => controller.abort();
    request.raw.once('aborted', handleClientAbort);
    try {
      if (!parsedRequest.success) {
        throw new RequestValidationError(parsedRequest.error.issues);
      }

      if (parsedRequest.data.request_id && parsedRequest.data.request_id !== request.id) {
        throw new AppError(
          400,
          'REQUEST_ID_MISMATCH',
          'request_id must match the authoritative X-Request-ID value.',
        );
      }

      const prediction = await options.modelServer.predict(
        parsedRequest.data,
        request.id,
        controller.signal,
      );
      return reply.status(200).send(prediction);
    } finally {
      request.raw.off('aborted', handleClientAbort);
    }
  });
}
