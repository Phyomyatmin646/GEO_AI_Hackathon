import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUDITED_MODEL_CATALOG_VERSION,
  HEALTHY_MODEL_TARGETS,
  MODEL_INPUT_SCHEMA_SHA256,
  WEEKLY_SCHEMA_VERSION,
  type WeeklyRegion,
} from '../src/contracts/weekly.js';
import type { WeeklyIngestRequest } from '../src/schemas/weekly.js';
import type { ModelServerGateway } from '../src/services/model-server-client.js';
import {
  WeeklyOrchestrator,
  weeklySourceManifestSha256,
} from '../src/services/weekly-orchestrator.js';
import {
  MemoryStore,
  batchResponseFixture,
  modelCatalogFixture,
  modelFeatureRow,
  predictionFixture,
  readinessFixture,
  sha256Text,
  testConfig,
  weeklyCoverageFixture,
  weeklyCsv,
} from './helpers.js';

function fakeModelServer(
  overrides: Partial<ModelServerGateway> = {},
): ModelServerGateway {
  return {
    predict: vi.fn(async (_request, requestId) => predictionFixture(requestId)),
    batchInfer: vi.fn(async (request) => batchResponseFixture(request)),
    getModels: vi.fn(async () => modelCatalogFixture()),
    getReadiness: vi.fn(async () => readinessFixture()),
    getCircuitState: vi.fn(() => ({ state: 'closed' as const, consecutive_failures: 0 })),
    ...overrides,
  };
}

function manifest(
  region: WeeklyRegion,
  csv: string,
  rowCount = 1,
): WeeklyIngestRequest['regions'][number] {
  return {
    region,
    row_count: rowCount,
    source_sha256: sha256Text(csv),
    coverage_metadata: weeklyCoverageFixture(),
  };
}

