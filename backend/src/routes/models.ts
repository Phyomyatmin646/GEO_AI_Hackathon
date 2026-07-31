import { FastifyInstance } from 'fastify';
import { registry } from '../services/registry.js';

export default async function (fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    return registry.getAllModels();
  });

  fastify.get('/:modelId', async (request, reply) => {
    const { modelId } = request.params as { modelId: string };
    const model = registry.getModel(modelId);
    
    if (!model) {
      return reply.status(404).send({ error: 'Not Found', message: `Model ${modelId} not found` });
    }
    
    return model;
  });
}
