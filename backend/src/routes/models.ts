import type { FastifyInstance } from 'fastify';
import type { ModelServerGateway } from '../services/model-server-client.js';

export default async function modelRoutes(
  fastify: FastifyInstance,
  options: {
    modelServer: ModelServerGateway;
    rateLimit: { max: number; timeWindow: number };
  },
) {
  fastify.get('/', { config: { rateLimit: options.rateLimit } }, async (request, reply) => {
    const catalog = await options.modelServer.getModels(request.id);
    return reply.status(200).send(catalog);
  });
}
