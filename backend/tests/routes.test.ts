import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { ModelServerGateway } from '../src/services/model-server-client.js';
import { modelCatalogFixture, predictionFixture, testConfig } from './helpers.js';

function fakeModelServer(overrides: Partial<ModelServerGateway> = {}): ModelServerGateway {
  return {
    predict: vi.fn(async (_request, requestId) => predictionFixture(requestId)),
    getModels: vi.fn(async () => modelCatalogFixture()),
    getReadiness: vi.fn(async () => ({
      status: 'ready' as const,
      catalog_version: modelCatalogFixture().catalog_version,
      model_count: 40 as const,
      spatial_rows: 1_029_348,
    })),
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
});
