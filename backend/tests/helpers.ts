import type { AppConfig } from '../src/config.js';
import { COMPOSITE_DEPENDENCIES, MODEL_TARGETS } from '../src/catalog.js';
import type { ModelCatalogResponse } from '../src/schemas/model-server.js';
import type { PredictionResponse } from '../src/schemas/prediction.js';

const ARTIFACT_SHA = 'a'.repeat(64);
const INPUT_SHA = 'b'.repeat(64);
const CATALOG_SHA = 'c'.repeat(64);

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 8000,
    logLevel: 'silent',
    corsOrigins: ['http://localhost:3000'],
    modelServerUrl: 'http://127.0.0.1:8001',
    modelServerTimeoutMs: 1_000,
    modelServerMaxResponseBytes: 1_000_000,
    circuitFailureThreshold: 3,
    circuitResetMs: 30_000,
    modelCatalogCacheTtlMs: 30_000,
    modelServerMaxMatchDistanceKm: 8,
    modelServerMaxInFlight: 4,
    rateLimitMax: 100,
    rateLimitWindowMs: 60_000,
    bodyLimitBytes: 64 * 1024,
    asyncJobsEnabled: false,
    ...overrides,
  };
}

export function predictionFixture(requestId = 'test-request'): PredictionResponse {
  return {
    api_version: 'v1',
    contract_version: 'model-inference-v1',
    catalog_version: CATALOG_SHA,
    request_id: requestId,
    status: 'success',
    location: {
      sample_id: 'sample-001',
      grid_id: 'grid-001',
      region: 'Ayeyawaddy',
      observation_month: '2024-01',
      requested_lat: null,
      requested_lon: null,
      matched_lat: 16.8,
      matched_lon: 95.2,
      distance_km: 0,
    },
    predictions: {
      crop_health_score: {
        value: 0.72,
        label: null,
        unit: 'score_0_to_1',
        task_type: 'regression',
        confidence: null,
        confidence_kind: null,
        probabilities: null,
        model_version: '1.0.0',
        artifact_sha256: ARTIFACT_SHA,
        input_schema_sha256: INPUT_SHA,
        model_source: 'primary',
        deployment_status: 'experimental',
        validation_status: 'healthy',
        warnings: ['Engineered surrogate labels; not field validated.'],
      },
    },
    composite_features: {},
    provenance: {
      feature_dataset_sha256: ARTIFACT_SHA,
      spatial_index_sha256: INPUT_SHA,
      data_source: 'Earth Engine export',
      source_date: '2024-01-31',
      source_version: 'v1',
      quality_flag: 1,
      label_source: 'rule_engineered_surrogate',
      field_validated: false,
    },
    execution_metadata: {
      response_time_ms: 12.5,
      queue_wait_ms: 0,
      cached: false,
      models_loaded_count: 1,
    },
  };
}

export function modelCatalogFixture(): ModelCatalogResponse {
  const models: ModelCatalogResponse['models'] = MODEL_TARGETS.map((modelId) => ({
    model_id: modelId,
    display_name: modelId,
    task_type: 'regression' as const,
    unit: modelId === 'crop_health_score' ? 'score_0_to_1' : 'unitless',
    classes: null,
    value_range: [null, null],
    model_version: '1.0.0',
    artifact_sha256: ARTIFACT_SHA,
    input_schema_sha256: INPUT_SHA,
    artifact_size_bytes: 1234,
    model_source: 'primary' as const,
    deployment_status: 'experimental' as const,
    validation_status: 'healthy' as const,
    field_validated: false as const,
    label_source: 'rule_engineered_surrogate' as const,
    probability_calibrated: null,
    metrics: { r2: 0.8 },
    warnings: [],
    ready: true,
  }));

  return {
    api_version: 'v1',
    contract_version: 'model-inference-v1',
    catalog_version: CATALOG_SHA,
    feature_dataset_sha256: ARTIFACT_SHA,
    spatial_index_sha256: INPUT_SHA,
    capabilities: {
      max_expanded_sync_targets: 17,
      supports_composite_only_requests: true,
      composite_dependencies: {
        crop_recommender: [...COMPOSITE_DEPENDENCIES.crop_recommender],
        crop_health: [...COMPOSITE_DEPENDENCIES.crop_health],
        economic_roi: [...COMPOSITE_DEPENDENCIES.economic_roi],
        risk_alerts: [...COMPOSITE_DEPENDENCIES.risk_alerts],
        land_use: [...COMPOSITE_DEPENDENCIES.land_use],
      },
    },
    models,
  };
}
