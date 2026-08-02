import 'dotenv/config';

import { z } from 'zod';

const BooleanEnvironmentValue = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    API_KEY: z.string().min(16).optional(),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    MODEL_SERVER_URL: z.url().default('http://127.0.0.1:8001'),
    MODEL_SERVER_API_KEY: z.string().min(24).optional(),
    MODEL_SERVER_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(40_000),
    MODEL_SERVER_MAX_RESPONSE_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(50 * 1024 * 1024)
      .default(5 * 1024 * 1024),
    MODEL_SERVER_CIRCUIT_FAILURE_THRESHOLD: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(3),
    MODEL_SERVER_CIRCUIT_RESET_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(10 * 60_000)
      .default(30_000),
    MODEL_SERVER_CATALOG_CACHE_TTL_MS: z.coerce
      .number()
      .int()
      .min(0)
      .max(10 * 60_000)
      .default(30_000),
    MODEL_SERVER_MAX_MATCH_DISTANCE_KM: z.coerce
      .number()
      .finite()
      .positive()
      .max(100)
      .default(8),
    // The UI issues one crop-tier and one detail request together. Allow the
    // second request to reach the model server's bounded single-worker queue.
    MODEL_SERVER_MAX_IN_FLIGHT: z.coerce.number().int().min(1).max(1_000).default(2),
    ALLOW_INSECURE_MODEL_SERVER_HTTP: BooleanEnvironmentValue,
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(24 * 60 * 60_000)
      .default(60_000),
    BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(10 * 1024 * 1024)
      .default(64 * 1024),
    ENABLE_ASYNC_JOBS: BooleanEnvironmentValue,
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === 'production' && !environment.API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['API_KEY'],
        message: 'API_KEY is required in production',
      });
    }
    if (environment.NODE_ENV === 'production' && !environment.MODEL_SERVER_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['MODEL_SERVER_API_KEY'],
        message: 'MODEL_SERVER_API_KEY is required in production',
      });
    }
    if (environment.NODE_ENV === 'production' && environment.API_KEY && isPlaceholderSecret(environment.API_KEY)) {
      context.addIssue({
        code: 'custom',
        path: ['API_KEY'],
        message: 'API_KEY must not use an example or placeholder value in production',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.MODEL_SERVER_API_KEY &&
      isPlaceholderSecret(environment.MODEL_SERVER_API_KEY)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['MODEL_SERVER_API_KEY'],
        message: 'MODEL_SERVER_API_KEY must not use an example or placeholder value in production',
      });
    }
    if (
      environment.API_KEY &&
      environment.MODEL_SERVER_API_KEY &&
      environment.API_KEY === environment.MODEL_SERVER_API_KEY
    ) {
      context.addIssue({
        code: 'custom',
        path: ['MODEL_SERVER_API_KEY'],
        message: 'MODEL_SERVER_API_KEY must differ from API_KEY',
      });
    }
  });

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  apiKey?: string;
  corsOrigins: string[];
  modelServerUrl: string;
  modelServerApiKey?: string;
  modelServerTimeoutMs: number;
  modelServerMaxResponseBytes: number;
  circuitFailureThreshold: number;
  circuitResetMs: number;
  modelCatalogCacheTtlMs: number;
  modelServerMaxMatchDistanceKm: number;
  modelServerMaxInFlight: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  bodyLimitBytes: number;
  asyncJobsEnabled: boolean;
};

const PLACEHOLDER_SECRET_PATTERNS = [
  /^change[-_]?me/i,
  /^replace[-_]?me/i,
  /^example[-_]/i,
  /^local[-_]/i,
  /^dev[-_]/i,
  /^test[-_]/i,
  /change[-_]?me$/i,
  /replace[-_]?before[-_]?production/i,
];

function isPlaceholderSecret(value: string): boolean {
  return PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid backend configuration: ${details}`);
  }

  const corsOrigins = parsed.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.length === 0 || corsOrigins.includes('*')) {
    throw new Error('Invalid backend configuration: CORS_ORIGINS must be an explicit allowlist');
  }
  for (const origin of corsOrigins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error(`Invalid backend configuration: invalid CORS origin ${origin}`);
    }
  }

  const modelServerUrl = new URL(parsed.data.MODEL_SERVER_URL);
  if (
    !['http:', 'https:'].includes(modelServerUrl.protocol) ||
    modelServerUrl.username ||
    modelServerUrl.password ||
    (modelServerUrl.pathname !== '/' && modelServerUrl.pathname !== '') ||
    modelServerUrl.search ||
    modelServerUrl.hash
  ) {
    throw new Error(
      'Invalid backend configuration: MODEL_SERVER_URL must be an HTTP(S) origin without credentials or a path',
    );
  }
  if (
    parsed.data.NODE_ENV === 'production' &&
    modelServerUrl.protocol === 'http:' &&
    !parsed.data.ALLOW_INSECURE_MODEL_SERVER_HTTP
  ) {
    throw new Error(
      'Invalid backend configuration: production MODEL_SERVER_URL must use HTTPS unless ALLOW_INSECURE_MODEL_SERVER_HTTP=true for a trusted private network',
    );
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    logLevel: parsed.data.LOG_LEVEL,
    apiKey: parsed.data.API_KEY,
    corsOrigins,
    modelServerUrl: modelServerUrl.origin,
    modelServerApiKey: parsed.data.MODEL_SERVER_API_KEY,
    modelServerTimeoutMs: parsed.data.MODEL_SERVER_TIMEOUT_MS,
    modelServerMaxResponseBytes: parsed.data.MODEL_SERVER_MAX_RESPONSE_BYTES,
    circuitFailureThreshold: parsed.data.MODEL_SERVER_CIRCUIT_FAILURE_THRESHOLD,
    circuitResetMs: parsed.data.MODEL_SERVER_CIRCUIT_RESET_MS,
    modelCatalogCacheTtlMs: parsed.data.MODEL_SERVER_CATALOG_CACHE_TTL_MS,
    modelServerMaxMatchDistanceKm: parsed.data.MODEL_SERVER_MAX_MATCH_DISTANCE_KM,
    modelServerMaxInFlight: parsed.data.MODEL_SERVER_MAX_IN_FLIGHT,
    rateLimitMax: parsed.data.RATE_LIMIT_MAX,
    rateLimitWindowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
    bodyLimitBytes: parsed.data.BODY_LIMIT_BYTES,
    asyncJobsEnabled: parsed.data.ENABLE_ASYNC_JOBS,
  };
}
