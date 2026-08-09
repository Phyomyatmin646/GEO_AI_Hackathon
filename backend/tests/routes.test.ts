import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { ModelServerGateway } from '../src/services/model-server-client.js';
import {
  MemoryStore,
  batchResponseFixture,
  modelCatalogFixture,
  predictionFixture,
  readinessFixture,
  testConfig,
} from './helpers.js';

function fakeModelServer(overrides: Partial<ModelServerGateway> = {}): ModelServerGateway {
  return {
    predict: vi.fn(async (_request, requestId) => predictionFixture(requestId)),
    batchInfer: vi.fn(async (request) => batchResponseFixture(request)),
    getModels: vi.fn(async () => modelCatalogFixture()),
    getReadiness: vi.fn(async () => readinessFixture()),
    getCircuitState: vi.fn(() => ({ state: 'closed' as const, consecutive_failures: 0 })),
    ...overrides,
  };
}

describe('gateway routes', () => {
  it('keeps liveness public and attaches a request ID', async () => {
    const app = await buildApp({ config: testConfig(), modelServer: fakeModelServer() });
    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.json()).toMatchObject({ status: 'live' });
    await app.close();
  });

  it('requires the public API key when configured', async () => {
    const app = await buildApp({
      config: testConfig({ apiKey: 'public-secret-1234' }),
      modelServer: fakeModelServer(),
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/models' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    await app.close();
  });

  it('validates and forwards a prediction without altering model output', async () => {
    const modelServer = fakeModelServer();
    const app = await buildApp({ config: testConfig(), modelServer });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions',
      headers: { 'x-request-id': 'route-request-001' },
      payload: {
        sample_id: 'sample-001',
        targets: ['crop_health_score'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('route-request-001');
    expect(response.json()).toEqual(predictionFixture('route-request-001'));
    expect(modelServer.predict).toHaveBeenCalledWith(
      expect.objectContaining({ sample_id: 'sample-001' }),
      'route-request-001',
      expect.any(AbortSignal),
    );
    await app.close();
  });

  it('fails closed instead of returning a fabricated prediction when upstream fails', async () => {
    const modelServer = fakeModelServer({
      predict: vi.fn(async () => {
        throw new Error('private upstream failure');
      }),
    });
    const app = await buildApp({ config: testConfig(), modelServer });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions',
      headers: { 'x-request-id': 'failed-prediction-001' },
      payload: {
        sample_id: 'sample-001',
        targets: ['crop_health_score'],
      },
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers['x-request-id']).toBe('failed-prediction-001');
    expect(response.body).not.toContain('private upstream failure');
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
      request_id: 'failed-prediction-001',
    });
    await app.close();
  });

  it('rejects unknown model targets before calling FastAPI', async () => {
    const modelServer = fakeModelServer();
    const app = await buildApp({ config: testConfig(), modelServer });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions',
      payload: { sample_id: 'sample-001', targets: ['invented_model'] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(modelServer.predict).not.toHaveBeenCalled();
    await app.close();
  });

  it('reports not-ready without exposing an upstream exception', async () => {
    const modelServer = fakeModelServer({
      getReadiness: vi.fn(async () => {
        throw new Error('private upstream failure');
      }),
    });
    const app = await buildApp({ config: testConfig(), modelServer });
    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private upstream failure');
    expect(response.json()).toMatchObject({ status: 'not_ready' });
    await app.close();
  });

  it('keeps request IDs consistent when an upstream call fails', async () => {
    const modelServer = fakeModelServer({
      predict: vi.fn(async () => {
        throw new Error('private upstream failure');
      }),
    });
    const app = await buildApp({ config: testConfig(), modelServer });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions',
      headers: { 'x-request-id': 'header-id' },
      payload: {
        request_id: 'body-id',
        sample_id: 'sample-001',
        targets: ['crop_health_score'],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['x-request-id']).toBe('header-id');
    expect(response.json()).toMatchObject({
      error: { code: 'REQUEST_ID_MISMATCH' },
      request_id: 'header-id',
    });
    await app.close();
  });

  it('maps malformed JSON to a safe client error and exempts health from rate limits', async () => {
    const app = await buildApp({
      config: testConfig({ rateLimitMax: 1 }),
      modelServer: fakeModelServer(),
    });
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });

    const healthChecks = await Promise.all([
      app.inject({ method: 'GET', url: '/health/live' }),
      app.inject({ method: 'GET', url: '/health/live' }),
      app.inject({ method: 'GET', url: '/health/live' }),
    ]);
    expect(healthChecks.every((response) => response.statusCode === 200)).toBe(true);
    await app.close();
  });

  it('rate limits authenticated API traffic without charging rejected credentials', async () => {
    const key = 'public-secret-123456789';
    const app = await buildApp({
      config: testConfig({ apiKey: key, rateLimitMax: 1 }),
      modelServer: fakeModelServer(),
    });

    const unauthorizedOne = await app.inject({ method: 'GET', url: '/api/v1/models' });
    const unauthorizedTwo = await app.inject({ method: 'GET', url: '/api/v1/models' });
    expect(unauthorizedOne.statusCode).toBe(401);
    expect(unauthorizedTwo.statusCode).toBe(401);

    const accepted = await app.inject({
      method: 'GET',
      url: '/api/v1/models',
      headers: { 'x-api-key': key },
    });
    const limited = await app.inject({
      method: 'GET',
      url: '/api/v1/models',
      headers: { 'x-api-key': key },
    });
    expect(accepted.statusCode).toBe(200);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    await app.close();
  });

  it('keeps the generated request ID authoritative when a body-only ID is supplied', async () => {
    const modelServer = fakeModelServer();
    const app = await buildApp({ config: testConfig(), modelServer });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions',
      payload: {
        request_id: 'body-only-id',
        sample_id: 'sample-001',
        targets: ['crop_health_score'],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['x-request-id']).not.toBe('body-only-id');
    expect(response.json()).toMatchObject({ error: { code: 'REQUEST_ID_MISMATCH' } });
    expect(modelServer.predict).not.toHaveBeenCalled();
    await app.close();
  });

  it('proxies the validated model catalog and explicitly disables jobs', async () => {
    const app = await buildApp({ config: testConfig(), modelServer: fakeModelServer() });

    const models = await app.inject({ method: 'GET', url: '/api/v1/models' });
    const jobs = await app.inject({ method: 'POST', url: '/api/v1/jobs', payload: {} });

    expect(models.statusCode).toBe(200);
    expect(models.json()).toEqual(modelCatalogFixture());
    expect(jobs.statusCode).toBe(503);
    expect(jobs.json()).toMatchObject({ error: { code: 'ASYNC_JOBS_DISABLED' } });
    await app.close();
  });

  it('reports ready only when both the model server and PostgreSQL store are ready', async () => {
    const store = new MemoryStore();
    const modelServer = fakeModelServer();
    const app = await buildApp({ config: testConfig(), modelServer, store });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ready',
      model_server: 'ready',
      database: 'ready',
    });
    expect(modelServer.getReadiness).toHaveBeenCalledOnce();
    await app.close();
  });

  it('keeps pipeline, public, and model credentials on separate trust boundaries', async () => {
    const publicKey = 'public-route-secret-1234';
    const internalKey = 'pipeline-route-secret-123456';
    const store = new MemoryStore();
    const app = await buildApp({
      config: testConfig({ apiKey: publicKey, internalApiKey: internalKey }),
      modelServer: fakeModelServer(),
      store,
    });

    const publicKeyOnInternal = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/predictions/cleanup',
      headers: { 'x-internal-api-key': publicKey },
    });
    expect(publicKeyOnInternal.statusCode).toBe(401);

    const internalKeyOnPublic = await app.inject({
      method: 'GET',
      url: '/api/v1/models',
      headers: { 'x-api-key': internalKey },
    });
    expect(internalKeyOnPublic.statusCode).toBe(401);

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/predictions/cleanup',
      headers: { 'x-internal-api-key': internalKey },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ deleted: 0 });
    expect(store.cleanupCalls).toBe(1);
    await app.close();
  });

  it('fails closed when internal authentication or persistence is not configured', async () => {
    const withoutInternalAuth = await buildApp({
      config: testConfig(),
      modelServer: fakeModelServer(),
    });
    const missingAuth = await withoutInternalAuth.inject({
      method: 'POST',
      url: '/api/v1/internal/predictions/cleanup',
    });
    expect(missingAuth.statusCode).toBe(503);
    expect(missingAuth.json()).toMatchObject({ error: { code: 'INTERNAL_AUTH_NOT_CONFIGURED' } });
    await withoutInternalAuth.close();

    const internalKey = 'pipeline-route-secret-123456';
    const withoutStore = await buildApp({
      config: testConfig({ internalApiKey: internalKey }),
      modelServer: fakeModelServer(),
    });
    const missingStore = await withoutStore.inject({
      method: 'POST',
      url: '/api/v1/internal/predictions/cleanup',
      headers: { 'x-internal-api-key': internalKey },
    });
    expect(missingStore.statusCode).toBe(503);
    expect(missingStore.json()).toMatchObject({ error: { code: 'DATABASE_NOT_CONFIGURED' } });
    await withoutStore.close();
  });

  it('validates the internal weekly manifest before orchestration', async () => {
    const internalKey = 'pipeline-route-secret-123456';
    const modelServer = fakeModelServer();
    const app = await buildApp({
      config: testConfig({ internalApiKey: internalKey }),
      modelServer,
      store: new MemoryStore(),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/weekly/ingest',
      headers: { 'x-internal-api-key': internalKey },
      payload: {
        week_start: '2026-09-01',
        week_end: '2026-09-08',
        schema_checksum: '0'.repeat(64),
        regions: [],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(modelServer.batchInfer).not.toHaveBeenCalled();
    await app.close();
  });

  it('serves the existing daily map UI contract from persisted weekly payloads', async () => {
    const store = new MemoryStore();
    store.predictions.push({
      id: '7803c1cb-18bb-4f04-85c7-ec532f324d0b',
      pipeline_run_id: 'c10bcd38-e5f3-4a91-a46a-f320e83b4785',
      region: 'yangon',
      week_start: '2026-08-31',
      week_end: '2026-09-07',
      payload: {
        coverage_metadata: { is_partial_week: false, coverage_ratio: 1 },
        model_policy: { crop_predictions_available: true },
        cells: [
          {
            grid_id: 'mm_123_456',
            latitude: 16.8,
            longitude: 96.1,
            predictions: {
              values: {
                crop_suitability_maize: { value: 0.82, unit: 'score_0_to_1' },
                crop_health_score: { value: 0.71, unit: 'score_0_to_1' },
              },
              errors: {},
            },
          },
        ],
      },
      cell_count: 1,
      source_sha256: 'a'.repeat(64),
      prediction_sha256: 'b'.repeat(64),
      model_catalog_version: 'c'.repeat(64),
      schema_version: 'weekly-model-input-v1',
      coverage_metadata: { is_partial_week: false, coverage_ratio: 1 },
      created_at: '2026-09-07T01:00:00.000Z',
      expires_at: '2099-09-14T01:00:00.000Z',
    });
    const app = await buildApp({
      config: testConfig(),
      modelServer: fakeModelServer(),
      store,
    });

    const latest = await app.inject({ method: 'GET', url: '/api/v1/daily/latest/map' });
    const dated = await app.inject({ method: 'GET', url: '/api/v1/daily/2026-09-03/map' });

    expect(latest.statusCode).toBe(200);
    expect(dated.statusCode).toBe(200);
    expect(latest.json()).toEqual([
      expect.objectContaining({
        index: 'mm_123_456',
        grid_id: 'mm_123_456',
        region: 'yangon',
        lat: 16.8,
        lon: 96.1,
        observation_date: '2026-09-06',
        week_start: '2026-08-31',
        week_end: '2026-09-07',
        recommendations: [['maize', 82]],
        top_crop: 'maize',
        top_score: 82,
      }),
    ]);
    expect(dated.json()).toEqual(latest.json());
    await app.close();
  });

  it('fails the daily compatibility map safely when weekly storage or data is unavailable', async () => {
    const withoutStore = await buildApp({
      config: testConfig(),
      modelServer: fakeModelServer(),
    });
    const unavailable = await withoutStore.inject({
      method: 'GET',
      url: '/api/v1/daily/latest/map',
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({ error: { code: 'DATABASE_NOT_CONFIGURED' } });
    await withoutStore.close();

    const emptyStore = await buildApp({
      config: testConfig(),
      modelServer: fakeModelServer(),
      store: new MemoryStore(),
    });
    const missing = await emptyStore.inject({
      method: 'GET',
      url: '/api/v1/daily/latest/map',
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'WEEKLY_PREDICTIONS_NOT_FOUND' } });
    await emptyStore.close();
  });
});
