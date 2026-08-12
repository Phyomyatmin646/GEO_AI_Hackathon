import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import type { CropKey, WeeklyRegion } from '../contracts/weekly.js';
import { MARKET_MAPPING_VERSION } from '../market-mapping-version.js';
import type {
  CropCalendarModelKey,
  CropCalendarRegion,
} from '../schemas/crop-calendars.js';
import type { RegisteredUser, UserRegistrationInput } from '../schemas/users.js';

export class UserRegistrationConflictError extends Error {
  constructor() {
    super('A registration uniqueness constraint was violated.');
    this.name = 'UserRegistrationConflictError';
  }
}

export type PipelineRunStatus =
  | 'pending'
  | 'processing'
  | 'partially_succeeded'
  | 'succeeded'
  | 'failed';

export type RegionAudit = {
  status: 'succeeded' | 'failed';
  cell_count: number;
  failed_cells: number;
  source_sha256?: string;
  prediction_sha256?: string;
  error?: string;
};

export type PipelineRun = {
  id: string;
  cadence: 'weekly';
  week_start: string;
  week_end: string;
  status: PipelineRunStatus;
  schema_version: string;
  model_catalog_version: string;
  source_manifest_sha256: string;
  regions_expected: number;
  regions_succeeded: number;
  regions_failed: number;
  cells_succeeded: number;
  cells_failed: number;
  region_results: Partial<Record<WeeklyRegion, RegionAudit>>;
  started_at: string;
  completed_at: string | null;
  error_details: unknown | null;
  created_at: string;
  updated_at: string;
};

export type WeeklyRegionPrediction = {
  id: string;
  pipeline_run_id: string;
  region: WeeklyRegion;
  week_start: string;
  week_end: string;
  payload: unknown;
  cell_count: number;
  source_sha256: string;
  prediction_sha256: string;
  model_catalog_version: string;
  schema_version: string;
  coverage_metadata: unknown;
  created_at: string;
  expires_at: string;
};

export type MarketPriceInput = {
  crop_key: CropKey | null;
  commodity_name_raw: string;
  variety?: string | null;
  region?: string | null;
  marketplace?: string | null;
  price_min?: string | number | null;
  price_max?: string | number | null;
  currency: string;
  quantity: string | number;
  unit: string;
  source_name: string;
  source_date: string;
  source_url: string;
  fetched_at: string;
  raw_payload: unknown;
};

export type MarketPrice = MarketPriceInput & {
  id: string;
  price_min: string | null;
  price_max: string | null;
  quantity: string;
  created_at: string;
};

export type MarketPriceFilters = {
  crop?: CropKey;
  region?: string;
  source?: string;
  limit?: number;
  offset?: number;
};

export type MarketCommodityPriceFilters = {
  source?: string;
  region?: string;
  limit: number;
  offset: number;
};

export type CropCalendarVerificationStatus =
  | 'verified'
  | 'needs_verification'
  | 'insufficient_evidence'
  | 'not_applicable'
  | 'not_recommended';

export type CropCalendarCropSummary = {
  model_key: CropCalendarModelKey;
  crop_name_en: string;
  crop_name_mm: string;
  crop_type: 'annual' | 'perennial';
};

export type CropCalendar = CropCalendarCropSummary & {
  id: string;
  region: CropCalendarRegion;
  township: string | null;
  season: string | null;
  planting_start_month: number | null;
  planting_end_month: number | null;
  harvest_start_month: number | null;
  harvest_end_month: number | null;
  growing_duration_min_days: number | null;
  growing_duration_max_days: number | null;
  establishment_start_month: number | null;
  establishment_end_month: number | null;
  years_to_first_harvest_min: number | null;
  years_to_first_harvest_max: number | null;
  harvest_season_start_month: number | null;
  harvest_season_end_month: number | null;
  notes_en: string | null;
  notes_mm: string | null;
  source_code: string | null;
  source_name: string | null;
  source_title: string | null;
  source_url: string | null;
  publication_year: number | null;
  evidence_type: string | null;
  geographic_specificity: string | null;
  verification_status: CropCalendarVerificationStatus;
  confidence: number | null;
  last_verified_date: string | null;
  last_updated: string;
  dataset_version: string;
  data_quality_note: string | null;
  created_at: string;
  updated_at: string;
};

