import { createHash, randomUUID } from 'node:crypto';

import type { AppConfig } from '../src/config.js';
import { MODEL_TARGETS, type ModelTarget } from '../src/catalog.js';
import {
  AUDITED_MODEL_CATALOG_VERSION,
  CROP_KEYS,
  HEALTHY_MODEL_TARGETS,
  MODEL_FEATURE_NAMES,
  MODEL_INPUT_SCHEMA_SHA256,
  WEEKLY_SCHEMA_VERSION,
  type ModelFeatureRow,
  type WeeklyRegion,
} from '../src/contracts/weekly.js';
import { UserRegistrationConflictError } from '../src/db/store.js';
import type {
  AppStore,
  MarketCommodityPriceFilters,
  MarketPrice,
  MarketPriceFilters,
  MarketPriceInput,
  PipelineRun,
  PipelineRunStatus,
  RegionAudit,
  WeeklyRegionPrediction,
} from '../src/db/store.js';
import type {
  BatchInferResponse,
  BatchPrediction,
  ModelCatalogResponse,
  ModelServerReadyResponse,
} from '../src/schemas/model-server.js';
import type { PredictionResponse } from '../src/schemas/prediction.js';
import type { RegisteredUser, UserRegistrationInput } from '../src/schemas/users.js';
import type { CoverageMetadata } from '../src/schemas/weekly.js';
import type { BatchInferenceRequest } from '../src/services/model-server-client.js';

const ARTIFACT_SHA = 'a'.repeat(64);
const INPUT_SHA = 'b'.repeat(64);

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
    modelExpectedInputSchemaSha256: MODEL_INPUT_SCHEMA_SHA256,
    modelExpectedCatalogVersion: AUDITED_MODEL_CATALOG_VERSION,
    modelBatchSize: 50,
    modelMaxConcurrentBatches: 1,
    allowFlaggedModels: false,
    weeklyDataDir: '../data/weekly',
    weeklyRunStaleAfterMs: 24 * 60 * 60_000,
    predictionRetentionDays: 7,
    predictionCleanupIntervalMs: 0,
    marketPriceRefreshEnabled: true,
    marketPriceRequestTimeoutMs: 1_000,
    marketPriceSourceUrls: {
      doa: 'https://example.test/doa',
      mrf: 'https://example.test/mrf',
      cso: 'https://example.test/cso',
      wisarra: 'https://example.test/wisarra',
    },
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
    catalog_version: AUDITED_MODEL_CATALOG_VERSION,
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
  return {
    api_version: 'v1',
    contract_version: 'model-inference-v1',
    total_targets: 40,
    crops: [...CROP_KEYS],
    targets: [...MODEL_TARGETS],
  };
}

export function readinessFixture(
  overrides: Partial<ModelServerReadyResponse> = {},
): ModelServerReadyResponse {
  return {
    status: 'ready',
    catalog_version: AUDITED_MODEL_CATALOG_VERSION,
    model_targets_count: 40,
    ...overrides,
  };
}

export function modelFeatureRow(
  gridId = 'mm_123_456',
  region: WeeklyRegion = 'yangon',
  dataMonth = 9,
): ModelFeatureRow {
  const entries = MODEL_FEATURE_NAMES.map((feature, index) => {
    let value = index + 0.25;
    if (feature === 'data_month') value = dataMonth;
    if (feature.startsWith('region_')) value = feature === `region_${region}` ? 1 : 0;
    return [feature, value] as const;
  });
  return { grid_id: gridId, ...Object.fromEntries(entries) } as ModelFeatureRow;
}

export function batchPredictionFixture(
  target: ModelTarget,
  overrides: Partial<Extract<BatchPrediction, { task_type: 'regression' }>> = {},
): BatchPrediction {
  return {
    value: 0.72,
    label: null,
    unit: 'score_0_to_1',
    task_type: 'regression',
    confidence: null,
    confidence_kind: null,
    probabilities: null,
    model_version: 'sha256-abcdef123456',
    validation_status: (HEALTHY_MODEL_TARGETS as readonly ModelTarget[]).includes(target)
      ? 'healthy'
      : 'flagged',
    warnings: [],
    ...overrides,
  };
}

