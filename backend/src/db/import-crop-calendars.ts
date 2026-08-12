import 'dotenv/config';

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDecoder } from 'node:util';

import { Pool } from 'pg';

import {
  CROP_CALENDAR_MODEL_KEYS,
  CROP_CALENDAR_REGIONS,
  parseCropCalendarDataset,
  type CropCalendarDatasetRecord,
  type ValidatedCropCalendarDataset,
} from '../crop-calendar-dataset.js';

const MAX_DATASET_BYTES = 5 * 1024 * 1024;

export const CROP_CALENDAR_UPSERT_SQL = `INSERT INTO crop_calendars (
  model_key,
  crop_name_en,
  crop_name_mm,
  crop_type,
  region,
  township,
  season,
  planting_start_month,
  planting_end_month,
  harvest_start_month,
  harvest_end_month,
  growing_duration_min_days,
  growing_duration_max_days,
  establishment_start_month,
  establishment_end_month,
  years_to_first_harvest_min,
  years_to_first_harvest_max,
  harvest_season_start_month,
  harvest_season_end_month,
  notes_en,
  notes_mm,
  source_code,
  source_name,
  source_title,
  source_url,
  publication_year,
  evidence_type,
  geographic_specificity,
  verification_status,
  confidence,
  last_verified_date,
  last_updated,
  dataset_version,
  data_quality_note
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
  $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
  $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
  $31, $32, $33, $34
)
ON CONFLICT (
  model_key,
  region,
  (COALESCE(township, '')),
  (COALESCE(season, '')),
  dataset_version
)
DO UPDATE SET
  crop_name_en = EXCLUDED.crop_name_en,
  crop_name_mm = EXCLUDED.crop_name_mm,
  crop_type = EXCLUDED.crop_type,
  planting_start_month = EXCLUDED.planting_start_month,
  planting_end_month = EXCLUDED.planting_end_month,
  harvest_start_month = EXCLUDED.harvest_start_month,
  harvest_end_month = EXCLUDED.harvest_end_month,
  growing_duration_min_days = EXCLUDED.growing_duration_min_days,
  growing_duration_max_days = EXCLUDED.growing_duration_max_days,
  establishment_start_month = EXCLUDED.establishment_start_month,
  establishment_end_month = EXCLUDED.establishment_end_month,
  years_to_first_harvest_min = EXCLUDED.years_to_first_harvest_min,
  years_to_first_harvest_max = EXCLUDED.years_to_first_harvest_max,
  harvest_season_start_month = EXCLUDED.harvest_season_start_month,
  harvest_season_end_month = EXCLUDED.harvest_season_end_month,
  notes_en = EXCLUDED.notes_en,
  notes_mm = EXCLUDED.notes_mm,
  source_code = EXCLUDED.source_code,
  source_name = EXCLUDED.source_name,
  source_title = EXCLUDED.source_title,
  source_url = EXCLUDED.source_url,
  publication_year = EXCLUDED.publication_year,
  evidence_type = EXCLUDED.evidence_type,
  geographic_specificity = EXCLUDED.geographic_specificity,
  verification_status = EXCLUDED.verification_status,
  confidence = EXCLUDED.confidence,
  last_verified_date = EXCLUDED.last_verified_date,
  last_updated = EXCLUDED.last_updated,
  dataset_version = EXCLUDED.dataset_version,
  data_quality_note = EXCLUDED.data_quality_note,
  is_active = TRUE,
  updated_at = NOW()
WHERE crop_calendars.is_active IS DISTINCT FROM TRUE
   OR ROW(
        crop_calendars.crop_name_en,
        crop_calendars.crop_name_mm,
        crop_calendars.crop_type,
        crop_calendars.planting_start_month,
        crop_calendars.planting_end_month,
        crop_calendars.harvest_start_month,
        crop_calendars.harvest_end_month,
        crop_calendars.growing_duration_min_days,
        crop_calendars.growing_duration_max_days,
        crop_calendars.establishment_start_month,
        crop_calendars.establishment_end_month,
        crop_calendars.years_to_first_harvest_min,
        crop_calendars.years_to_first_harvest_max,
        crop_calendars.harvest_season_start_month,
        crop_calendars.harvest_season_end_month,
        crop_calendars.notes_en,
        crop_calendars.notes_mm,
        crop_calendars.source_code,
        crop_calendars.source_name,
        crop_calendars.source_title,
        crop_calendars.source_url,
        crop_calendars.publication_year,
        crop_calendars.evidence_type,
        crop_calendars.geographic_specificity,
        crop_calendars.verification_status,
        crop_calendars.confidence,
        crop_calendars.last_verified_date,
        crop_calendars.last_updated,
        crop_calendars.data_quality_note
      ) IS DISTINCT FROM ROW(
        EXCLUDED.crop_name_en,
        EXCLUDED.crop_name_mm,
        EXCLUDED.crop_type,
        EXCLUDED.planting_start_month,
        EXCLUDED.planting_end_month,
        EXCLUDED.harvest_start_month,
        EXCLUDED.harvest_end_month,
        EXCLUDED.growing_duration_min_days,
        EXCLUDED.growing_duration_max_days,
        EXCLUDED.establishment_start_month,
        EXCLUDED.establishment_end_month,
        EXCLUDED.years_to_first_harvest_min,
        EXCLUDED.years_to_first_harvest_max,
        EXCLUDED.harvest_season_start_month,
        EXCLUDED.harvest_season_end_month,
        EXCLUDED.notes_en,
        EXCLUDED.notes_mm,
        EXCLUDED.source_code,
        EXCLUDED.source_name,
        EXCLUDED.source_title,
        EXCLUDED.source_url,
        EXCLUDED.publication_year,
        EXCLUDED.evidence_type,
        EXCLUDED.geographic_specificity,
        EXCLUDED.verification_status,
        EXCLUDED.confidence,
        EXCLUDED.last_verified_date,
        EXCLUDED.last_updated,
        EXCLUDED.data_quality_note
      )`;

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
};