export interface AppStore {
  ping(): Promise<void>;
  close(): Promise<void>;
  registerUser(input: UserRegistrationInput): Promise<RegisteredUser>;
  createOrGetPipelineRun(input: {
    weekStart: string;
    weekEnd: string;
    schemaVersion: string;
    modelCatalogVersion: string;
    sourceManifestSha256: string;
    regionsExpected: number;
  }): Promise<{ run: PipelineRun; created: boolean }>;
  getPipelineRun(id: string): Promise<PipelineRun | undefined>;
  claimPipelineRunRetry(id: string, staleBefore: string): Promise<PipelineRun | undefined>;
  listPipelineRuns(limit: number, offset: number): Promise<PipelineRun[]>;
  markPipelineRun(
    id: string,
    status: PipelineRunStatus,
    errorDetails?: unknown,
  ): Promise<PipelineRun>;
  recordRegionAudit(id: string, region: WeeklyRegion, audit: RegionAudit): Promise<PipelineRun>;
  persistWeeklyRegionSuccess(input: {
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
  }): Promise<WeeklyRegionPrediction>;
  getLatestWeeklyPredictions(): Promise<WeeklyRegionPrediction[]>;
  getWeeklyPredictions(weekStart: string): Promise<WeeklyRegionPrediction[]>;
  getWeeklyRegionPrediction(
    weekStart: string,
    region: WeeklyRegion,
  ): Promise<WeeklyRegionPrediction | undefined>;
  hasExpiredWeeklyRun(weekStart: string, region?: WeeklyRegion): Promise<boolean>;
  cleanupExpiredPredictions(now?: Date): Promise<number>;
  upsertMarketPrices(prices: readonly MarketPriceInput[]): Promise<number>;
  listMarketPrices(filters: MarketPriceFilters): Promise<MarketPrice[]>;
  listMarketPriceHistory(crop: CropKey, limit: number, offset: number): Promise<MarketPrice[]>;
  listMarketCommodityPrices(filters: MarketCommodityPriceFilters): Promise<MarketPrice[]>;
  listCropCalendarCrops(): Promise<CropCalendarCropSummary[]>;
  listCropCalendarsByRegion(region: CropCalendarRegion): Promise<CropCalendar[]>;
  getCropCalendar(input: {
    modelKey: CropCalendarModelKey;
    region: CropCalendarRegion;
    season?: string;
  }): Promise<CropCalendar | undefined>;
}

type StoreOptions = {
  maximumConnections?: number;
  connectionTimeoutMs?: number;
};

