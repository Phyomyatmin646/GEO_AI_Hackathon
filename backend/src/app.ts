import { randomUUID, timingSafeEqual } from 'node:crypto';

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyServerOptions } from 'fastify';

import type { AppConfig } from './config.js';
import { AppError, RequestValidationError } from './errors.js';
import healthRoutes from './routes/health.js';
import jobRoutes from './routes/jobs.js';
import modelRoutes from './routes/models.js';
import predictionRoutes from './routes/predictions.js';
import {
  ModelServerClient,
  type ModelServerGateway,
} from './services/model-server-client.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type BuildAppOptions = {
  config: AppConfig;
  modelServer?: ModelServerGateway;
  logger?: FastifyServerOptions['logger'];
};

export async function buildApp(options: BuildAppOptions) {
  const { config } = options;
  const logger =
    options.logger ??
    (config.nodeEnv === 'test'
      ? false
      : config.nodeEnv === 'development'
        ? {
            level: config.logLevel,
            transport: {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            },
            redact: [
              'req.headers.authorization',
              'req.headers.x-api-key',
              'req.headers.x-internal-api-key',
            ],
          }
        : {
            level: config.logLevel,
            redact: [
              'req.headers.authorization',
              'req.headers.x-api-key',
              'req.headers.x-internal-api-key',
            ],
          });

  const server = Fastify({
    logger,
    bodyLimit: config.bodyLimitBytes,
    genReqId(request) {
      const suppliedRequestId = request.headers['x-request-id'];
      return typeof suppliedRequestId === 'string' && REQUEST_ID_PATTERN.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    },
  });
  const modelServer = options.modelServer ?? new ModelServerClient(config);

  await server.register(cors, {
    origin: config.corsOrigins,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  });
  await server.register(rateLimit, {
    global: false,
  });

  server.addHook('onRequest', async (request, reply) => {
    reply.headers({
      'X-Request-ID': request.id,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Cache-Control': 'no-store',
    });
    if (config.nodeEnv === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  });

  server.addHook('onRequest', async (request) => {
    if (
      request.method === 'OPTIONS' ||
      !request.url.startsWith('/api/v1/') ||
      !config.apiKey
    ) {
      return;
    }
    const candidate = request.headers['x-api-key'];
    if (typeof candidate !== 'string' || !safeKeyEquals(candidate, config.apiKey)) {
      throw new AppError(401, 'UNAUTHORIZED', 'A valid API key is required.');
    }
  });

  server.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error, request_id: request.id }, 'Request failed');

    if (error instanceof RequestValidationError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.publicMessage,
          details: error.issues,
        },
        request_id: request.id,
      });
    }
    if (error instanceof AppError) {
      if (error.retryAfterSeconds !== undefined) {
        reply.header('Retry-After', String(error.retryAfterSeconds));
      }
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.publicMessage },
        request_id: request.id,
      });
    }
    const frameworkStatus = getStatusCode(error);
    if (frameworkStatus && frameworkStatus >= 400 && frameworkStatus < 500) {
      const frameworkError = safeFrameworkError(frameworkStatus);
      return reply.status(frameworkStatus).send({
        error: frameworkError,
        request_id: request.id,
      });
    }

    return reply.status(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
      request_id: request.id,
    });
  });

  server.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint does not exist.',
      },
      request_id: request.id,
    });
  });

  await server.register(healthRoutes, { modelServer, prefix: '/health' });
  const apiRateLimit = { max: config.rateLimitMax, timeWindow: config.rateLimitWindowMs };
  await server.register(modelRoutes, {
    modelServer,
    rateLimit: apiRateLimit,
    prefix: '/api/v1/models',
  });
  await server.register(predictionRoutes, {
    modelServer,
    rateLimit: apiRateLimit,
    prefix: '/api/v1/predictions',
  });
  await server.register(jobRoutes, {
    enabled: config.asyncJobsEnabled,
    rateLimit: apiRateLimit,
    prefix: '/api/v1/jobs',
  });

  return server;
}

function safeKeyEquals(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

function getStatusCode(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode;
  }
  return undefined;
}

function safeFrameworkError(statusCode: number): { code: string; message: string } {
  const knownErrors: Record<number, { code: string; message: string }> = {
    400: { code: 'INVALID_REQUEST', message: 'The request could not be parsed.' },
    401: { code: 'UNAUTHORIZED', message: 'Authentication is required.' },
    403: { code: 'FORBIDDEN', message: 'The request is not permitted.' },
    404: { code: 'NOT_FOUND', message: 'The requested endpoint does not exist.' },
    405: { code: 'METHOD_NOT_ALLOWED', message: 'The HTTP method is not supported.' },
    413: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' },
    415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'The request content type is not supported.' },
    429: { code: 'RATE_LIMITED', message: 'Too many requests were sent.' },
  };
  return (
    knownErrors[statusCode] ?? {
      code: 'REQUEST_REJECTED',
      message: 'The request was rejected.',
    }
  );
}
