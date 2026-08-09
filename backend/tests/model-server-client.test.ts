import { describe, expect, it, vi } from 'vitest';

import { MODEL_TARGETS, type ModelTarget } from '../src/catalog.js';
import {
  AUDITED_MODEL_CATALOG_VERSION,
  MODEL_FEATURE_NAMES,
  type ModelFeatureRow,
} from '../src/contracts/weekly.js';
import { AppError } from '../src/errors.js';
import { PredictionRequestSchema } from '../src/schemas/prediction.js';
import {
  ModelServerClient,
  type BatchInferenceRequest,
} from '../src/services/model-server-client.js';
import {
  batchPredictionFixture,
  batchResponseFixture,
  modelCatalogFixture,
  modelFeatureRow,
  predictionFixture,
  readinessFixture,
  testConfig,
} from './helpers.js';

function modelResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

function validBatchRequest(overrides: Partial<BatchInferenceRequest> = {}): BatchInferenceRequest {
  return {
    rows: [modelFeatureRow()],
    targets: ['crop_health_score'],
    observation_month: '2026-09',
    ...overrides,
  };
}

function batchFetch(
  responseFor: (request: BatchInferenceRequest) => unknown = batchResponseFixture,
) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/v1/ready')) return modelResponse(readinessFixture());
    if (url.endsWith('/api/v1/models')) return modelResponse(modelCatalogFixture());
    if (url.endsWith('/api/v1/infer/batch')) {
      const request = JSON.parse(String(init?.body)) as BatchInferenceRequest;
      return modelResponse(responseFor(request));
    }
    throw new Error(`Unexpected test URL: ${url}`);
  });
}

