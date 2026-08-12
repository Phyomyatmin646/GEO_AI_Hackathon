import { createHash } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../config.js';
import {
  WEEKLY_REGIONS,
  WEEKLY_SCHEMA_VERSION,
  modelTargetsForPolicy,
  type WeeklyRegion,
} from '../contracts/weekly.js';
import type { AppStore, PipelineRun, RegionAudit } from '../db/store.js';
import { AppError } from '../errors.js';
import type { WeeklyIngestRequest } from '../schemas/weekly.js';
import type { ModelServerGateway } from './model-server-client.js';
import {
  observationMonthForWeekEnd,
  readWeeklyFeatureBatches,
} from './weekly-csv.js';

export type WeeklyRegionRunResult = {
  region: WeeklyRegion;
  status: 'succeeded' | 'failed';
  cell_count: number;
  error?: string;
};

export type WeeklyRunResult = {
  run_id: string;
  status: PipelineRun['status'];
  week_start: string;
  week_end: string;
  model_catalog_version: string;
  schema_version: string;
  flagged_models_enabled: boolean;
  crop_predictions_available: boolean;
  regions: WeeklyRegionRunResult[];
};

export class WeeklyOrchestrator {
  constructor(
    private readonly config: AppConfig,
    private readonly modelServer: ModelServerGateway,
    private readonly store: AppStore,
    private readonly now: () => Date = () => new Date(),
  ) { }

  async run(request: WeeklyIngestRequest, requestId: string): Promise<WeeklyRunResult> {
    if (request.schema_checksum !== this.config.modelExpectedInputSchemaSha256) {
      throw new AppError(
        422,
        'MODEL_FEATURE_SCHEMA_MISMATCH',
        'Weekly features do not match the configured model schema.',
      );
    }
    const sourceManifestSha256 = weeklySourceManifestSha256(request);
    const readiness = await this.modelServer.getReadiness(requestId);
    const createdRun = await this.store.createOrGetPipelineRun({
      weekStart: request.week_start,
      weekEnd: request.week_end,
      schemaVersion: WEEKLY_SCHEMA_VERSION,
      modelCatalogVersion: readiness.catalog_version,
      sourceManifestSha256,
      regionsExpected: request.regions.length,
    });
    let run = createdRun.run;

    if (!createdRun.created) {
      this.assertEquivalentManifest(run, request);
      if (run.status === 'succeeded') return this.resultFromRun(run);
      const staleBefore = new Date(
        this.now().getTime() - this.config.weeklyRunStaleAfterMs,
      ).toISOString();
      const claimed = await this.store.claimPipelineRunRetry(run.id, staleBefore);
      if (!claimed) {
        throw new AppError(
          409,
          'WEEKLY_RUN_IN_PROGRESS',
          'An equivalent weekly pipeline run is already in progress.',
          false,
          { retryAfterSeconds: 10 },
        );
      }
      run = claimed;
    }

    const results: WeeklyRegionRunResult[] = [];
    const errorDetails: Partial<Record<WeeklyRegion, string>> = {};
    for (const regionManifest of request.regions) {
      const prior = run.region_results[regionManifest.region];
      if (
        prior?.source_sha256 &&
        prior.source_sha256 !== regionManifest.source_sha256
      ) {
        throw new AppError(
          409,
          'WEEKLY_SOURCE_CHANGED',
          'A previously attempted regional input cannot be replaced within the same model/schema run.',
        );
      }
      if (prior?.status === 'succeeded') {
        results.push({
          region: regionManifest.region,
          status: 'succeeded',
          cell_count: prior.cell_count,
        });
        continue;
      }

      try {
        const result = await this.runRegion(
          run.id,
          request,
          regionManifest,
          readiness.catalog_version,
          requestId,
        );
        results.push({
          region: result.region,
          status: result.status,
          cell_count: result.cell_count,
        });
      } catch (error) {
        const code = error instanceof AppError ? error.code : 'REGION_INFERENCE_FAILED';
        errorDetails[regionManifest.region] = code;
        const failedAudit: RegionAudit = {
          status: 'failed',
          cell_count: 0,
          failed_cells: regionManifest.row_count,
          source_sha256: regionManifest.source_sha256,
          error: code,
        };
        run = await this.store.recordRegionAudit(
          run.id,
          regionManifest.region,
          failedAudit,
        );
        results.push({
          region: regionManifest.region,
          status: 'failed',
          cell_count: 0,
          error: code,
        });
      }
    }

    const succeeded = results.filter((result) => result.status === 'succeeded').length;
    const finalStatus =
      succeeded === results.length
        ? 'succeeded'
        : succeeded === 0
          ? 'failed'
          : 'partially_succeeded';
    run = await this.store.markPipelineRun(run.id, finalStatus, {
      regions: errorDetails,
    });
    return {
      run_id: run.id,
      status: run.status,
      week_start: typeof run.week_start === 'string' ? run.week_start : `${(run.week_start as any).getFullYear()}-${String((run.week_start as any).getMonth() + 1).padStart(2, '0')}-${String((run.week_start as any).getDate()).padStart(2, '0')}`,
      week_end: typeof run.week_end === 'string' ? run.week_end : `${(run.week_end as any).getFullYear()}-${String((run.week_end as any).getMonth() + 1).padStart(2, '0')}-${String((run.week_end as any).getDate()).padStart(2, '0')}`,
      model_catalog_version: run.model_catalog_version,
      schema_version: run.schema_version,
      flagged_models_enabled: this.config.allowFlaggedModels,
      crop_predictions_available: this.config.allowFlaggedModels,
      regions: orderRegionResults(results),
    };
  }

