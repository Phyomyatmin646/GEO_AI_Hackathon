import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import {
  ModelPredictionSchema,
  PredictionRequestSchema,
} from '../src/schemas/prediction.js';

describe('configuration', () => {
  it('uses the separate local model-server port by default', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.modelServerUrl).toBe('http://127.0.0.1:8001');
    expect(config.port).toBe(8000);
    expect(config.modelServerTimeoutMs).toBe(120_000);
    expect(config.modelBatchSize).toBe(50);
    expect(config.allowFlaggedModels).toBe(false);
    expect(config.weeklyRunStaleAfterMs).toBe(24 * 60 * 60_000);
    expect(config.predictionRetentionDays).toBe(7);
    expect(config.marketPriceRequestTimeoutMs).toBe(120_000);
    expect(config.rateLimitWindowMs).toBe(60_000);
  });

  it('requires public, pipeline, model, and database credentials in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/API_KEY/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/INTERNAL_API_KEY/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/GEO_MODEL_SERVER_API_KEY/);
  });

  it('requires a 24-character internal key', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'test', MODEL_SERVER_API_KEY: 'too-short-internal-key' }),
    ).toThrow(/MODEL_SERVER_API_KEY/);
  });

  it('rejects production placeholders, shared keys, and insecure model URLs by default', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        API_KEY: 'local-public-key-change-me',
        INTERNAL_API_KEY: 'pipeline-production-key-1234',
        DATABASE_URL: 'postgresql://example.invalid/database',
        GEO_MODEL_SERVER_API_KEY: 'local-internal-key-change-me',
        GEO_MODEL_SERVER_URL: 'https://models.example.org',
      }),
    ).toThrow(/placeholder/);

    const sharedKey = 'production-key-1234567890';
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        API_KEY: sharedKey,
        INTERNAL_API_KEY: 'pipeline-production-key-1234',
        DATABASE_URL: 'postgresql://example.invalid/database',
        GEO_MODEL_SERVER_API_KEY: sharedKey,
        GEO_MODEL_SERVER_URL: 'https://models.example.org',
      }),
    ).toThrow(/must differ/);

    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        API_KEY: 'public-production-key-1234',
        INTERNAL_API_KEY: 'pipeline-production-key-1234',
        DATABASE_URL: 'postgresql://example.invalid/database',
        GEO_MODEL_SERVER_API_KEY: 'model-production-key-123456',
        GEO_MODEL_SERVER_URL: 'http://models.internal:8001',
      }),
    ).toThrow(/must use HTTPS/);
  });

  it('allows explicit private-network HTTP and validates a numeric rate window', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      API_KEY: 'public-production-key-1234',
      INTERNAL_API_KEY: 'pipeline-production-key-1234',
      DATABASE_URL: 'postgresql://example.invalid/database',
      GEO_MODEL_SERVER_API_KEY: 'model-production-key-123456',
      GEO_MODEL_SERVER_URL: 'http://models.internal:8001',
      ALLOW_INSECURE_MODEL_SERVER_HTTP: 'true',
      RATE_LIMIT_WINDOW_MS: '30000',
    });
    expect(config.modelServerUrl).toBe('http://models.internal:8001');
    expect(config.rateLimitWindowMs).toBe(30_000);
    expect(() => loadConfig({ NODE_ENV: 'test', RATE_LIMIT_WINDOW_MS: 'soon' })).toThrow(
      /RATE_LIMIT_WINDOW_MS/,
    );
  });

  it('prefers the GEO model aliases and keeps all three trust boundaries distinct', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      API_KEY: 'public-secret-123456',
      INTERNAL_API_KEY: 'pipeline-secret-123456789',
      GEO_MODEL_SERVER_API_KEY: 'geo-model-secret-123456789',
      MODEL_SERVER_API_KEY: 'legacy-model-secret-123456',
      GEO_MODEL_SERVER_URL: 'https://geo-model.example.test',
      MODEL_SERVER_URL: 'https://legacy-model.example.test',
    });
    expect(config.modelServerApiKey).toBe('geo-model-secret-123456789');
    expect(config.modelServerUrl).toBe('https://geo-model.example.test');
  });

  it('rejects wildcard CORS configuration', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', CORS_ORIGINS: '*' })).toThrow(
      /explicit allowlist/,
    );
  });

  it('refuses environment-only schema or catalog drift', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'test', MODEL_EXPECTED_INPUT_SCHEMA_SHA256: 'a'.repeat(64) }),
    ).toThrow(/MODEL_EXPECTED_INPUT_SCHEMA_SHA256/);
    expect(() =>
      loadConfig({ NODE_ENV: 'test', MODEL_EXPECTED_CATALOG_VERSION: 'b'.repeat(64) }),
    ).toThrow(/MODEL_EXPECTED_CATALOG_VERSION/);
  });
});