describe('ModelServerClient batch inference contract', () => {
  it('posts the exact model batch endpoint with internal authentication and tracing', async () => {
    const fetchMock = batchFetch();
    const client = new ModelServerClient(
      testConfig({ modelServerApiKey: 'model-internal-secret-123456' }),
      fetchMock as unknown as typeof fetch,
    );
    const request = validBatchRequest();

    const response = await client.batchInfer(request, 'weekly-request-001');

    expect(response.results[0]?.grid_id).toBe(request.rows[0]?.grid_id);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [readyUrl, readyInit] = fetchMock.mock.calls[0] ?? [];
    expect(readyUrl).toBe('http://127.0.0.1:8001/api/v1/ready');
    expect(readyInit?.method).toBe('GET');
    const [batchUrl, batchInit] = fetchMock.mock.calls[1] ?? [];
    expect(batchUrl).toBe('http://127.0.0.1:8001/api/v1/infer/batch');
    expect(batchInit?.method).toBe('POST');
    expect(batchInit?.headers).toMatchObject({
      'X-Internal-API-Key': 'model-internal-secret-123456',
      'X-Request-ID': 'weekly-request-001',
      'Content-Type': 'application/json',
    });
    expect(batchInit?.redirect).toBe('error');
    expect(JSON.parse(String(batchInit?.body))).toEqual(request);
  });

  it('requires the audited readiness catalog before sending a batch', async () => {
    const fetchMock = vi.fn(async () =>
      modelResponse(readinessFixture({ catalog_version: 'd'.repeat(64) })),
    );
    const client = new ModelServerClient(
      testConfig(),
      fetchMock as unknown as typeof fetch,
    );

    await expect(client.batchInfer(validBatchRequest(), 'catalog-drift')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
      statusCode: 502,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('accepts the model server batch catalog placeholder only after audited readiness succeeds', async () => {
    const fetchMock = batchFetch((request) =>
      batchResponseFixture(request, { catalog_version: 'unknown' }),
    );
    const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);

    await expect(client.batchInfer(validBatchRequest(), 'catalog-placeholder')).resolves.toMatchObject({
      catalog_version: 'unknown',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8001/api/v1/ready');
  });

  it('rejects a batch response from a different catalog release', async () => {
    const fetchMock = batchFetch((request) =>
      batchResponseFixture(request, { catalog_version: 'd'.repeat(64) }),
    );
    const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);

    await expect(client.batchInfer(validBatchRequest(), 'catalog-mismatch')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });

  it('blocks flagged targets by default and permits them only with explicit configuration', async () => {
    const target: ModelTarget = 'crop_suitability_maize';
    const request = validBatchRequest({ targets: [target] });
    const blockedFetch = batchFetch();
    const blocked = new ModelServerClient(
      testConfig(),
      blockedFetch as unknown as typeof fetch,
    );

    await expect(blocked.batchInfer(request, 'flagged-disabled')).rejects.toMatchObject({
      code: 'FLAGGED_MODEL_DISABLED',
      statusCode: 500,
    });
    expect(blockedFetch).not.toHaveBeenCalled();

    const allowedFetch = batchFetch();
    const allowed = new ModelServerClient(
      testConfig({ allowFlaggedModels: true }),
      allowedFetch as unknown as typeof fetch,
    );
    await expect(allowed.batchInfer(request, 'flagged-enabled')).resolves.toMatchObject({
      results: [
        expect.objectContaining({
          predictions: {
            crop_suitability_maize: expect.objectContaining({ validation_status: 'flagged' }),
          },
        }),
      ],
    });
  });

  it.each([
    {
      name: 'missing feature',
      mutate(row: Record<string, string | number>) {
        delete row.elevation_m;
      },
      code: 'MODEL_FEATURE_SCHEMA_MISMATCH',
    },
    {
      name: 'extra feature',
      mutate(row: Record<string, string | number>) {
        row.invented_feature = 1;
      },
      code: 'MODEL_FEATURE_SCHEMA_MISMATCH',
    },
    {
      name: 'non-finite feature',
      mutate(row: Record<string, string | number>) {
        row.surface_water_seasonality_months = Number.NaN;
      },
      code: 'NON_FINITE_MODEL_FEATURE',
    },
  ])('fails closed on a $name row before network I/O', async ({ mutate, code }) => {
    const row = { ...modelFeatureRow() } as Record<string, string | number>;
    mutate(row);
    const fetchMock = batchFetch();
    const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);

    await expect(
      client.batchInfer(
        validBatchRequest({ rows: [row as unknown as ModelFeatureRow] }),
        'invalid-row',
      ),
    ).rejects.toMatchObject({ code });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an out-of-order feature object before network I/O', async () => {
    const source = modelFeatureRow();
    const reversed = Object.fromEntries(
      [...MODEL_FEATURE_NAMES].reverse().map((feature) => [feature, source[feature]]),
    );
    const row = { grid_id: source.grid_id, ...reversed } as ModelFeatureRow;
    const fetchMock = batchFetch();
    const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);

    await expect(
      client.batchInfer(validBatchRequest({ rows: [row] }), 'out-of-order'),
    ).rejects.toMatchObject({ code: 'MODEL_FEATURE_SCHEMA_MISMATCH' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['prototype heuristic was used', 'fallback model was used']) (
    'rejects unaudited model warning: %s',
    async (warning) => {
      const fetchMock = batchFetch((request) => {
        const response = batchResponseFixture(request);
        const prediction = response.results[0]?.predictions.crop_health_score;
        if (!prediction) throw new Error('Missing test prediction.');
        prediction.warnings = [warning];
        return response;
      });
      const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);

      await expect(client.batchInfer(validBatchRequest(), 'unsafe-warning')).rejects.toMatchObject({
        code: 'MODEL_SERVER_CONTRACT_ERROR',
      });
    },
  );

  it('rejects a prototype version or validation status inconsistent with the target policy', async () => {
    const fetchMock = batchFetch((request) => {
      const response = batchResponseFixture(request);
      response.results[0]!.predictions.crop_health_score = batchPredictionFixture(
        'crop_health_score',
        { model_version: 'prototype-v1', validation_status: 'flagged' },
      );
      return response;
    });
    const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);

    await expect(client.batchInfer(validBatchRequest(), 'unsafe-version')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });

  it('rejects malformed row indexes and row identifiers', async () => {
    const fetchMock = batchFetch((request) => {
      const response = batchResponseFixture(request);
      response.results[0]!.row_index = 2;
      response.results[0]!.grid_id = 'mm_999_999';
      return response;
    });
    const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);

    await expect(client.batchInfer(validBatchRequest(), 'malformed-result')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });

  it('rejects a response that silently omits requested rows', async () => {
    const request = validBatchRequest({
      rows: [modelFeatureRow('mm_123_456'), modelFeatureRow('mm_124_457')],
    });
    const fetchMock = batchFetch((forwarded) => {
      const response = batchResponseFixture(forwarded);
      return {
        ...response,
        total_rows: 1,
        successful_rows: 1,
        results: response.results.slice(0, 1),
      };
    });
    const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);

    await expect(client.batchInfer(request, 'omitted-row')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });

  it('rejects prediction/error ambiguity and unrequested targets', async () => {
    const fetchMock = batchFetch((request) => {
      const response = batchResponseFixture(request);
      const row = response.results[0]!;
      row.errors.crop_health_score = 'failed too';
      row.predictions.crop_yield_t_ha = batchPredictionFixture('crop_yield_t_ha');
      return response;
    });
    const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);

    await expect(client.batchInfer(validBatchRequest(), 'ambiguous-result')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });
});

describe('ModelServerClient transport safeguards and legacy routes', () => {
  it('validates the actual compact model catalog shape', async () => {
    const validFetch = vi.fn(async () => modelResponse(modelCatalogFixture()));
    const valid = new ModelServerClient(testConfig(), validFetch as unknown as typeof fetch);
    await expect(valid.getModels('models-valid')).resolves.toEqual(modelCatalogFixture());

    const duplicateCatalog = modelCatalogFixture();
    duplicateCatalog.targets = [
      ...MODEL_TARGETS.slice(0, -1),
      MODEL_TARGETS[0],
    ];
    const invalidFetch = vi.fn(async () => modelResponse(duplicateCatalog));
    const invalid = new ModelServerClient(testConfig(), invalidFetch as unknown as typeof fetch);
    await expect(invalid.getModels('models-invalid')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });

  it('keeps the legacy prediction response validation fail-closed', async () => {
    const fetchMock = vi.fn(async () => modelResponse({ status: 'success', predictions: {} }));
    const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    await expect(client.predict(request, 'legacy-contract')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
      statusCode: 502,
    });
  });

  it('enforces the response-size cap and opens the circuit', async () => {
    let bodyCancelled = false;
    const fetchMock = vi.fn(async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"large":true}'));
          },
          cancel() {
            bodyCancelled = true;
          },
        }),
        {
          headers: { 'Content-Length': '5000', 'Content-Type': 'application/json' },
        },
      ),
    );
    const client = new ModelServerClient(
      testConfig({ modelServerMaxResponseBytes: 1024, circuitFailureThreshold: 1 }),
      fetchMock as unknown as typeof fetch,
    );
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    await expect(client.predict(request, 'response-too-large')).rejects.toMatchObject({
      code: 'MODEL_SERVER_RESPONSE_TOO_LARGE',
    });
    await expect(client.predict(request, 'circuit-open')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CIRCUIT_OPEN',
      statusCode: 503,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(bodyCancelled).toBe(true);
  });

  it('maps an upstream timeout to a safe gateway timeout', async () => {
    const timeout = new Error('secret upstream detail');
    timeout.name = 'TimeoutError';
    const fetchMock = vi.fn(async () => {
      throw timeout;
    });
    const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    const promise = client.predict(request, 'request-timeout');
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      code: 'MODEL_SERVER_TIMEOUT',
      statusCode: 504,
      publicMessage: 'The model service did not respond in time.',
    });
  });

  it('maps a structured error without exposing the upstream message', async () => {
    const upstreamSecret = 'private implementation details';
    const fetchMock = vi.fn(async () =>
      modelResponse(
        {
          error: {
            code: 'REQUEST_TOO_EXPENSIVE',
            message: upstreamSecret,
            request_id: 'request-expensive',
            retryable: false,
            details: null,
          },
        },
        { status: 422 },
      ),
    );
    const client = new ModelServerClient(testConfig(), fetchMock as unknown as typeof fetch);
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    const promise = client.predict(request, 'request-expensive');
    await expect(promise).rejects.toMatchObject({ code: 'REQUEST_TOO_EXPENSIVE', statusCode: 413 });
    await expect(promise).rejects.not.toMatchObject({ publicMessage: upstreamSecret });
  });

  it('forwards authoritative request IDs on the retained legacy prediction route', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain('/api/v1/predict');
      expect(init?.method).toBe('POST');
      return modelResponse(predictionFixture('legacy-request'));
    });
    const client = new ModelServerClient(
      testConfig({ modelServerApiKey: 'model-internal-secret-123456' }),
      fetchMock as unknown as typeof fetch,
    );
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      request_id: 'legacy-request',
      targets: ['crop_health_score'],
    });

    await expect(client.predict(request, 'legacy-request')).resolves.toMatchObject({
      catalog_version: AUDITED_MODEL_CATALOG_VERSION,
      request_id: 'legacy-request',
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://127.0.0.1:8001/api/v1/predict');
    expect(init?.headers).toMatchObject({
      'X-Internal-API-Key': 'model-internal-secret-123456',
      'X-Request-ID': 'legacy-request',
    });
  });
});