export type CropCalendarImportClient = {
  query(sql: string, values?: unknown[]): Promise<QueryResult>;
};

export type LoadedCropCalendarDataset = ValidatedCropCalendarDataset & {
  dataset_version: string;
};

export type CropCalendarImportResult = {
  dataset_version: string;
  imported_records: number;
  stored_dataset_records: number;
  superseded_records: number;
};

export async function loadCropCalendarDatasetFile(
  datasetPath: string,
): Promise<LoadedCropCalendarDataset> {
  if (path.extname(datasetPath).toLowerCase() !== '.json') {
    throw new Error('The canonical Crop Calendar import source must be a JSON file.');
  }
  const file = await fs.stat(datasetPath);
  if (!file.isFile()) throw new Error('The Crop Calendar dataset path must identify a file.');
  if (file.size === 0) throw new Error('The Crop Calendar dataset file is empty.');
  if (file.size > MAX_DATASET_BYTES) {
    throw new Error(`The Crop Calendar dataset exceeds ${MAX_DATASET_BYTES} bytes.`);
  }

  const bytes = await fs.readFile(datasetPath);
  if (bytes.length > MAX_DATASET_BYTES) {
    throw new Error(`The Crop Calendar dataset exceeds ${MAX_DATASET_BYTES} bytes.`);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The Crop Calendar dataset is not valid UTF-8.');
  }

  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/u, '')) as unknown;
  } catch {
    throw new Error('The Crop Calendar dataset is not valid JSON.');
  }

  const validated = parseCropCalendarDataset(json);
  return {
    ...validated,
    dataset_version: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
}

