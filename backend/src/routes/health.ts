import type { FastifyInstance } from 'fastify';
import type { ModelServerGateway } from '../services/model-server-client.js';

export default async function healthRoutes(
  fastify: FastifyInstance,
  options: { modelServer: ModelServerGateway },
) {
  fastify.get('/live', async (request, reply) => {
    return reply.status(200).send({
      status: 'live',
      request_id: request.id,
      timestamp: new Date().toISOString(),
    });
  });

  fastify.get('/ready', async (request, reply) => {
    try {
      await options.modelServer.getReadiness(request.id);
      return reply.status(200).send({
        status: 'ready',
        request_id: request.id,
        model_server: 'ready',
        circuit_breaker: options.modelServer.getCircuitState(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      request.log.warn({ err: error, request_id: request.id }, 'Readiness check failed');
      return reply.status(503).send({
        status: 'not_ready',
        request_id: request.id,
        model_server: 'not_ready',
        circuit_breaker: options.modelServer.getCircuitState(),
        timestamp: new Date().toISOString(),
      });
    }
  });
}
