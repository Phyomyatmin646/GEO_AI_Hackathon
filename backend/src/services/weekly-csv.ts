import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

import { parse } from 'csv-parse';

import {
  MODEL_INPUT_SCHEMA_SHA256,
  MODEL_FEATURE_NAMES,
  type ModelFeatureRow,
  type WeeklyRegion,
} from '../contracts/weekly.js';
import { AppError } from '../errors.js';
import {
  CoverageMetadataSchema,
  type CoverageMetadata,
} from '../schemas/weekly.js';

const WEEKLY_IDENTITY_HEADERS = [
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
] as const;

export type WeeklyFeatureCell = {
  grid_id: string;
  latitude: number;
  longitude: number;
  features: ModelFeatureRow;
};

export async function sha256File(filePath: string): Promise<string> {
  const digest = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) digest.update(chunk as Buffer);
  return digest.digest('hex');
}

export async function* readWeeklyFeatureBatches(input: {
  filePath: string;
  region: WeeklyRegion;
  weekStart: string;
  weekEnd: string;
  batchSize: number;
  expectedRows: number;
  expectedSha256: string;
  expectedCoverageMetadata: CoverageMetadata;
}): AsyncGenerator<WeeklyFeatureCell[]> {
  const actualSha256 = await sha256File(input.filePath);
  if (actualSha256 !== input.expectedSha256) {
    throw new AppError(
      422,
      'WEEKLY_SOURCE_HASH_MISMATCH',
      'A weekly feature file changed after validation.',
    );
  }
  let headersValidated = false;
  const parser = createReadStream(input.filePath).pipe(
    parse({
      bom: true,
      trim: true,
      skip_empty_lines: true,
      columns(headers: string[]) {
        validateHeaders(headers);
        headersValidated = true;
        return headers;
      },
    }),
  );

  const seenGridIds = new Set<string>();
  let rowCount = 0;
  let batch: WeeklyFeatureCell[] = [];
  const expectedObservationMonth = observationMonthForWeekEnd(input.weekEnd);
  const expectedMonthNumber = Number(expectedObservationMonth.slice(5, 7));
  const expectedCoverageSignature = canonicalJson(input.expectedCoverageMetadata);

  try {
    for await (const rawRecord of parser) {
      const record = rawRecord as Record<string, string>;
      rowCount += 1;
      const gridId = record.grid_id;
      if (!/^mm_\d+_\d+$/.test(gridId)) {
        throw invalidCsv('grid_id is not a canonical model spatial-index ID');
      }
      if (seenGridIds.has(gridId)) throw invalidCsv('grid_id values must be unique per week');
      seenGridIds.add(gridId);
      if (record.region !== input.region) throw invalidCsv('row region does not match its file');
      if (record.week_start !== input.weekStart || record.week_end !== input.weekEnd) {
        throw invalidCsv('row week interval does not match the ingest request');
      }
      if (record.observation_month !== expectedObservationMonth) {
        throw invalidCsv('observation_month must be the month of the last included day');
      }
      if (!record.serving_sample_id?.trim()) throw invalidCsv('serving_sample_id is missing');
      if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(record.serving_year_month)) {
        throw invalidCsv('serving_year_month is invalid');
      }
      if (record.feature_schema_sha256 !== MODEL_INPUT_SCHEMA_SHA256) {
        throw invalidCsv('feature_schema_sha256 does not match the audited model contract');
      }
      const coverageMetadata = coverageFromRecord(record);
      if (canonicalJson(coverageMetadata) !== expectedCoverageSignature) {
        throw invalidCsv('CSV coverage metadata does not match its ingest manifest');
      }

      const latitude = finiteNumber(record.latitude, 'latitude');
      const longitude = finiteNumber(record.longitude, 'longitude');
      if (latitude < 9 || latitude > 29 || longitude < 92 || longitude > 102) {
        throw invalidCsv('coordinates are outside the Myanmar serving bounds');
      }

      const features = { grid_id: gridId } as ModelFeatureRow;
      for (const feature of MODEL_FEATURE_NAMES) {
        features[feature] = finiteNumber(record[feature], feature);
      }
      if (features.data_month !== expectedMonthNumber) {
        throw invalidCsv('data_month does not match observation_month');
      }
      validateRegionOneHot(features, input.region);
      batch.push({ grid_id: gridId, latitude, longitude, features });
      if (batch.length === input.batchSize) {
        yield batch;
        batch = [];
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      422,
      'WEEKLY_CSV_INVALID',
      'A validated weekly feature file could not be parsed.',
      false,
      { cause: error },
    );
  }

  if (!headersValidated) throw invalidCsv('CSV header is missing');
  if (batch.length > 0) yield batch;
  if (rowCount !== input.expectedRows) {
    throw invalidCsv('CSV row count does not match its ingest manifest');
  }
  if (rowCount === 0) throw invalidCsv('CSV contains no model feature rows');
  if ((await sha256File(input.filePath)) !== input.expectedSha256) {
    throw new AppError(
      422,
      'WEEKLY_SOURCE_HASH_MISMATCH',
      'A weekly feature file changed during validation.',
    );
  }
}

