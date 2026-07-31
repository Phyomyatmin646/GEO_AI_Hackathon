import { Queue, Worker, Job } from 'bullmq';
import { registry } from './registry.js';
import { PredictionRequest } from '../schemas/prediction.js';

// Use environment variables or fallback
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379')
};

export const predictionQueue = new Queue('predictions', { connection: redisConnection });

export const predictionWorker = new Worker('predictions', async (job: Job<PredictionRequest>) => {
  const request = job.data;
  
  if (!request.modelId) {
    throw new Error("modelId is required for jobs currently");
  }

  const model = registry.getModel(request.modelId);
  if (!model) {
    throw new Error(`Model ${request.modelId} not found`);
  }

  if (model.status !== 'ready') {
    throw new Error(`Model ${model.modelId} is currently ${model.status}`);
  }

  const adapter = registry.getAdapter(model.adapterType);
  const result = await adapter.predict(model, request);
  
  return result;
}, { connection: redisConnection });

predictionWorker.on('completed', (job) => {
  console.log(`${job.id} has completed!`);
});

predictionWorker.on('failed', (job, err) => {
  console.error(`${job?.id} has failed with ${err.message}`);
});