describe('WeeklyOrchestrator', () => {
  let weeklyRoot: string;

  beforeEach(async () => {
    weeklyRoot = await mkdtemp(path.join(tmpdir(), 'geoai-orchestrator-test-'));
    await mkdir(path.join(weeklyRoot, '2026-08-31', 'validated'), { recursive: true });
  });

  afterEach(async () => {
    await rm(weeklyRoot, { recursive: true, force: true });
  });

  async function save(region: WeeklyRegion, csv: string): Promise<void> {
    await writeFile(
      path.join(weeklyRoot, '2026-08-31', 'validated', `${region}.csv`),
      csv,
      'utf8',
    );
  }

  it('persists a seven-day result and returns an existing successful run idempotently', async () => {
    const csv = weeklyCsv([modelFeatureRow('mm_123_456', 'yangon', 9)]);
    await save('yangon', csv);
    const store = new MemoryStore();
    const modelServer = fakeModelServer();
    const now = new Date('2026-09-07T02:30:00.000Z');
    const orchestrator = new WeeklyOrchestrator(
      testConfig({ weeklyDataDir: weeklyRoot, predictionRetentionDays: 7 }),
      modelServer,
      store,
      () => now,
    );
    const request: WeeklyIngestRequest = {
      week_start: '2026-08-31',
      week_end: '2026-09-07',
      schema_checksum: MODEL_INPUT_SCHEMA_SHA256,
      regions: [manifest('yangon', csv)],
    };

    const first = await orchestrator.run(request, 'weekly-first');
    const second = await orchestrator.run(request, 'weekly-second');

    expect(first).toMatchObject({
      status: 'succeeded',
      week_start: '2026-08-31',
      week_end: '2026-09-07',
      flagged_models_enabled: false,
      crop_predictions_available: false,
      regions: [{ region: 'yangon', status: 'succeeded', cell_count: 1 }],
    });
    expect(second).toEqual(first);
    expect(modelServer.batchInfer).toHaveBeenCalledOnce();
    expect(modelServer.batchInfer).toHaveBeenCalledWith(
      expect.objectContaining({
        observation_month: '2026-09',
        targets: [...HEALTHY_MODEL_TARGETS],
      }),
      expect.stringMatching(/weekly-first:yangon:0$/),
    );
    expect(store.predictions).toHaveLength(1);
    expect(store.predictions[0]?.expires_at).toBe('2026-09-14T02:30:00.000Z');
    expect(store.predictions[0]?.payload).toMatchObject({
      week_start: '2026-08-31',
      week_end: '2026-09-07',
      region: 'yangon',
      cell_count: 1,
      model_policy: {
        allow_flagged_models: false,
        crop_predictions_available: false,
      },
    });

    await expect(
      orchestrator.run(
        {
          ...request,
          regions: [{ ...request.regions[0]!, source_sha256: 'f'.repeat(64) }],
        },
        'weekly-changed-source',
      ),
    ).rejects.toMatchObject({ code: 'WEEKLY_SOURCE_CHANGED', statusCode: 409 });
  });

  it('records partial regional failure and retries only the failed region', async () => {
    const yangonCsv = weeklyCsv([modelFeatureRow('mm_123_456', 'yangon', 9)], {
      region: 'yangon',
    });
    const bagoCsv = weeklyCsv([modelFeatureRow('mm_222_333', 'bago', 9)], {
      region: 'bago',
    });
    await save('yangon', yangonCsv);
    await save('bago', bagoCsv);

    let failBago = true;
    const batchInfer = vi.fn(async (request: Parameters<ModelServerGateway['batchInfer']>[0]) => {
      if (request.rows[0]?.grid_id === 'mm_222_333' && failBago) {
        throw new Error('private regional upstream failure');
      }
      return batchResponseFixture(request);
    });
    const modelServer = fakeModelServer({ batchInfer });
    const store = new MemoryStore();
    const orchestrator = new WeeklyOrchestrator(
      testConfig({ weeklyDataDir: weeklyRoot }),
      modelServer,
      store,
      () => new Date('2026-09-07T03:00:00.000Z'),
    );
    const request: WeeklyIngestRequest = {
      week_start: '2026-08-31',
      week_end: '2026-09-07',
      schema_checksum: MODEL_INPUT_SCHEMA_SHA256,
      regions: [manifest('yangon', yangonCsv), manifest('bago', bagoCsv)],
    };

    const partial = await orchestrator.run(request, 'partial-first');
    expect(partial).toMatchObject({
      status: 'partially_succeeded',
      regions: [
        { region: 'yangon', status: 'succeeded', cell_count: 1 },
        { region: 'bago', status: 'failed', cell_count: 0, error: 'REGION_INFERENCE_FAILED' },
      ],
    });
    expect(store.predictions.map((row) => row.region)).toEqual(['yangon']);
    const partialRun = [...store.runs.values()][0]!;
    expect(partialRun).toMatchObject({
      regions_succeeded: 1,
      regions_failed: 1,
      cells_succeeded: 1,
      cells_failed: 1,
    });
    expect(JSON.stringify(partial)).not.toContain('private regional upstream failure');

    failBago = false;
    const recovered = await orchestrator.run(request, 'partial-retry');
    expect(recovered.status).toBe('succeeded');
    expect(recovered.regions).toEqual([
      { region: 'yangon', status: 'succeeded', cell_count: 1 },
      { region: 'bago', status: 'succeeded', cell_count: 1 },
    ]);
    expect(store.predictions.map((row) => row.region).sort()).toEqual(['bago', 'yangon']);
    expect(batchInfer.mock.calls.map(([batch]) => batch.rows[0]?.grid_id)).toEqual([
      'mm_123_456',
      'mm_222_333',
      'mm_222_333',
    ]);
  });

  it('rejects an active duplicate but reclaims a stale processing run', async () => {
    const csv = weeklyCsv([modelFeatureRow('mm_123_456', 'yangon', 9)]);
    await save('yangon', csv);
    const store = new MemoryStore();
    const request: WeeklyIngestRequest = {
      week_start: '2026-08-31',
      week_end: '2026-09-07',
      schema_checksum: MODEL_INPUT_SCHEMA_SHA256,
      regions: [manifest('yangon', csv)],
    };
    await store.createOrGetPipelineRun({
      weekStart: '2026-08-31',
      weekEnd: '2026-09-07',
      schemaVersion: WEEKLY_SCHEMA_VERSION,
      modelCatalogVersion: AUDITED_MODEL_CATALOG_VERSION,
      sourceManifestSha256: weeklySourceManifestSha256(request),
      regionsExpected: 1,
    });

    const active = new WeeklyOrchestrator(
      testConfig({ weeklyDataDir: weeklyRoot, weeklyRunStaleAfterMs: 24 * 60 * 60_000 }),
      fakeModelServer(),
      store,
      () => new Date('2026-08-31T12:00:00.000Z'),
    );
    await expect(active.run(request, 'active-duplicate')).rejects.toMatchObject({
      code: 'WEEKLY_RUN_IN_PROGRESS',
      statusCode: 409,
    });
    await expect(
      active.run(
        {
          ...request,
          regions: [{ ...request.regions[0]!, source_sha256: 'f'.repeat(64) }],
        },
        'changed-before-audit',
      ),
    ).rejects.toMatchObject({
      code: 'WEEKLY_RUN_MANIFEST_MISMATCH',
      statusCode: 409,
    });

    const stale = new WeeklyOrchestrator(
      testConfig({ weeklyDataDir: weeklyRoot, weeklyRunStaleAfterMs: 24 * 60 * 60_000 }),
      fakeModelServer(),
      store,
      () => new Date('2026-09-02T00:00:00.000Z'),
    );
    await expect(stale.run(request, 'stale-retry')).resolves.toMatchObject({
      status: 'succeeded',
      regions: [{ region: 'yangon', status: 'succeeded' }],
    });
  });

  it('rejects schema drift before readiness, persistence, or inference', async () => {
    const store = new MemoryStore();
    const modelServer = fakeModelServer();
    const orchestrator = new WeeklyOrchestrator(
      testConfig({ weeklyDataDir: weeklyRoot }),
      modelServer,
      store,
    );
    const request = {
      week_start: '2026-08-31',
      week_end: '2026-09-07',
      schema_checksum: '0'.repeat(64),
      regions: [],
    } as unknown as WeeklyIngestRequest;

    await expect(orchestrator.run(request, 'schema-drift')).rejects.toMatchObject({
      code: 'MODEL_FEATURE_SCHEMA_MISMATCH',
      statusCode: 422,
    });
    expect(modelServer.getReadiness).not.toHaveBeenCalled();
    expect(store.runs.size).toBe(0);
  });
});