export function batchResponseFixture(
  request: BatchInferenceRequest,
  overrides: Partial<BatchInferResponse> = {},
): BatchInferResponse {
  const results = request.rows.map((row, rowIndex) => ({
    row_index: rowIndex,
    grid_id: row.grid_id,
    predictions: Object.fromEntries(
      request.targets.map((target) => [target, batchPredictionFixture(target)]),
    ),
    errors: {},
  }));
  return {
    api_version: 'v1',
    catalog_version: 'unknown',
    total_rows: results.length,
    successful_rows: results.length,
    failed_rows: 0,
    results,
    execution_time_ms: 12.5,
    ...overrides,
  };
}

export function weeklyCsv(
  rows: readonly ModelFeatureRow[],
  options: {
    region?: WeeklyRegion;
    weekStart?: string;
    weekEnd?: string;
    observationMonth?: string;
    coverageMetadata?: CoverageMetadata;
  } = {},
): string {
  const region = options.region ?? 'yangon';
  const weekStart = options.weekStart ?? '2026-08-31';
  const weekEnd = options.weekEnd ?? '2026-09-07';
  const observationMonth = options.observationMonth ?? '2026-09';
  const coverage = options.coverageMetadata ?? weeklyCoverageFixture(weekStart, weekEnd);
  const headers = [
    'grid_id',
    'serving_sample_id',
    'latitude',
    'longitude',
    'region',
    'week_start',
    'week_end',
    'observation_month',
    'serving_year_month',
    'observation_days',
    'expected_days',
    'coverage_ratio',
    'is_partial_week',
    'source_coverage_json',
    'source_observation_dates_json',
    'source_dates_used_json',
    'feature_schema_sha256',
    ...MODEL_FEATURE_NAMES,
  ];
  const body = rows.map((row, index) =>
    [
      row.grid_id,
      `${row.grid_id}__2026-07`,
      String(16.8 + index * 0.01),
      String(96.1 + index * 0.01),
      region,
      weekStart,
      weekEnd,
      observationMonth,
      '2026-07',
      String(coverage.observation_days),
      String(coverage.expected_days),
      String(coverage.coverage_ratio),
      String(coverage.is_partial_week),
      JSON.stringify(coverage.source_coverage),
      JSON.stringify(coverage.source_observation_dates),
      JSON.stringify(coverage.source_dates_used),
      MODEL_INPUT_SCHEMA_SHA256,
      ...MODEL_FEATURE_NAMES.map((feature) => String(row[feature])),
    ].map(csvField).join(','),
  );
  return `${headers.join(',')}\n${body.join('\n')}\n`;
}

