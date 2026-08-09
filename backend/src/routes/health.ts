import type { FastifyInstance } from 'fastify';
import type { AppStore } from '../db/store.js';
import type { ModelServerGateway } from '../services/model-server-client.js';

export default async function healthRoutes(
  fastify: FastifyInstance,
  options: { modelServer: ModelServerGateway; store?: AppStore },
) {
  fastify.get('/live', async (request, reply) => {
    return reply.status(200).send({
      status: 'live',
      request_id: request.id,
      timestamp: new Date().toISOString(),
    });
  });

  fastify.get('/ready', async (request, reply) => {
    const [modelResult, databaseResult] = await Promise.allSettled([
      checkModelService(options.modelServer, request.id),
      options.store ? options.store.ping() : Promise.reject(new Error('database not configured')),
    ]);
    const modelReady = modelResult.status === 'fulfilled';
    const databaseReady = databaseResult.status === 'fulfilled';
    const statusCode = modelReady && databaseReady ? 200 : 503;
    if (statusCode === 503) {
      request.log.warn(
        {
          request_id: request.id,
          model_check: modelReady ? 'ready' : 'failed',
          database_check: databaseReady ? 'ready' : 'failed',
        },
        'Readiness check failed',
      );
    }
    return reply.status(statusCode).send({
      status: statusCode === 200 ? 'ready' : 'not_ready',
      request_id: request.id,
      model_server: modelReady ? 'ready' : 'not_ready',
      database: databaseReady ? 'ready' : 'not_ready',
      circuit_breaker: options.modelServer.getCircuitState(),
      timestamp: new Date().toISOString(),
    });
  });
}

async function checkModelService(modelServer: ModelServerGateway, requestId: string): Promise<void> {
  await modelServer.getReadiness(requestId);
  await modelServer.getModels(requestId);
}