export async function importCropCalendarDataset(
  client: CropCalendarImportClient,
  dataset: LoadedCropCalendarDataset,
): Promise<CropCalendarImportResult> {
  if (!/^sha256:[0-9a-f]{64}$/u.test(dataset.dataset_version)) {
    throw new Error('Crop Calendar dataset_version must be a SHA-256 artifact identifier.');
  }
  if (dataset.records.length !== 102) {
    throw new Error('Crop Calendar imports require exactly 102 validated records.');
  }
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('crop_calendar_import'))");
    const superseded = await client.query(
      `UPDATE crop_calendars
       SET is_active = FALSE, updated_at = NOW()
       WHERE is_active
         AND township IS NULL
         AND dataset_version <> $1
         AND model_key = ANY($2::text[])
         AND region = ANY($3::text[])`,
      [dataset.dataset_version, [...CROP_CALENDAR_MODEL_KEYS], [...CROP_CALENDAR_REGIONS]],
    );
    for (const record of dataset.records) {
      await client.query(CROP_CALENDAR_UPSERT_SQL, upsertValues(record, dataset.dataset_version));
    }

    const verification = await client.query(
      `SELECT COUNT(*)::integer AS record_count
       FROM crop_calendars
       WHERE dataset_version = $1
         AND is_active
         AND model_key = ANY($2::text[])
         AND region = ANY($3::text[])`,
      [dataset.dataset_version, [...CROP_CALENDAR_MODEL_KEYS], [...CROP_CALENDAR_REGIONS]],
    );
    const storedDatasetRecords = Number(verification.rows[0]?.record_count);
    if (storedDatasetRecords !== dataset.records.length) {
      throw new Error(
        `Crop Calendar post-import verification expected ${dataset.records.length} rows but found ${storedDatasetRecords}.`,
      );
    }

    await client.query('COMMIT');
    return {
      dataset_version: dataset.dataset_version,
      imported_records: dataset.records.length,
      stored_dataset_records: storedDatasetRecords,
      superseded_records: superseded.rowCount ?? 0,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

function upsertValues(record: CropCalendarDatasetRecord, datasetVersion: string): unknown[] {
  return [
    record.model_key,
    record.crop_name_en,
    record.crop_name_mm,
    record.crop_type,
    record.region,
    record.township,
    record.season,
    record.planting_start_month,
    record.planting_end_month,
    record.harvest_start_month,
    record.harvest_end_month,
    record.growing_duration_min_days,
    record.growing_duration_max_days,
    record.establishment_start_month,
    record.establishment_end_month,
    record.years_to_first_harvest_min,
    record.years_to_first_harvest_max,
    record.harvest_season_start_month,
    record.harvest_season_end_month,
    record.notes_en,
    record.notes_mm,
    record.source_code,
    record.source_name,
    record.source_title,
    record.source_url,
    record.publication_year,
    record.evidence_type,
    record.geographic_specificity,
    record.verification_status,
    record.confidence,
    record.last_verified_date,
    record.last_updated,
    datasetVersion,
    record.data_quality_note,
  ];
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 1) {
    throw new Error('Usage: npm run db:import-crop-calendars -- <canonical-dataset.json>');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  // Validation deliberately completes before any database connection or write.
  const datasetPath = path.resolve(arguments_[0]);
  const dataset = await loadCropCalendarDatasetFile(datasetPath);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  try {
    const client = await pool.connect();
    try {
      const result = await importCropCalendarDataset(client, dataset);
      process.stdout.write(
        `Imported ${result.imported_records} Crop Calendar records (${result.dataset_version}); ` +
          `${result.stored_dataset_records} active records verified; ` +
          `${result.superseded_records} previous records preserved as inactive.\n`,
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function redactError(error: unknown): string {
  const original = error instanceof Error ? error.message : 'unknown error';
  const secrets = new Set<string>();
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    secrets.add(databaseUrl);
    secrets.add(databaseUrl.trim());
    try {
      const parsed = new URL(databaseUrl);
      if (parsed.password) secrets.add(parsed.password);
    } catch {
      // Invalid connection strings are reported by pg without echoing them here.
    }
  }
  let redacted = original;
  for (const secret of secrets) redacted = redacted.replaceAll(secret, '[redacted]');
  return redacted;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  void main().catch((error: unknown) => {
    process.stderr.write(`Crop Calendar import failed: ${redactError(error)}\n`);
    process.exitCode = 1;
  });
}
