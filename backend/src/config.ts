import 'dotenv/config';

import { z } from 'zod';

import {
  AUDITED_MODEL_CATALOG_VERSION,
  MODEL_INPUT_SCHEMA_SHA256,
} from './contracts/weekly.js';

function booleanEnvironmentValue(defaultValue: boolean) {
  return z
    .enum(['true', 'false', '1', '0'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true' || value === '1');
}

const OptionalTimeout = z.coerce.number().int().min(100).max(120_000).optional();

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    API_KEY: z.string().min(16).optional(),
    INTERNAL_API_KEY: z.string().min(24).optional(),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1).optional(),

    GEO_MODEL_SERVER_URL: z.url().optional(),
    MODEL_SERVER_URL: z.url().optional(),
    GEO_MODEL_SERVER_API_KEY: z.string().min(24).optional(),
    MODEL_SERVER_API_KEY: z.string().min(24).optional(),
    MODEL_REQUEST_TIMEOUT_MS: OptionalTimeout,
    MODEL_SERVER_TIMEOUT_MS: OptionalTimeout,
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
    MODEL_SERVER_MAX_IN_FLIGHT: z.coerce.number().int().min(1).max(1_000).default(2),
    MODEL_EXPECTED_INPUT_SCHEMA_SHA256: z
      .literal(MODEL_INPUT_SCHEMA_SHA256)
      .default(MODEL_INPUT_SCHEMA_SHA256),
    MODEL_EXPECTED_CATALOG_VERSION: z
      .literal(AUDITED_MODEL_CATALOG_VERSION)
      .default(AUDITED_MODEL_CATALOG_VERSION),
    MODEL_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
    MODEL_MAX_CONCURRENT_BATCHES: z.coerce.number().int().min(1).max(1).default(1),
    ALLOW_FLAGGED_MODELS: booleanEnvironmentValue(false),
    ALLOW_INSECURE_MODEL_SERVER_HTTP: booleanEnvironmentValue(false),

    WEEKLY_DATA_DIR: z.string().min(1).default('../data/weekly'),
    WEEKLY_RUN_STALE_AFTER_MS: z.coerce
      .number()
      .int()
      .min(60 * 60_000)
      .max(7 * 24 * 60 * 60_000)
      .default(24 * 60 * 60_000),
    PREDICTION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
    PREDICTION_CLEANUP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 60 * 60_000)
      .default(6 * 60 * 60_000),

    MARKET_PRICE_REFRESH_ENABLED: booleanEnvironmentValue(true),
    MARKET_PRICE_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(120_000)
      .default(120_000),
    MARKET_PRICE_DOA_URL: z
      .url()
      .default(
        'https://www.doa.gov.mm/mis_market/index.php?filter_category=44&filter_seller=4&route=market%2Fweekly_crop_price_by_seller',
      ),
    MARKET_PRICE_MRF_URL: z
      .url()
      .default('https://www.myanmarricefederation.org/reference-domestic-price/'),
    MARKET_PRICE_CSO_URL: z
      .url()
      .default(
        'https://monpifer.gov.mm/en/basic-page/planning/central-statistical-organization-cso/20961',
      ),
    MARKET_PRICE_WISARRA_URL: z.url().default('https://wisarra.com/en/market-price'),

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
    ENABLE_ASYNC_JOBS: booleanEnvironmentValue(false),
  })
  .superRefine((environment, context) => {
    const modelServerApiKey =
      environment.GEO_MODEL_SERVER_API_KEY ?? environment.MODEL_SERVER_API_KEY;
    const productionRequirements: Array<[string, string | undefined]> = [
      ['API_KEY', environment.API_KEY],
      ['INTERNAL_API_KEY', environment.INTERNAL_API_KEY],
      ['DATABASE_URL', environment.DATABASE_URL],
      ['GEO_MODEL_SERVER_API_KEY', modelServerApiKey],
    ];
    if (environment.NODE_ENV === 'production') {
      for (const [name, value] of productionRequirements) {
        if (!value) {
          context.addIssue({
            code: 'custom',
            path: [name],
            message: `${name} is required in production`,
          });
        }
      }
      for (const [name, value] of productionRequirements) {
        if (value && name !== 'DATABASE_URL' && isPlaceholderSecret(value)) {
          context.addIssue({
            code: 'custom',
            path: [name],
            message: `${name} must not use an example or placeholder value in production`,
          });
        }
      }
    }

    const keys = [environment.API_KEY, environment.INTERNAL_API_KEY, modelServerApiKey].filter(
      (value): value is string => value !== undefined,
    );
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['INTERNAL_API_KEY'],
        message: 'API_KEY, INTERNAL_API_KEY, and GEO_MODEL_SERVER_API_KEY must differ',
      });
    }
  });

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  apiKey?: string;
  internalApiKey?: string;
  corsOrigins: string[];
  databaseUrl?: string;
  modelServerUrl: string;
  modelServerApiKey?: string;
  modelServerTimeoutMs: number;
  modelServerMaxResponseBytes: number;
  circuitFailureThreshold: number;
  circuitResetMs: number;
  modelCatalogCacheTtlMs: number;
  modelServerMaxMatchDistanceKm: number;
  modelServerMaxInFlight: number;
  modelExpectedInputSchemaSha256: string;
  modelExpectedCatalogVersion: string;
  modelBatchSize: number;
  modelMaxConcurrentBatches: number;
  allowFlaggedModels: boolean;
  weeklyDataDir: string;
  weeklyRunStaleAfterMs: number;
  predictionRetentionDays: number;
  predictionCleanupIntervalMs: number;
  marketPriceRefreshEnabled: boolean;
  marketPriceRequestTimeoutMs: number;
  marketPriceSourceUrls: {
    doa: string;
    mrf: string;
    cso: string;
    wisarra: string;
  };
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

  const rawModelServerUrl =
    parsed.data.GEO_MODEL_SERVER_URL ?? parsed.data.MODEL_SERVER_URL ?? 'http://127.0.0.1:8001';
  const modelServerUrl = new URL(rawModelServerUrl);
  if (
    !['http:', 'https:'].includes(modelServerUrl.protocol) ||
    modelServerUrl.username ||
    modelServerUrl.password ||
    (modelServerUrl.pathname !== '/' && modelServerUrl.pathname !== '') ||
    modelServerUrl.search ||
    modelServerUrl.hash
  ) {
    throw new Error(
      'Invalid backend configuration: GEO_MODEL_SERVER_URL must be an HTTP(S) origin without credentials or a path',
    );
  }
  if (
    parsed.data.NODE_ENV === 'production' &&
    modelServerUrl.protocol === 'http:' &&
    !parsed.data.ALLOW_INSECURE_MODEL_SERVER_HTTP
  ) {
    throw new Error(
      'Invalid backend configuration: production GEO_MODEL_SERVER_URL must use HTTPS unless ALLOW_INSECURE_MODEL_SERVER_HTTP=true for a trusted private network',
    );
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    logLevel: parsed.data.LOG_LEVEL,
    apiKey: parsed.data.API_KEY,
    internalApiKey: parsed.data.INTERNAL_API_KEY,
    corsOrigins,
    databaseUrl: parsed.data.DATABASE_URL,
    modelServerUrl: modelServerUrl.origin,
    modelServerApiKey:
      parsed.data.GEO_MODEL_SERVER_API_KEY ?? parsed.data.MODEL_SERVER_API_KEY,
    modelServerTimeoutMs:
      parsed.data.MODEL_REQUEST_TIMEOUT_MS ?? parsed.data.MODEL_SERVER_TIMEOUT_MS ?? 120_000,
    modelServerMaxResponseBytes: parsed.data.MODEL_SERVER_MAX_RESPONSE_BYTES,
    circuitFailureThreshold: parsed.data.MODEL_SERVER_CIRCUIT_FAILURE_THRESHOLD,
    circuitResetMs: parsed.data.MODEL_SERVER_CIRCUIT_RESET_MS,
    modelCatalogCacheTtlMs: parsed.data.MODEL_SERVER_CATALOG_CACHE_TTL_MS,
    modelServerMaxMatchDistanceKm: parsed.data.MODEL_SERVER_MAX_MATCH_DISTANCE_KM,
    modelServerMaxInFlight: parsed.data.MODEL_SERVER_MAX_IN_FLIGHT,
    modelExpectedInputSchemaSha256: parsed.data.MODEL_EXPECTED_INPUT_SCHEMA_SHA256.toLowerCase(),
    modelExpectedCatalogVersion: parsed.data.MODEL_EXPECTED_CATALOG_VERSION.toLowerCase(),
    modelBatchSize: parsed.data.MODEL_BATCH_SIZE,
    modelMaxConcurrentBatches: parsed.data.MODEL_MAX_CONCURRENT_BATCHES,
    allowFlaggedModels: parsed.data.ALLOW_FLAGGED_MODELS,
    weeklyDataDir: parsed.data.WEEKLY_DATA_DIR,
    weeklyRunStaleAfterMs: parsed.data.WEEKLY_RUN_STALE_AFTER_MS,
    predictionRetentionDays: parsed.data.PREDICTION_RETENTION_DAYS,
    predictionCleanupIntervalMs: parsed.data.PREDICTION_CLEANUP_INTERVAL_MS,
    marketPriceRefreshEnabled: parsed.data.MARKET_PRICE_REFRESH_ENABLED,
    marketPriceRequestTimeoutMs: parsed.data.MARKET_PRICE_REQUEST_TIMEOUT_MS,
    marketPriceSourceUrls: {
      doa: parsed.data.MARKET_PRICE_DOA_URL,
      mrf: parsed.data.MARKET_PRICE_MRF_URL,
      cso: parsed.data.MARKET_PRICE_CSO_URL,
      wisarra: parsed.data.MARKET_PRICE_WISARRA_URL,
    },
    rateLimitMax: parsed.data.RATE_LIMIT_MAX,
    rateLimitWindowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
    bodyLimitBytes: parsed.data.BODY_LIMIT_BYTES,
    asyncJobsEnabled: parsed.data.ENABLE_ASYNC_JOBS,
  };
}