export function observationMonthForWeekEnd(weekEnd: string): string {
  const exclusiveEnd = new Date(`${weekEnd}T00:00:00.000Z`);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() - 1);
  return exclusiveEnd.toISOString().slice(0, 7);
}

function validateHeaders(headers: string[]): void {
  if (new Set(headers).size !== headers.length) throw invalidCsv('CSV headers must be unique');
  const expectedHeaders = [...WEEKLY_IDENTITY_HEADERS, ...MODEL_FEATURE_NAMES];
  if (
    headers.length !== expectedHeaders.length ||
    expectedHeaders.some((header, index) => headers[index] !== header)
  ) {
    throw invalidCsv('CSV headers must be exact ordered weekly identity + 75-feature columns');
  }
}

function finiteNumber(value: string | undefined, column: string): number {
  if (value === undefined || value.trim() === '') throw invalidCsv(`${column} is missing`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw invalidCsv(`${column} must be finite`);
  return parsed;
}

function coverageFromRecord(record: Record<string, string>): CoverageMetadata {
  const candidate = {
    week_start: record.week_start,
    week_end: record.week_end,
    observation_days: integerNumber(record.observation_days, 'observation_days'),
    expected_days: integerNumber(record.expected_days, 'expected_days'),
    coverage_ratio: finiteNumber(record.coverage_ratio, 'coverage_ratio'),
    is_partial_week: booleanValue(record.is_partial_week, 'is_partial_week'),
    source_coverage: jsonValue(record.source_coverage_json, 'source_coverage_json'),
    source_observation_dates: jsonValue(
      record.source_observation_dates_json,
      'source_observation_dates_json',
    ),
    source_dates_used: jsonValue(record.source_dates_used_json, 'source_dates_used_json'),
  };
  const parsed = CoverageMetadataSchema.safeParse(candidate);
  if (!parsed.success) throw invalidCsv('coverage metadata is internally inconsistent');
  return parsed.data;
}

function integerNumber(value: string | undefined, column: string): number {
  const parsed = finiteNumber(value, column);
  if (!Number.isInteger(parsed)) throw invalidCsv(`${column} must be an integer`);
  return parsed;
}

function booleanValue(value: string | undefined, column: string): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw invalidCsv(`${column} must be true or false`);
}

function jsonValue(value: string | undefined, column: string): unknown {
  if (value === undefined || value.trim() === '') throw invalidCsv(`${column} is missing`);
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw invalidCsv(`${column} must contain valid JSON`);
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
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

function validateRegionOneHot(row: ModelFeatureRow, region: WeeklyRegion): void {
  const expectedColumn = `region_${region}` as const;
  const regionColumns = [
    'region_ayeyawaddy',
    'region_bago',
    'region_magway',
    'region_mandalay',
    'region_sagaing',
    'region_yangon',
  ] as const;
  for (const column of regionColumns) {
    const expected = column === expectedColumn ? 1 : 0;
    if (row[column] !== expected) throw invalidCsv('region one-hot features are inconsistent');
  }
}

function invalidCsv(reason: string): AppError {
  return new AppError(422, 'WEEKLY_CSV_INVALID', `Weekly feature validation failed: ${reason}.`);
}
