import { FastifyInstance } from 'fastify';
import { registry } from '../services/registry.js';

export default async function (fastify: FastifyInstance) {
  fastify.get('/live', async (request, reply) => {
    return { status: 'OK', timestamp: new Date().toISOString() };
  });

  fastify.get('/ready', async (request, reply) => {
    const models = registry.getAllModels();
    
    // Check if any REQUIRED model is unavailable or degraded
    // For this implementation, we assume if we have 0 models loaded, it's not ready
    if (models.length === 0) {
      return reply.status(503).send({ status: 'UNAVAILABLE', reason: 'No models loaded' });
    }

    const unreadyModels = models.filter(m => m.status === 'unavailable' || m.status === 'degraded');
    if (unreadyModels.length > 0) {
      // Depending on strictness, we might still return 200 OK but list them, or 503
      // We'll return 200 but warn.
      return { 
        status: 'READY_WITH_WARNINGS', 
        warnings: unreadyModels.map(m => `Model ${m.modelId} is ${m.status}`),
        timestamp: new Date().toISOString() 
      };
    }

    return { status: 'READY', timestamp: new Date().toISOString() };
  });
}
