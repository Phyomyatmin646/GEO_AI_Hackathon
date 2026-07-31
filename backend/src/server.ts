import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { registry } from './services/registry.js';
import healthRoutes from './routes/health.js';
import modelRoutes from './routes/models.js';
import predictionRoutes from './routes/predictions.js';
import jobRoutes from './routes/jobs.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' }
    }
  }
});

// Middleware
server.register(cors, { 
  origin: process.env.CORS_ORIGIN || '*' 
});

server.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

// Load Models on startup
const manifestPath = path.resolve(__dirname, '../models/manifest.json');
try {
  registry.loadManifest(manifestPath);
} catch (e) {
  server.log.error("Could not load model manifest on startup");
}

// Routes
server.register(healthRoutes, { prefix: '/health' });
server.register(modelRoutes, { prefix: '/api/v1/models' });
server.register(predictionRoutes, { prefix: '/api/v1/predictions' });
server.register(jobRoutes, { prefix: '/api/v1/jobs' });

// Global Error Handler for safe errors without stack traces
server.setErrorHandler(function (error: any, request, reply) {
  this.log.error(error);
  // Hide stack trace in production
  reply.status(error.statusCode || 500).send({ 
    error: error.name,
    message: error.message 
  });
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8000');
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`Backend listening on ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

// Graceful Shutdown
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, async () => {
    server.log.info(`Received ${signal}. Shutting down gracefully...`);
    await server.close();
    process.exit(0);
  });
});