export class PostgresStore implements AppStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string, options: StoreOptions = {}) {
    if (!databaseUrl.trim()) throw new Error('DATABASE_URL is required.');
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: options.maximumConnections ?? 5,
      connectionTimeoutMillis: options.connectionTimeoutMs ?? 10_000,
      idleTimeoutMillis: 30_000,   // 30s — prevents Docker NAT 5-minute silent drop
      allowExitOnIdle: true,
      keepAlive: true,
      keepAliveInitialDelayMillis: 30_000,
    });
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async registerUser(input: UserRegistrationInput): Promise<RegisteredUser> {
    const result = await this.pool.query<QueryResultRow>(
      `INSERT INTO app_users (username, phone, location, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id, username, phone, location, email, created_at`,
      [input.username, input.phone, input.location, input.email ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new UserRegistrationConflictError();
    return mapRegisteredUser(row);
  }

  async createOrGetPipelineRun(input: {
    weekStart: string;
    weekEnd: string;
    schemaVersion: string;
    modelCatalogVersion: string;
    sourceManifestSha256: string;
    regionsExpected: number;
  }): Promise<{ run: PipelineRun; created: boolean }> {
    const result = await this.pool.query<QueryResultRow>(
      `INSERT INTO pipeline_runs (
         cadence, week_start, week_end, status, schema_version,
         model_catalog_version, source_manifest_sha256, regions_expected
       ) VALUES ('weekly', $1, $2, 'processing', $3, $4, $5, $6)
       ON CONFLICT (week_start, model_catalog_version, schema_version) DO NOTHING
       RETURNING *`,
      [
        input.weekStart,
        input.weekEnd,
        input.schemaVersion,
        input.modelCatalogVersion,
        input.sourceManifestSha256,
        input.regionsExpected,
      ],
    );
    if (result.rows[0]) return { run: mapPipelineRun(result.rows[0]), created: true };
    const existing = await this.pool.query<QueryResultRow>(
      `SELECT * FROM pipeline_runs
       WHERE week_start = $1 AND model_catalog_version = $2 AND schema_version = $3`,
      [input.weekStart, input.modelCatalogVersion, input.schemaVersion],
    );
    return {
      run: mapPipelineRun(requireRow(existing.rows[0], 'pipeline run')),
      created: false,
    };
  }

  async getPipelineRun(id: string): Promise<PipelineRun | undefined> {
    const result = await this.pool.query<QueryResultRow>(
      'SELECT * FROM pipeline_runs WHERE id = $1',
      [id],
    );
    return result.rows[0] ? mapPipelineRun(result.rows[0]) : undefined;
  }

  async claimPipelineRunRetry(
    id: string,
    staleBefore: string,
  ): Promise<PipelineRun | undefined> {
    const result = await this.pool.query<QueryResultRow>(
      `UPDATE pipeline_runs
       SET status = 'processing', completed_at = NULL, error_details = NULL, updated_at = NOW()
       WHERE id = $1
         AND (
           status IN ('failed', 'partially_succeeded')
           OR (
             status IN ('pending', 'processing')
             AND updated_at <= $2::timestamptz
           )
         )
       RETURNING *`,
      [id, staleBefore],
    );
    return result.rows[0] ? mapPipelineRun(result.rows[0]) : undefined;
  }

  async listPipelineRuns(limit: number, offset: number): Promise<PipelineRun[]> {
    const result = await this.pool.query<QueryResultRow>(
      `SELECT * FROM pipeline_runs
       ORDER BY week_start DESC, created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return result.rows.map(mapPipelineRun);
  }

  async markPipelineRun(
    id: string,
    status: PipelineRunStatus,
    errorDetails?: unknown,
  ): Promise<PipelineRun> {
    const completed = ['partially_succeeded', 'succeeded', 'failed'].includes(status);
    const result = await this.pool.query<QueryResultRow>(
      `UPDATE pipeline_runs
       SET status = $2,
           error_details = $3::jsonb,
           completed_at = CASE WHEN $4 THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, JSON.stringify(errorDetails ?? null), completed],
    );
    return mapPipelineRun(requireRow(result.rows[0], 'pipeline run'));
  }

  async recordRegionAudit(
    id: string,
    region: WeeklyRegion,
    audit: RegionAudit,
  ): Promise<PipelineRun> {
    const result = await this.pool.query<QueryResultRow>(
      RECORD_REGION_AUDIT_SQL,
      [id, region, JSON.stringify(audit)],
    );
    return mapPipelineRun(requireRow(result.rows[0], 'pipeline run'));
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
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockPipelineRun(client, input.pipelineRunId);
      const result = await client.query<QueryResultRow>(
        `INSERT INTO weekly_region_predictions (
           pipeline_run_id, region, week_start, week_end, payload, cell_count,
           source_sha256, prediction_sha256, model_catalog_version,
           schema_version, coverage_metadata, expires_at
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::jsonb, $12)
         ON CONFLICT (pipeline_run_id, region)
         DO UPDATE SET
           payload = EXCLUDED.payload,
           cell_count = EXCLUDED.cell_count,
           source_sha256 = EXCLUDED.source_sha256,
           prediction_sha256 = EXCLUDED.prediction_sha256,
           model_catalog_version = EXCLUDED.model_catalog_version,
           schema_version = EXCLUDED.schema_version,
           coverage_metadata = EXCLUDED.coverage_metadata,
           created_at = NOW(),
           expires_at = EXCLUDED.expires_at
         RETURNING *`,
        [
          input.pipelineRunId,
          input.region,
          input.weekStart,
          input.weekEnd,
          JSON.stringify(input.payload),
          input.cellCount,
          input.sourceSha256,
          input.predictionSha256,
          input.modelCatalogVersion,
          input.schemaVersion,
          JSON.stringify(input.coverageMetadata),
          input.expiresAt,
        ],
      );
      await client.query<QueryResultRow>(RECORD_REGION_AUDIT_SQL, [
        input.pipelineRunId,
        input.region,
        JSON.stringify({
          status: 'succeeded',
          cell_count: input.cellCount,
          failed_cells: 0,
          source_sha256: input.sourceSha256,
          prediction_sha256: input.predictionSha256,
        } satisfies RegionAudit),
      ]);
      await client.query('COMMIT');
      return mapWeeklyPrediction(requireRow(result.rows[0], 'regional prediction'));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getLatestWeeklyPredictions(): Promise<WeeklyRegionPrediction[]> {
    const result = await this.pool.query<QueryResultRow>(
      `WITH selected_run AS (
         SELECT predictions.pipeline_run_id
         FROM weekly_region_predictions AS predictions
         JOIN pipeline_runs AS runs ON runs.id = predictions.pipeline_run_id
         WHERE predictions.expires_at > NOW()
         ORDER BY predictions.week_start DESC, runs.created_at DESC, runs.id DESC
         LIMIT 1
       )
       SELECT predictions.*
       FROM weekly_region_predictions AS predictions
       WHERE predictions.pipeline_run_id = (SELECT pipeline_run_id FROM selected_run)
         AND predictions.expires_at > NOW()
       ORDER BY predictions.region`,
    );
    return result.rows.map(mapWeeklyPrediction);
  }

  async getWeeklyPredictions(weekStart: string): Promise<WeeklyRegionPrediction[]> {
    const result = await this.pool.query<QueryResultRow>(
      `WITH selected_run AS (
         SELECT predictions.pipeline_run_id
         FROM weekly_region_predictions AS predictions
         JOIN pipeline_runs AS runs ON runs.id = predictions.pipeline_run_id
         WHERE predictions.week_start = $1 AND predictions.expires_at > NOW()
         ORDER BY runs.created_at DESC, runs.id DESC
         LIMIT 1
       )
       SELECT predictions.*
       FROM weekly_region_predictions AS predictions
       WHERE predictions.pipeline_run_id = (SELECT pipeline_run_id FROM selected_run)
         AND predictions.expires_at > NOW()
       ORDER BY predictions.region`,
      [weekStart],
    );
    return result.rows.map(mapWeeklyPrediction);
  }

  async getWeeklyRegionPrediction(
    weekStart: string,
    region: WeeklyRegion,
  ): Promise<WeeklyRegionPrediction | undefined> {
    const result = await this.pool.query<QueryResultRow>(
      `WITH selected_run AS (
         SELECT predictions.pipeline_run_id
         FROM weekly_region_predictions AS predictions
         JOIN pipeline_runs AS runs ON runs.id = predictions.pipeline_run_id
         WHERE predictions.week_start = $1 AND predictions.expires_at > NOW()
         ORDER BY runs.created_at DESC, runs.id DESC
         LIMIT 1
       )
       SELECT predictions.*
       FROM weekly_region_predictions AS predictions
       WHERE predictions.pipeline_run_id = (SELECT pipeline_run_id FROM selected_run)
         AND predictions.region = $2
         AND predictions.expires_at > NOW()`,
      [weekStart, region],
    );
    return result.rows[0] ? mapWeeklyPrediction(result.rows[0]) : undefined;
  }

  async hasExpiredWeeklyRun(weekStart: string, region?: WeeklyRegion): Promise<boolean> {
    const result = await this.pool.query<{ found: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pipeline_runs AS runs
         WHERE runs.week_start = $1
           AND (
             ($2::text IS NULL AND EXISTS (
               SELECT 1
               FROM jsonb_each(runs.region_results)
               WHERE value->>'status' = 'succeeded'
             ))
             OR (runs.region_results -> $2::text ->> 'status') = 'succeeded'
           )
           AND runs.completed_at IS NOT NULL
       ) AS found`,
      [weekStart, region ?? null],
    );
    return result.rows[0]?.found ?? false;
  }

  async cleanupExpiredPredictions(now = new Date()): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM weekly_region_predictions WHERE expires_at <= $1',
      [now.toISOString()],
    );
    return result.rowCount ?? 0;
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
    const client = await this.pool.connect();
    let inserted = 0;
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [snapshotSource, snapshotDate],
      );
      // Every adapter supplies one complete dated snapshot. Replacing it
      // transactionally keeps same-day corrections and removals truthful.
      await client.query(
        `DELETE FROM crop_market_prices
         WHERE source_name = $1 AND source_date = $2 AND mapping_version = $3`,
        [snapshotSource, snapshotDate, MARKET_MAPPING_VERSION],
      );
      for (const price of prices) {
        const result = await client.query(
          `INSERT INTO crop_market_prices (
             crop_key, commodity_name_raw, variety, region, marketplace,
             price_min, price_max, currency, quantity, unit, source_name,
             source_date, source_url, fetched_at, raw_payload, mapping_version
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16
           ) ON CONFLICT DO NOTHING`,
          [
            price.crop_key,
            price.commodity_name_raw,
            price.variety ?? null,
            price.region ?? null,
            price.marketplace ?? null,
            price.price_min ?? null,
            price.price_max ?? null,
            price.currency,
            price.quantity,
            price.unit,
            price.source_name,
            price.source_date,
            price.source_url,
            price.fetched_at,
            JSON.stringify(price.raw_payload),
            MARKET_MAPPING_VERSION,
          ],
        );
        inserted += result.rowCount ?? 0;
      }
      await client.query('COMMIT');
      return inserted;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listMarketPrices(filters: MarketPriceFilters): Promise<MarketPrice[]> {
    const conditions: string[] = ['crop_key IS NOT NULL', 'mapping_version = $1'];
    const values: unknown[] = [MARKET_MAPPING_VERSION];
    const add = (condition: string, value: unknown) => {
      values.push(value);
      conditions.push(condition.replace('?', `$${values.length}`));
    };
    if (filters.crop) add('crop_key = ?', filters.crop);
    if (filters.region) add('LOWER(region) = LOWER(?)', filters.region);
    if (filters.source) add('LOWER(source_name) = LOWER(?)', filters.source);
    values.push(filters.limit ?? 200, filters.offset ?? 0);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query<QueryResultRow>(
      `WITH latest_per_crop_source AS (
         SELECT *, ROW_NUMBER() OVER (
           PARTITION BY crop_key, source_name
           ORDER BY source_date DESC, fetched_at DESC, id DESC
         ) AS latest_rank
         FROM crop_market_prices
         ${where}
       )
       SELECT * FROM latest_per_crop_source
       WHERE latest_rank = 1
       ORDER BY crop_key, source_name
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return result.rows.map(mapMarketPrice);
  }

  async listMarketPriceHistory(
    crop: CropKey,
    limit: number,
    offset: number,
  ): Promise<MarketPrice[]> {
    const result = await this.pool.query<QueryResultRow>(
      `SELECT * FROM crop_market_prices
       WHERE crop_key = $1 AND mapping_version = $2
       ORDER BY source_date DESC, fetched_at DESC, source_name
       LIMIT $3 OFFSET $4`,
      [crop, MARKET_MAPPING_VERSION, limit, offset],
    );
    return result.rows.map(mapMarketPrice);
  }

  async listMarketCommodityPrices(
    filters: MarketCommodityPriceFilters,
  ): Promise<MarketPrice[]> {
    const conditions: string[] = ['mapping_version = $1'];
    const values: unknown[] = [MARKET_MAPPING_VERSION];
    const add = (condition: string, value: unknown) => {
      values.push(value);
      conditions.push(condition.replace('?', `$${values.length}`));
    };
    if (filters.region) add('LOWER(region) = LOWER(?)', filters.region);
    if (filters.source) add('LOWER(source_name) = LOWER(?)', filters.source);
    values.push(filters.limit, filters.offset);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query<QueryResultRow>(
      `SELECT * FROM crop_market_prices
       ${where}
       ORDER BY source_date DESC, fetched_at DESC, commodity_name_raw, source_name
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return result.rows.map(mapMarketPrice);
  }

  async listCropCalendarCrops(): Promise<CropCalendarCropSummary[]> {
    const result = await this.pool.query<QueryResultRow>(
      `SELECT DISTINCT ON (model_key)
         model_key, crop_name_en, crop_name_mm, crop_type
       FROM crop_calendars
       WHERE is_active
       ORDER BY model_key, last_updated DESC, updated_at DESC, id`,
    );
    return result.rows.map(mapCropCalendarCropSummary);
  }

  async listCropCalendarsByRegion(region: CropCalendarRegion): Promise<CropCalendar[]> {
    const result = await this.pool.query<QueryResultRow>(
      `SELECT * FROM crop_calendars
       WHERE is_active AND region = $1 AND township IS NULL
       ORDER BY model_key, season NULLS FIRST, last_updated DESC, id`,
      [region],
    );
    return result.rows.map(mapCropCalendar);
  }

  async getCropCalendar(input: {
    modelKey: CropCalendarModelKey;
    region: CropCalendarRegion;
    season?: string;
  }): Promise<CropCalendar | undefined> {
    const season = input.season ?? null;
    const result = await this.pool.query<QueryResultRow>(
      `SELECT * FROM crop_calendars
       WHERE is_active
         AND model_key = $1
         AND region = $2
         AND township IS NULL
         AND ($3::text IS NULL OR LOWER(season) = LOWER($3))
       ORDER BY
         last_updated DESC,
         updated_at DESC,
         id
       LIMIT 1`,
      [input.modelKey, input.region, season],
    );
    return result.rows[0] ? mapCropCalendar(result.rows[0]) : undefined;
  }
}

const RECORD_REGION_AUDIT_SQL = `WITH updated AS (
  SELECT region_results || jsonb_build_object($2::text, $3::jsonb) AS results
  FROM pipeline_runs
  WHERE id = $1
  FOR UPDATE
)
UPDATE pipeline_runs AS runs
SET region_results = updated.results,
    regions_succeeded = (
      SELECT COUNT(*) FROM jsonb_each(updated.results)
      WHERE value->>'status' = 'succeeded'
    ),
    regions_failed = (
      SELECT COUNT(*) FROM jsonb_each(updated.results)
      WHERE value->>'status' = 'failed'
    ),
    cells_succeeded = COALESCE((
      SELECT SUM((value->>'cell_count')::integer)
      FROM jsonb_each(updated.results)
      WHERE value->>'status' = 'succeeded'
    ), 0),
    cells_failed = COALESCE((
      SELECT SUM((value->>'failed_cells')::integer)
      FROM jsonb_each(updated.results)
    ), 0),
    updated_at = NOW()
FROM updated
WHERE runs.id = $1
RETURNING runs.*`;

async function lockPipelineRun(client: PoolClient, id: string): Promise<void> {
  const result = await client.query('SELECT id FROM pipeline_runs WHERE id = $1 FOR UPDATE', [id]);
  if (result.rowCount !== 1) throw new Error('Pipeline run does not exist.');
}

function requireRow<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Database did not return the expected ${label}.`);
  return value;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  throw new Error('Database returned an invalid date value.');
}

function nullableIso(value: unknown): string | null {
  return value === null ? null : iso(value);
}

function formatDateOnly(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value);
}

function mapPipelineRun(row: QueryResultRow): PipelineRun {
  return {
    id: String(row.id),
    cadence: 'weekly',
    week_start: formatDateOnly(row.week_start),
    week_end: formatDateOnly(row.week_end),
    status: row.status as PipelineRunStatus,
    schema_version: String(row.schema_version),
    model_catalog_version: String(row.model_catalog_version),
    source_manifest_sha256: String(row.source_manifest_sha256),
    regions_expected: Number(row.regions_expected),
    regions_succeeded: Number(row.regions_succeeded),
    regions_failed: Number(row.regions_failed),
    cells_succeeded: Number(row.cells_succeeded),
    cells_failed: Number(row.cells_failed),
    region_results: (row.region_results ?? {}) as Partial<Record<WeeklyRegion, RegionAudit>>,
    started_at: iso(row.started_at),
    completed_at: nullableIso(row.completed_at),
    error_details: row.error_details ?? null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function mapWeeklyPrediction(row: QueryResultRow): WeeklyRegionPrediction {
  return {
    id: String(row.id),
    pipeline_run_id: String(row.pipeline_run_id),
    region: row.region as WeeklyRegion,
    week_start: formatDateOnly(row.week_start),
    week_end: formatDateOnly(row.week_end),
    payload: row.payload,
    cell_count: Number(row.cell_count),
    source_sha256: String(row.source_sha256),
    prediction_sha256: String(row.prediction_sha256),
    model_catalog_version: String(row.model_catalog_version),
    schema_version: String(row.schema_version),
    coverage_metadata: row.coverage_metadata,
    created_at: iso(row.created_at),
    expires_at: iso(row.expires_at),
  };
}

function mapMarketPrice(row: QueryResultRow): MarketPrice {
  return {
    id: String(row.id),
    crop_key: row.crop_key === null ? null : row.crop_key as CropKey,
    commodity_name_raw: String(row.commodity_name_raw),
    variety: row.variety === null ? null : String(row.variety),
    region: row.region === null ? null : String(row.region),
    marketplace: row.marketplace === null ? null : String(row.marketplace),
    price_min: row.price_min === null ? null : String(row.price_min),
    price_max: row.price_max === null ? null : String(row.price_max),
    currency: String(row.currency),
    quantity: String(row.quantity),
    unit: String(row.unit),
    source_name: String(row.source_name),
    source_date: String(row.source_date),
    source_url: String(row.source_url),
    fetched_at: iso(row.fetched_at),
    raw_payload: row.raw_payload,
    created_at: iso(row.created_at),
  };
}

function mapCropCalendarCropSummary(row: QueryResultRow): CropCalendarCropSummary {
  return {
    model_key: row.model_key as CropCalendarModelKey,
    crop_name_en: String(row.crop_name_en),
    crop_name_mm: String(row.crop_name_mm),
    crop_type: row.crop_type as 'annual' | 'perennial',
  };
}

function mapCropCalendar(row: QueryResultRow): CropCalendar {
  return {
    id: String(row.id),
    ...mapCropCalendarCropSummary(row),
    region: row.region as CropCalendarRegion,
    township: nullableString(row.township),
    season: nullableString(row.season),
    planting_start_month: nullableNumber(row.planting_start_month),
    planting_end_month: nullableNumber(row.planting_end_month),
    harvest_start_month: nullableNumber(row.harvest_start_month),
    harvest_end_month: nullableNumber(row.harvest_end_month),
    growing_duration_min_days: nullableNumber(row.growing_duration_min_days),
    growing_duration_max_days: nullableNumber(row.growing_duration_max_days),
    establishment_start_month: nullableNumber(row.establishment_start_month),
    establishment_end_month: nullableNumber(row.establishment_end_month),
    years_to_first_harvest_min: nullableNumber(row.years_to_first_harvest_min),
    years_to_first_harvest_max: nullableNumber(row.years_to_first_harvest_max),
    harvest_season_start_month: nullableNumber(row.harvest_season_start_month),
    harvest_season_end_month: nullableNumber(row.harvest_season_end_month),
    notes_en: nullableString(row.notes_en),
    notes_mm: nullableString(row.notes_mm),
    source_code: nullableString(row.source_code),
    source_name: nullableString(row.source_name),
    source_title: nullableString(row.source_title),
    source_url: nullableString(row.source_url),
    publication_year: nullableNumber(row.publication_year),
    evidence_type: nullableString(row.evidence_type),
    geographic_specificity: nullableString(row.geographic_specificity),
    verification_status: row.verification_status as CropCalendarVerificationStatus,
    confidence: nullableNumber(row.confidence),
    last_verified_date: nullableDateText(row.last_verified_date),
    last_updated: postgresDateText(row.last_updated),
    dataset_version: String(row.dataset_version),
    data_quality_note: nullableString(row.data_quality_note),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function postgresDateText(value: unknown): string {
  if (!(value instanceof Date)) return String(value);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nullableDateText(value: unknown): string | null {
  return value === null || value === undefined ? null : postgresDateText(value);
}

function mapRegisteredUser(row: QueryResultRow): RegisteredUser {
  return {
    id: String(row.id),
    username: String(row.username),
    phone: String(row.phone),
    location: String(row.location),
    email: row.email === null ? null : String(row.email),
    created_at: iso(row.created_at),
  };
}
