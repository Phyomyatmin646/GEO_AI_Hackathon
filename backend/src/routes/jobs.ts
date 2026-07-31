import { FastifyInstance } from 'fastify';
import { predictionQueue } from '../services/queue.js';
import { PredictionRequestSchema } from '../schemas/prediction.js';

export default async function (fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    try {
      const parsedRequest = PredictionRequestSchema.parse(request.body);
      
      const job = await predictionQueue.add('predict', parsedRequest);
      
      return reply.status(202).send({
        jobId: job.id,
        status: 'queued',
        message: 'Job submitted for async processing'
      });
    } catch (e: any) {
      if (e.message.includes('ECONNREFUSED')) {
        return reply.status(503).send({ error: 'Service Unavailable', message: 'Async queue is unavailable (Redis down)' });
      }
      return reply.status(400).send({ error: 'Bad Request', message: e.message });
    }
  });

  fastify.get('/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    
    try {
      const job = await predictionQueue.getJob(jobId);
      
      if (!job) {
        return reply.status(404).send({ error: 'Not Found', message: `Job ${jobId} not found` });
      }

      const state = await job.getState();
      
      if (state === 'completed') {
        return { jobId, status: state, result: job.returnvalue };
      }
      
      if (state === 'failed') {
        return { jobId, status: state, error: job.failedReason };
      }
      
      return { jobId, status: state };
    } catch (e: any) {
       return reply.status(500).send({ error: 'Internal Error', message: 'Error fetching job status' });
    }
  });

  fastify.delete('/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await predictionQueue.getJob(jobId);
    if (job) {
      await job.remove();
      return { status: 'removed' };
    }
    return reply.status(404).send({ error: 'Not Found' });
  });
}