describe('prediction request contract', () => {
  it('accepts a strict sample_id request', () => {
    const result = PredictionRequestSchema.safeParse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
      composite_features: ['crop_health'],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.include_all_targets).toBe(false);
  });

  it('accepts the model server sample ID range and an explicit empty composite list', () => {
    expect(
      PredictionRequestSchema.safeParse({
        sample_id: 'မြန်မာ-grid-sample',
        targets: ['crop_health_score'],
        composite_features: [],
      }).success,
    ).toBe(true);
  });

  it('accepts a complete coordinate and month locator', () => {
    expect(
      PredictionRequestSchema.safeParse({
        lat: 16.8661,
        lon: 96.1951,
        observation_month: '2024-01',
        include_all_targets: true,
      }).success,
    ).toBe(true);
  });

  it('accepts a composite-only request without a dummy model target', () => {
    expect(
      PredictionRequestSchema.safeParse({
        sample_id: 'sample-001',
        composite_features: ['economic_roi'],
      }).success,
    ).toBe(true);
  });

  it.each([
    { payload: { targets: ['crop_health_score'] }, description: 'missing locator' },
    {
      payload: { sample_id: 'sample-001', lat: 16, lon: 96, observation_month: '2024-01' },
      description: 'two locators',
    },
    { payload: { lat: 16, lon: 96 }, description: 'partial coordinate locator' },
    { payload: { sample_id: 'sample-001' }, description: 'missing target selection' },
    {
      payload: {
        lat: 1,
        lon: 96,
        observation_month: '2024-01',
        targets: ['crop_health_score'],
      },
      description: 'coordinates outside Myanmar',
    },
    {
      payload: { sample_id: 'sample-001', targets: ['not_a_model'] },
      description: 'unknown target',
    },
    {
      payload: { sample_id: 'sample-001', composite_features: ['not_a_composite'] },
      description: 'unknown composite',
    },
    {
      payload: {
        sample_id: 'sample-001',
        targets: ['crop_health_score'],
        include_all_targets: true,
      },
      description: 'ambiguous target selection',
    },
    {
      payload: { sample_id: 'sample-001', unexpected: true },
      description: 'unknown request field',
    },
  ])('rejects $description', ({ payload }) => {
    expect(PredictionRequestSchema.safeParse(payload).success).toBe(false);
  });
});

describe('prediction output contract', () => {
  const common = {
    unit: 'risk_class',
    model_version: '1.0.0',
    artifact_sha256: 'a'.repeat(64),
    input_schema_sha256: 'b'.repeat(64),
    model_source: 'primary',
    deployment_status: 'experimental',
    validation_status: 'healthy',
    warnings: [],
  } as const;

  it('enforces regression nullability', () => {
    expect(
      ModelPredictionSchema.safeParse({
        ...common,
        value: 0.8,
        label: null,
        task_type: 'regression',
        confidence: 0.9,
        probabilities: null,
      }).success,
    ).toBe(false);
  });

  it('enforces internally consistent uncalibrated tree-vote classification shape', () => {
    expect(
      ModelPredictionSchema.safeParse({
        ...common,
        value: 'high',
        label: 'high',
        task_type: 'classification',
        confidence: 0.8,
        confidence_kind: 'random_forest_vote_share_uncalibrated',
        probabilities: { low: 0.2, high: 0.8 },
      }).success,
    ).toBe(true);
    expect(
      ModelPredictionSchema.safeParse({
        ...common,
        value: 'high',
        label: 'high',
        task_type: 'classification',
        confidence: 0.7,
        confidence_kind: 'random_forest_vote_share_uncalibrated',
        probabilities: { low: 0.2, high: 0.8 },
      }).success,
    ).toBe(false);
  });
});