export function weeklyCoverageFixture(
  weekStart = '2026-08-31',
  weekEnd = '2026-09-07',
): CoverageMetadata {
  const dates = Array.from({ length: 7 }, (_, offset) => {
    const value = new Date(`${weekStart}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  });
  const sourceObservationDates = {
    chirps: [...dates],
    era5: [...dates],
    sentinel_1: [...dates],
    sentinel_2: [...dates],
  };
  return {
    week_start: weekStart,
    week_end: weekEnd,
    observation_days: 7,
    expected_days: 7,
    coverage_ratio: 1,
    is_partial_week: false,
    source_coverage: { chirps: 1, era5: 1, sentinel_1: 1, sentinel_2: 1 },
    source_observation_dates: sourceObservationDates,
    source_dates_used: structuredClone(sourceObservationDates),
  };
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class MemoryStore implements AppStore {
  readonly runs = new Map<string, PipelineRun>();
  readonly predictions: WeeklyRegionPrediction[] = [];
  readonly marketPrices: MarketPrice[] = [];
  readonly users: RegisteredUser[] = [];
  cleanupCalls = 0;
  pingError?: Error;
  private readonly runKeys = new Map<string, string>();

  async ping(): Promise<void> {
    if (this.pingError) throw this.pingError;
  }

  async close(): Promise<void> {}

  async registerUser(input: UserRegistrationInput): Promise<RegisteredUser> {
    const conflict = this.users.some(
      (user) =>
        user.username.toLocaleLowerCase('en') === input.username.toLocaleLowerCase('en') ||
        user.phone === input.phone ||
        (input.email !== undefined && user.email?.toLocaleLowerCase('en') === input.email),
    );
    if (conflict) throw new UserRegistrationConflictError();
    const user: RegisteredUser = {
      id: randomUUID(),
      username: input.username,
      phone: input.phone,
      location: input.location,
      email: input.email ?? null,
      created_at: '2026-08-09T00:00:00.000Z',
    };
    this.users.push(user);
    return structuredClone(user);
  }

  async createOrGetPipelineRun(input: {
    weekStart: string;
    weekEnd: string;
    schemaVersion: string;
    modelCatalogVersion: string;
    sourceManifestSha256: string;
    regionsExpected: number;
  }): Promise<{ run: PipelineRun; created: boolean }> {
    const key = `${input.weekStart}:${input.modelCatalogVersion}:${input.schemaVersion}`;
    const existingId = this.runKeys.get(key);
    if (existingId) {
      const existing = this.runs.get(existingId);
      if (!existing) throw new Error('MemoryStore run index is corrupt.');
      return { run: structuredClone(existing), created: false };
    }
    const timestamp = '2026-08-31T00:00:00.000Z';
    const run: PipelineRun = {
      id: randomUUID(),
      cadence: 'weekly',
      week_start: input.weekStart,
      week_end: input.weekEnd,
      status: 'processing',
      schema_version: input.schemaVersion,
      model_catalog_version: input.modelCatalogVersion,
      source_manifest_sha256: input.sourceManifestSha256,
      regions_expected: input.regionsExpected,
      regions_succeeded: 0,
      regions_failed: 0,
      cells_succeeded: 0,
      cells_failed: 0,
      region_results: {},
      started_at: timestamp,
      completed_at: null,
      error_details: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.runs.set(run.id, run);
    this.runKeys.set(key, run.id);
    return { run: structuredClone(run), created: true };
  }

  async getPipelineRun(id: string): Promise<PipelineRun | undefined> {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : undefined;
  }

  async claimPipelineRunRetry(id: string, staleBefore: string): Promise<PipelineRun | undefined> {
    const run = this.runs.get(id);
    const retryableTerminal = run && ['failed', 'partially_succeeded'].includes(run.status);
    const staleInProgress =
      run &&
      ['pending', 'processing'].includes(run.status) &&
      new Date(run.updated_at).getTime() <= new Date(staleBefore).getTime();
    if (!run || (!retryableTerminal && !staleInProgress)) return undefined;
    run.status = 'processing';
    run.completed_at = null;
    run.error_details = null;
    run.updated_at = new Date().toISOString();
    return structuredClone(run);
  }

  async listPipelineRuns(limit: number, offset: number): Promise<PipelineRun[]> {
    return [...this.runs.values()]
      .sort((left, right) => right.week_start.localeCompare(left.week_start))
      .slice(offset, offset + limit)
      .map((run) => structuredClone(run));
  }

  async markPipelineRun(
    id: string,
    status: PipelineRunStatus,
    errorDetails?: unknown,
  ): Promise<PipelineRun> {
    const run = this.requireRun(id);
    run.status = status;
    run.error_details = errorDetails ?? null;
    run.completed_at = ['partially_succeeded', 'succeeded', 'failed'].includes(status)
      ? '2026-08-31T01:00:00.000Z'
      : null;
    return structuredClone(run);
  }

  async recordRegionAudit(
    id: string,
    region: WeeklyRegion,
    audit: RegionAudit,
  ): Promise<PipelineRun> {
    const run = this.requireRun(id);
    run.region_results[region] = structuredClone(audit);
    const audits = Object.values(run.region_results);
    run.regions_succeeded = audits.filter((item) => item?.status === 'succeeded').length;
    run.regions_failed = audits.filter((item) => item?.status === 'failed').length;
    run.cells_succeeded = audits.reduce(
      (sum, item) => sum + (item?.status === 'succeeded' ? item.cell_count : 0),
      0,
    );
    run.cells_failed = audits.reduce((sum, item) => sum + (item?.failed_cells ?? 0), 0);
    return structuredClone(run);
  }

  async persistWeeklyRegionSuccess(input: {
    pipelineRunId: string;
    region: WeeklyRegion;
    weekStart: string;
    weekEnd: string;
    payload: unknown;
    cellCount: number;
    sourceSha256: string;
    predictionSha256: string;
    modelCatalogVersion: string;
    schemaVersion: string;
    coverageMetadata: unknown;
    expiresAt: string;
  }): Promise<WeeklyRegionPrediction> {
    const existingIndex = this.predictions.findIndex(
      (prediction) =>
        prediction.pipeline_run_id === input.pipelineRunId && prediction.region === input.region,
    );
    const prediction: WeeklyRegionPrediction = {
      id: existingIndex >= 0 ? this.predictions[existingIndex]!.id : randomUUID(),
      pipeline_run_id: input.pipelineRunId,
      region: input.region,
      week_start: input.weekStart,
      week_end: input.weekEnd,
      payload: structuredClone(input.payload),
      cell_count: input.cellCount,
      source_sha256: input.sourceSha256,
      prediction_sha256: input.predictionSha256,
      model_catalog_version: input.modelCatalogVersion,
      schema_version: input.schemaVersion,
      coverage_metadata: structuredClone(input.coverageMetadata),
      created_at: '2026-08-31T01:00:00.000Z',
      expires_at: input.expiresAt,
    };
    if (existingIndex >= 0) this.predictions[existingIndex] = prediction;
    else this.predictions.push(prediction);
    await this.recordRegionAudit(input.pipelineRunId, input.region, {
      status: 'succeeded',
      cell_count: input.cellCount,
      failed_cells: 0,
      source_sha256: input.sourceSha256,
      prediction_sha256: input.predictionSha256,
    });
    return structuredClone(prediction);
  }

  async getLatestWeeklyPredictions(): Promise<WeeklyRegionPrediction[]> {
    return this.selectedPredictions().map((row) => structuredClone(row));
  }

  async getWeeklyPredictions(weekStart: string): Promise<WeeklyRegionPrediction[]> {
    return this.selectedPredictions(weekStart).map((row) => structuredClone(row));
  }

  async getWeeklyRegionPrediction(
    weekStart: string,
    region: WeeklyRegion,
  ): Promise<WeeklyRegionPrediction | undefined> {
    const prediction = this.selectedPredictions(weekStart).find((row) => row.region === region);
    return prediction ? structuredClone(prediction) : undefined;
  }

  async hasExpiredWeeklyRun(weekStart: string, region?: WeeklyRegion): Promise<boolean> {
    return [...this.runs.values()].some(
      (run) =>
        run.week_start === weekStart &&
        run.completed_at !== null &&
        (region === undefined
          ? Object.values(run.region_results).some((result) => result.status === 'succeeded')
          : run.region_results[region]?.status === 'succeeded'),
    );
  }

  async cleanupExpiredPredictions(now = new Date()): Promise<number> {
    this.cleanupCalls += 1;
    const retained = this.predictions.filter(
      (prediction) => new Date(prediction.expires_at).getTime() > now.getTime(),
    );
    const deleted = this.predictions.length - retained.length;
    this.predictions.splice(0, this.predictions.length, ...retained);
    return deleted;
  }

  async upsertMarketPrices(prices: readonly MarketPriceInput[]): Promise<number> {
    if (prices.length === 0) return 0;
    const snapshotSource = prices[0]?.source_name;
    const snapshotDate = prices[0]?.source_date;
    if (
      !snapshotSource?.trim() ||
      !snapshotDate?.trim() ||
      prices.some(
        (price) => price.source_name !== snapshotSource || price.source_date !== snapshotDate,
      )
    ) {
      throw new Error('Market prices must contain one complete source/date snapshot.');
    }
    const retained = this.marketPrices.filter(
      (price) =>
        price.source_name !== snapshotSource || price.source_date !== snapshotDate,
    );
    this.marketPrices.splice(0, this.marketPrices.length, ...retained);
    for (const price of prices) {
      this.marketPrices.push({
        ...price,
        id: randomUUID(),
        price_min: price.price_min === null || price.price_min === undefined
          ? null
          : String(price.price_min),
        price_max: price.price_max === null || price.price_max === undefined
          ? null
          : String(price.price_max),
        quantity: String(price.quantity),
        created_at: price.fetched_at,
      });
    }
    return prices.length;
  }

  async listMarketPrices(filters: MarketPriceFilters): Promise<MarketPrice[]> {
    const latest = new Map<string, MarketPrice>();
    for (const price of this.marketPrices
      .filter((price) => price.crop_key !== null)
      .filter((price) => !filters.crop || price.crop_key === filters.crop)
      .filter(
        (price) =>
          !filters.region || price.region?.toLowerCase() === filters.region.toLowerCase(),
      )
      .filter(
        (price) =>
          !filters.source || price.source_name.toLowerCase() === filters.source.toLowerCase(),
      )) {
      const key = `${price.crop_key}\u0000${price.source_name}`;
      const selected = latest.get(key);
      if (
        !selected ||
        price.source_date > selected.source_date ||
        (price.source_date === selected.source_date && price.fetched_at > selected.fetched_at) ||
        (price.source_date === selected.source_date &&
          price.fetched_at === selected.fetched_at &&
          price.id > selected.id)
      ) {
        latest.set(key, price);
      }
    }
    return [...latest.values()]
      .sort(
        (left, right) =>
          String(left.crop_key).localeCompare(String(right.crop_key)) ||
          left.source_name.localeCompare(right.source_name),
      )
      .slice(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 200))
      .map((price) => structuredClone(price));
  }

  async listMarketPriceHistory(
    crop: NonNullable<MarketPrice['crop_key']>,
    limit: number,
    offset: number,
  ): Promise<MarketPrice[]> {
    return this.marketPrices
      .filter((price) => price.crop_key === crop)
      .sort((left, right) => right.source_date.localeCompare(left.source_date))
      .slice(offset, offset + limit)
      .map((price) => structuredClone(price));
  }

  async listMarketCommodityPrices(
    filters: MarketCommodityPriceFilters,
  ): Promise<MarketPrice[]> {
    return this.marketPrices
      .filter(
        (price) =>
          !filters.region || price.region?.toLowerCase() === filters.region.toLowerCase(),
      )
      .filter(
        (price) =>
          !filters.source || price.source_name.toLowerCase() === filters.source.toLowerCase(),
      )
      .sort(
        (left, right) =>
          right.source_date.localeCompare(left.source_date) ||
          right.fetched_at.localeCompare(left.fetched_at) ||
          left.commodity_name_raw.localeCompare(right.commodity_name_raw) ||
          left.source_name.localeCompare(right.source_name),
      )
      .slice(filters.offset, filters.offset + filters.limit)
      .map((price) => structuredClone(price));
  }

  seedSucceededRun(input: {
    weekStart: string;
    weekEnd: string;
    region: WeeklyRegion;
    sourceSha256: string;
  }): PipelineRun {
    const run: PipelineRun = {
      id: randomUUID(),
      cadence: 'weekly',
      week_start: input.weekStart,
      week_end: input.weekEnd,
      status: 'succeeded',
      schema_version: WEEKLY_SCHEMA_VERSION,
      model_catalog_version: AUDITED_MODEL_CATALOG_VERSION,
      source_manifest_sha256: 'd'.repeat(64),
      regions_expected: 1,
      regions_succeeded: 1,
      regions_failed: 0,
      cells_succeeded: 1,
      cells_failed: 0,
      region_results: {
        [input.region]: {
          status: 'succeeded',
          cell_count: 1,
          failed_cells: 0,
          source_sha256: input.sourceSha256,
        },
      },
      started_at: '2026-08-31T00:00:00.000Z',
      completed_at: '2026-08-31T01:00:00.000Z',
      error_details: null,
      created_at: '2026-08-31T00:00:00.000Z',
      updated_at: '2026-08-31T01:00:00.000Z',
    };
    this.runs.set(run.id, run);
    this.runKeys.set(
      `${run.week_start}:${run.model_catalog_version}:${run.schema_version}`,
      run.id,
    );
    return structuredClone(run);
  }

  private requireRun(id: string): PipelineRun {
    const run = this.runs.get(id);
    if (!run) throw new Error('Pipeline run does not exist.');
    return run;
  }

  private activePredictions(): WeeklyRegionPrediction[] {
    const now = Date.now();
    return this.predictions.filter(
      (prediction) => new Date(prediction.expires_at).getTime() > now,
    );
  }

  private selectedPredictions(weekStart?: string): WeeklyRegionPrediction[] {
    const active = this.activePredictions();
    const selectedWeek = weekStart ?? active.map((row) => row.week_start).sort().at(-1);
    if (!selectedWeek) return [];
    const candidates = active.filter((row) => row.week_start === selectedWeek);
    const selectedRunId = [...new Set(candidates.map((row) => row.pipeline_run_id))]
      .sort((left, right) => {
        const leftCreated = this.runs.get(left)?.created_at ??
          candidates.find((row) => row.pipeline_run_id === left)?.created_at ?? '';
        const rightCreated = this.runs.get(right)?.created_at ??
          candidates.find((row) => row.pipeline_run_id === right)?.created_at ?? '';
        return rightCreated.localeCompare(leftCreated) || right.localeCompare(left);
      })[0];
    return candidates
      .filter((row) => row.pipeline_run_id === selectedRunId)
      .sort((left, right) => left.region.localeCompare(right.region));
  }
}
