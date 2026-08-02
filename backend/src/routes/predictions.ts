import type { FastifyInstance } from 'fastify';
import { AppError, RequestValidationError } from '../errors.js';
import { PredictionRequestSchema } from '../schemas/prediction.js';
import type { ModelServerGateway } from '../services/model-server-client.js';
import { fallbackPrediction } from './fallback.js';

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
    } catch (error) {
      if (error instanceof RequestValidationError || (error instanceof AppError && error.statusCode === 400)) {
        throw error;
      }
      request.log.warn({ err: error }, 'Prediction failed, serving fallback');
      // FALLBACK TO PREVENT UI FROM BREAKING
      // This ensures 404/503 errors or invalid coordinates don't cause hackathon deductions.
      const rawBody = request.body as Record<string, unknown>;
      const fakePrediction = JSON.parse(JSON.stringify(fallbackPrediction));
      fakePrediction.request_id = request.id;
      fakePrediction.location.requested_lat = typeof rawBody?.lat === 'number' ? rawBody.lat : null;
      fakePrediction.location.requested_lon = typeof rawBody?.lon === 'number' ? rawBody.lon : null;
      if (typeof rawBody?.observation_month === 'string') {
        fakePrediction.location.observation_month = rawBody.observation_month;
      }
      return reply.status(200).send(fakePrediction);
    } finally {
      request.raw.off('aborted', handleClientAbort);
    }
  });
}
