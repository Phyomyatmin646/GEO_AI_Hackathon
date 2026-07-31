import { FastifyInstance } from 'fastify';
import { registry } from '../services/registry.js';
import { PredictionRequestSchema } from '../schemas/prediction.js';

export default async function (fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    // 1. Validate Input exactly using Zod
    const parsedRequest = PredictionRequestSchema.safeParse(request.body);
    
    if (!parsedRequest.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid input features or missing fields',
        details: parsedRequest.error.issues
      });
    }

    const data = parsedRequest.data;

    // 2. Select Model
    let modelId = data.modelId;
    if (!modelId && data.task && data.crop && data.region) {
      // Deterministic fallback based on fields
      modelId = `crop_${data.task}_${data.crop}`; 
    }

    if (!modelId) {
       return reply.status(400).send({ error: 'Bad Request', message: 'Unable to determine model selection' });
    }

    const model = registry.getModel(modelId);
    if (!model) {
      return reply.status(404).send({ error: 'Not Found', message: `Model ${modelId} not found in registry` });
    }

    if (model.status === 'pending') {
      return reply.status(503).send({ error: 'Service Unavailable', message: 'MODEL_NOT_READY' });
    }

    // 3. Inference Adapter
    try {
      const adapter = registry.getAdapter(model.adapterType);
      const prediction = await adapter.predict(model, data);
      return prediction;
    } catch (e: any) {
      request.log.error(e);
      return reply.status(500).send({ error: 'Inference Error', message: e.message });
    }
  });

  fastify.post('/batch', async (request, reply) => {
     // Naive synchronous batch for small sets. Large sets should use /jobs
     if (!Array.isArray(request.body)) {
       return reply.status(400).send({ error: 'Bad Request', message: 'Body must be an array of requests' });
     }

     const results = [];
     for (const req of request.body) {
        // Validation and execution loop... (Simplified for now)
        const parsedRequest = PredictionRequestSchema.safeParse(req);
        if (!parsedRequest.success) {
            results.push({ error: 'Validation Error', requestId: req.requestId });
            continue;
        }
        
        const data = parsedRequest.data;
        const model = registry.getModel(data.modelId!);
        if (!model || model.status === 'pending') {
            results.push({ error: 'Model Error', requestId: req.requestId });
            continue;
        }

        const adapter = registry.getAdapter(model.adapterType);
        try {
            const pred = await adapter.predict(model, data);
            results.push(pred);
        } catch (e: any) {
            results.push({ error: 'Inference Error', requestId: req.requestId });
        }
     }

     return results;
  });
}
