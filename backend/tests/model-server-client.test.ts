import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../src/errors.js';
import { PredictionRequestSchema } from '../src/schemas/prediction.js';
import { ModelServerClient } from '../src/services/model-server-client.js';
import { modelCatalogFixture, predictionFixture, testConfig } from './helpers.js';

function modelResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

function predictionFetch(payload: unknown): typeof fetch {
  return vi.fn(async (input) =>
    String(input).endsWith('/api/v1/models')
      ? modelResponse(modelCatalogFixture())
      : modelResponse(payload),
  ) as unknown as typeof fetch;
}

describe('ModelServerClient', () => {
  it('forwards the versioned request with internal authentication and tracing', async () => {
    const fetchMock = predictionFetch(predictionFixture('request-001'));
    const client = new ModelServerClient(
      testConfig({ modelServerApiKey: 'internal-secret-123456789' }),
      fetchMock,
    );
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      request_id: 'ignored-client-id',
      targets: ['crop_health_score'],
    });

    const response = await client.predict(request, 'request-001');

    expect(response.request_id).toBe('request-001');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = vi.mocked(fetchMock).mock.calls[1];
    expect(url).toBe('http://127.0.0.1:8001/api/v1/predict');
    expect(init?.headers).toMatchObject({
      'X-Internal-API-Key': 'internal-secret-123456789',
      'X-Request-ID': 'request-001',
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      request_id: 'request-001',
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });
    expect(init?.redirect).toBe('error');
  });

  it('rejects a response that violates the model-inference-v1 contract', async () => {
    const fetchMock = predictionFetch({ status: 'success', predictions: {} });
    const client = new ModelServerClient(testConfig(), fetchMock);
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    await expect(client.predict(request, 'request-001')).rejects.toMatchObject({
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
    ) as unknown as typeof fetch;
    const client = new ModelServerClient(
      testConfig({
        modelServerMaxResponseBytes: 1024,
        circuitFailureThreshold: 1,
      }),
      fetchMock,
    );
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    await expect(client.predict(request, 'request-001')).rejects.toMatchObject({
      code: 'MODEL_SERVER_RESPONSE_TOO_LARGE',
    });
    await expect(client.predict(request, 'request-002')).rejects.toMatchObject({
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
    }) as unknown as typeof fetch;
    const client = new ModelServerClient(testConfig(), fetchMock);
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    const promise = client.predict(request, 'request-001');
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      code: 'MODEL_SERVER_TIMEOUT',
      statusCode: 504,
      publicMessage: 'The model service did not respond in time.',
    });
  });

  it.each([
    ['missing', modelCatalogFixture().models.slice(0, -1)],
    [
      'duplicate',
      [
        ...modelCatalogFixture().models.slice(0, -1),
        modelCatalogFixture().models[0],
      ],
    ],
  ])('rejects a %s model catalog', async (_description, models) => {
    const catalog = { ...modelCatalogFixture(), models };
    const fetchMock = vi.fn(async () => modelResponse(catalog)) as unknown as typeof fetch;
    const client = new ModelServerClient(testConfig(), fetchMock);

    await expect(client.getModels('catalog-request')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
      statusCode: 502,
    });
  });

  it('rejects prediction targets not implied by the request', async () => {
    const prediction = predictionFixture('request-001');
    prediction.predictions.crop_yield_t_ha = {
      ...prediction.predictions.crop_health_score!,
      unit: 'unitless',
    };
    const client = new ModelServerClient(testConfig(), predictionFetch(prediction));
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    await expect(client.predict(request, 'request-001')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });

  it('does not invent model dependencies for the unavailable economic ROI composite', async () => {
    const prediction = predictionFixture('request-001');
    prediction.predictions = {};
    prediction.composite_features = {
      economic_roi: {
        status: 'unavailable',
        reason_code: 'VERIFIED_ECONOMIC_INPUTS_REQUIRED',
        message: 'Verified farm-gate price and cost inputs are required.',
      },
    };
    const client = new ModelServerClient(testConfig(), predictionFetch(prediction));
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      composite_features: ['economic_roi'],
    });

    await expect(client.predict(request, 'request-001')).resolves.toEqual(prediction);
  });

  it('rejects catalog capability drift before forwarding a prediction', async () => {
    const catalog = modelCatalogFixture();
    catalog.capabilities.composite_dependencies.economic_roi = ['crop_yield_t_ha'];
    const fetchMock = vi.fn(async () => modelResponse(catalog)) as unknown as typeof fetch;
    const client = new ModelServerClient(testConfig(), fetchMock);

    await expect(client.getModels('catalog-request')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
      statusCode: 502,
    });
  });

  it('rejects mixed catalog or serving-data releases', async () => {
    const prediction = predictionFixture('request-001');
    prediction.catalog_version = 'd'.repeat(64);
    const client = new ModelServerClient(testConfig(), predictionFetch(prediction));
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    await expect(client.predict(request, 'request-001')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });

  it('rejects locator and catalog provenance mismatches', async () => {
    const prediction = predictionFixture('request-001');
    prediction.location.sample_id = 'different-sample';
    prediction.predictions.crop_health_score!.artifact_sha256 = 'c'.repeat(64);
    const client = new ModelServerClient(testConfig(), predictionFetch(prediction));
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    await expect(client.predict(request, 'request-001')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });

  it('rejects regression output outside the catalog value range', async () => {
    const catalog = modelCatalogFixture();
    const item = catalog.models.find((model) => model.model_id === 'crop_health_score');
    if (!item || item.task_type !== 'regression') throw new Error('invalid test catalog');
    item.value_range = [0, 0.5];
    const fetchMock = vi.fn(async (input) =>
      String(input).endsWith('/api/v1/models')
        ? modelResponse(catalog)
        : modelResponse(predictionFixture('request-001')),
    ) as unknown as typeof fetch;
    const client = new ModelServerClient(testConfig(), fetchMock);
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    await expect(client.predict(request, 'request-001')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });

  it('accepts an exact coordinate match and rejects matches beyond the distance limit', async () => {
    const prediction = predictionFixture('request-001');
    prediction.location.requested_lat = 16.8661;
    prediction.location.requested_lon = 96.1951;
    prediction.location.distance_km = 8.1;
    const client = new ModelServerClient(testConfig(), predictionFetch(prediction));
    const request = PredictionRequestSchema.parse({
      lat: 16.8661,
      lon: 96.1951,
      observation_month: '2024-01',
      targets: ['crop_health_score'],
    });

    await expect(client.predict(request, 'request-001')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });

  it('maps a structured expensive-request response without exposing its message', async () => {
    const upstreamSecret = 'private implementation details';
    const fetchMock = vi.fn(async (input) => {
      if (String(input).endsWith('/api/v1/models')) return modelResponse(modelCatalogFixture());
      return modelResponse(
        {
          error: {
            code: 'REQUEST_TOO_EXPENSIVE',
            message: upstreamSecret,
            request_id: 'request-001',
            retryable: false,
            details: null,
          },
        },
        { status: 422 },
      );
    }) as unknown as typeof fetch;
    const client = new ModelServerClient(testConfig(), fetchMock);
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    const promise = client.predict(request, 'request-001');
    await expect(promise).rejects.toMatchObject({
      code: 'REQUEST_TOO_EXPENSIVE',
      statusCode: 413,
    });
    await expect(promise).rejects.not.toMatchObject({ publicMessage: upstreamSecret });
  });

  it('maps the model server execution deadline to a gateway timeout', async () => {
    const fetchMock = vi.fn(async (input) => {
      if (String(input).endsWith('/api/v1/models')) return modelResponse(modelCatalogFixture());
      return modelResponse(
        {
          error: {
            code: 'INFERENCE_TIMEOUT',
            message: 'private worker timing detail',
            request_id: 'request-001',
            retryable: true,
            details: null,
          },
        },
        { status: 504 },
      );
    }) as unknown as typeof fetch;
    const client = new ModelServerClient(testConfig(), fetchMock);
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['crop_health_score'],
    });

    await expect(client.predict(request, 'request-001')).rejects.toMatchObject({
      code: 'MODEL_SERVER_TIMEOUT',
      statusCode: 504,
      retryAfterSeconds: 2,
    });
  });

  it('rejects undeclared classes and probability keys', async () => {
    const catalog = modelCatalogFixture();
    const index = catalog.models.findIndex((model) => model.model_id === 'flood_risk_level');
    const catalogBase = catalog.models[index];
    if (!catalogBase) throw new Error('invalid test catalog');
    catalog.models[index] = {
      ...catalogBase,
      task_type: 'classification',
      classes: ['low', 'medium', 'high'],
      value_range: null,
      probability_calibrated: false,
    };

    const response = predictionFixture('request-001');
    const predictionBase = response.predictions.crop_health_score!;
    response.predictions = {
      flood_risk_level: {
        ...predictionBase,
        value: 'extreme',
        label: 'extreme',
        unit: catalogBase.unit,
        task_type: 'classification',
        confidence: 0.7,
        confidence_kind: 'random_forest_vote_share_uncalibrated',
        probabilities: { low: 0.1, medium: 0.1, high: 0.1, extreme: 0.7 },
      },
    };
    const request = PredictionRequestSchema.parse({
      sample_id: 'sample-001',
      targets: ['flood_risk_level'],
    });
    const fetchFor = (payload: unknown) =>
      vi.fn(async (input) =>
        String(input).endsWith('/api/v1/models')
          ? modelResponse(catalog)
          : modelResponse(payload),
      ) as unknown as typeof fetch;

    const unknownClassClient = new ModelServerClient(testConfig(), fetchFor(response));
    await expect(unknownClassClient.predict(request, 'request-001')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });

    response.predictions.flood_risk_level = {
      ...predictionBase,
      value: 'high',
      label: 'high',
      unit: catalogBase.unit,
      task_type: 'classification',
      confidence: 0.8,
      confidence_kind: 'random_forest_vote_share_uncalibrated',
      probabilities: { low: 0.2, high: 0.8 },
    };
    const missingProbabilityClient = new ModelServerClient(testConfig(), fetchFor(response));
    await expect(missingProbabilityClient.predict(request, 'request-001')).rejects.toMatchObject({
      code: 'MODEL_SERVER_CONTRACT_ERROR',
    });
  });

  it('checks the authenticated catalog as part of readiness', async () => {
    const fetchMock = vi.fn(async (input) => {
      if (String(input).endsWith('/api/v1/ready')) {
        return modelResponse({
          status: 'ready',
          catalog_version: modelCatalogFixture().catalog_version,
          model_count: 40,
          spatial_rows: 1_029_348,
        });
      }
      return modelResponse(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'wrong internal key',
            request_id: 'ready-request',
            retryable: false,
            details: null,
          },
        },
        { status: 401 },
      );
    }) as unknown as typeof fetch;
    const client = new ModelServerClient(testConfig(), fetchMock);

    await expect(client.getReadiness('ready-request')).rejects.toMatchObject({
      code: 'MODEL_SERVER_AUTH_FAILED',
      statusCode: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