  private async runRegion(
    pipelineRunId: string,
    request: WeeklyIngestRequest,
    manifest: WeeklyIngestRequest['regions'][number],
    catalogVersion: string,
    requestId: string,
  ): Promise<WeeklyRegionRunResult & { predictionSha256: string }> {
    const filePath = await this.regionCsvPath(request.week_start, manifest.region);
    const targets = modelTargetsForPolicy(this.config.allowFlaggedModels);
    const cells: Array<{
      grid_id: string;
      latitude: number;
      longitude: number;
      predictions: unknown;
    }> = [];
    let batchIndex = 0;
    let targetErrors = 0;
    for await (const batch of readWeeklyFeatureBatches({
      filePath,
      region: manifest.region,
      weekStart: request.week_start,
      weekEnd: request.week_end,
      batchSize: this.config.modelBatchSize,
      expectedRows: manifest.row_count,
      expectedSha256: manifest.source_sha256,
      expectedCoverageMetadata: manifest.coverage_metadata,
    })) {
      const batchRequestId = batchRequestIdentifier(requestId, manifest.region, batchIndex);
      const response = await this.modelServer.batchInfer(
        {
          rows: batch.map((cell) => cell.features),
          targets,
          observation_month: observationMonthForWeekEnd(request.week_end),
        },
        batchRequestId,
      );
      for (const [index, result] of response.results.entries()) {
        const source = batch[index];
        if (!source) throw new Error('Model batch row alignment failed.');
        const errors = Object.keys(result.errors);
        targetErrors += errors.length;
        cells.push({
          grid_id: source.grid_id,
          latitude: source.latitude,
          longitude: source.longitude,
          predictions: {
            values: result.predictions,
            errors: result.errors,
          },
        });
      }
      batchIndex += 1;
      // Ping DB every batch to keep connection alive through Docker NAT (5-min idle drop)
      await this.store.ping().catch(() => { });
    }

    if (targetErrors > 0) {
      throw new AppError(
        502,
        'MODEL_BATCH_PARTIAL_FAILURE',
        'The model service could not complete every requested regional prediction.',
      );
    }
    if (cells.length !== manifest.row_count) {
      throw new AppError(
        422,
        'WEEKLY_ROW_COUNT_MISMATCH',
        'The weekly feature row count changed during inference.',
      );
    }

    const generatedAt = this.now();
    const payload = {
      schema_version: WEEKLY_SCHEMA_VERSION,
      model_catalog_version: catalogVersion,
      model_input_schema_sha256: request.schema_checksum,
      week_start: request.week_start,
      week_end: request.week_end,
      region: manifest.region,
      cell_count: cells.length,
      generated_at: generatedAt.toISOString(),
      coverage_metadata: manifest.coverage_metadata,
      model_policy: {
        targets,
        allow_flagged_models: this.config.allowFlaggedModels,
        crop_predictions_available: this.config.allowFlaggedModels,
      },
      cells,
    };
    const serialized = JSON.stringify(payload);
    const predictionSha256 = createHash('sha256').update(serialized).digest('hex');
    const expiresAt = new Date(
      generatedAt.getTime() + this.config.predictionRetentionDays * 24 * 60 * 60_000,
    );
    await this.store.persistWeeklyRegionSuccess({
      pipelineRunId,
      region: manifest.region,
      weekStart: request.week_start,
      weekEnd: request.week_end,
      payload,
      cellCount: cells.length,
      sourceSha256: manifest.source_sha256,
      predictionSha256,
      modelCatalogVersion: catalogVersion,
      schemaVersion: WEEKLY_SCHEMA_VERSION,
      coverageMetadata: manifest.coverage_metadata,
      expiresAt: expiresAt.toISOString(),
    });
    return {
      region: manifest.region,
      status: 'succeeded',
      cell_count: cells.length,
      predictionSha256,
    };
  }

  private assertEquivalentManifest(run: PipelineRun, request: WeeklyIngestRequest): void {
    const requestedRegions = new Set(request.regions.map((manifest) => manifest.region));
    const auditedRegions = Object.keys(run.region_results) as WeeklyRegion[];
    if (
      request.regions.length !== run.regions_expected ||
      auditedRegions.some((region) => !requestedRegions.has(region))
    ) {
      throw new AppError(
        409,
        'WEEKLY_RUN_MANIFEST_MISMATCH',
        'A retry must use the same regional manifest as the original weekly run.',
      );
    }
    for (const manifest of request.regions) {
      const prior = run.region_results[manifest.region];
      if (prior?.source_sha256 && prior.source_sha256 !== manifest.source_sha256) {
        throw new AppError(
          409,
          'WEEKLY_SOURCE_CHANGED',
          'A previously attempted regional input cannot be replaced within the same model/schema run.',
        );
      }
    }
    if (run.source_manifest_sha256 !== weeklySourceManifestSha256(request)) {
      throw new AppError(
        409,
        'WEEKLY_RUN_MANIFEST_MISMATCH',
        'A retry must use the identical weekly source manifest.',
      );
    }
  }

  private async regionCsvPath(weekStart: string, region: WeeklyRegion): Promise<string> {
    const configuredRoot = path.resolve(this.config.weeklyDataDir);
    let root: string;
    let candidate: string;
    try {
      root = await realpath(configuredRoot);
      candidate = await realpath(
        path.resolve(configuredRoot, weekStart, 'validated', `${region}.csv`),
      );
    } catch (error) {
      throw new AppError(
        422,
        'WEEKLY_SOURCE_NOT_FOUND',
        'A validated weekly regional file is unavailable.',
        false,
        { cause: error },
      );
    }
    if (!candidate.startsWith(`${root}${path.sep}`) || !(await stat(candidate)).isFile()) {
      throw new AppError(422, 'WEEKLY_PATH_INVALID', 'The weekly input path is invalid.');
    }
    return candidate;
  }

  private resultFromRun(run: PipelineRun): WeeklyRunResult {
    const regions = WEEKLY_REGIONS.flatMap((region) => {
      const audit = run.region_results[region];
      return audit
        ? [{
          region,
          status: audit.status,
          cell_count: audit.cell_count,
          ...(audit.error ? { error: audit.error } : {}),
        }]
        : [];
    });
    return {
      run_id: run.id,
      status: run.status,
      week_start: typeof run.week_start === 'string' ? run.week_start : `${(run.week_start as any).getFullYear()}-${String((run.week_start as any).getMonth() + 1).padStart(2, '0')}-${String((run.week_start as any).getDate()).padStart(2, '0')}`,
      week_end: typeof run.week_end === 'string' ? run.week_end : `${(run.week_end as any).getFullYear()}-${String((run.week_end as any).getMonth() + 1).padStart(2, '0')}-${String((run.week_end as any).getDate()).padStart(2, '0')}`,
      model_catalog_version: run.model_catalog_version,
      schema_version: run.schema_version,
      flagged_models_enabled: this.config.allowFlaggedModels,
      crop_predictions_available: this.config.allowFlaggedModels,
      regions,
    };
  }
}

function orderRegionResults(results: WeeklyRegionRunResult[]): WeeklyRegionRunResult[] {
  const order = new Map(WEEKLY_REGIONS.map((region, index) => [region, index]));
  return [...results].sort(
    (left, right) => (order.get(left.region) ?? 0) - (order.get(right.region) ?? 0),
  );
}

function batchRequestIdentifier(
  requestId: string,
  region: WeeklyRegion,
  batchIndex: number,
): string {
  const suffix = `${region}:${batchIndex}`;
  const prefix = requestId.slice(0, Math.max(1, 127 - suffix.length));
  return `${prefix}:${suffix}`;
}

export function weeklySourceManifestSha256(request: WeeklyIngestRequest): string {
  const canonicalRequest = {
    ...request,
    regions: [...request.regions].sort((left, right) => left.region.localeCompare(right.region)),
  };
  return createHash('sha256')
    .update(JSON.stringify(canonicalValue(canonicalRequest)))
    .digest('hex');
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}
