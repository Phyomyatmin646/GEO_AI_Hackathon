import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MODEL_FEATURE_NAMES,
  MODEL_INPUT_SCHEMA_SHA256,
  WEEKLY_REGIONS,
  type ModelFeatureRow,
} from '../src/contracts/weekly.js';
import { WeeklyIngestRequestSchema, addDays } from '../src/schemas/weekly.js';
import {
  observationMonthForWeekEnd,
  readWeeklyFeatureBatches,
  sha256File,
  type WeeklyFeatureCell,
} from '../src/services/weekly-csv.js';
import {
  modelFeatureRow,
  sha256Text,
  weeklyCoverageFixture,
  weeklyCsv,
} from './helpers.js';

describe('audited weekly feature contract', () => {
  it('locks all 75 feature names to their exact model order and checksum', () => {
    expect(MODEL_FEATURE_NAMES).toHaveLength(75);
    expect(MODEL_FEATURE_NAMES.slice(0, 5)).toEqual([
      'elevation_m',
      'slope_degrees',
      'aspect_degrees',
      'distance_to_surface_water_m',
      'soil_cec_cmol_kg_0_30cm',
    ]);
    expect(MODEL_FEATURE_NAMES.slice(-6)).toEqual([
      'region_ayeyawaddy',
      'region_bago',
      'region_magway',
      'region_mandalay',
      'region_sagaing',
      'region_yangon',
    ]);
    expect(
      createHash('sha256').update(JSON.stringify(MODEL_FEATURE_NAMES)).digest('hex'),
    ).toBe(MODEL_INPUT_SCHEMA_SHA256);
    expect(MODEL_INPUT_SCHEMA_SHA256).toBe(
      '35bca85b7200cac8d9c2caf59d3fb9c4c6fe2dc1c4dc1cc512bb221d9df6b7a8',
    );
  });

  it('requires a Monday-to-Monday exclusive interval and consistent partial coverage', () => {
    const valid = WeeklyIngestRequestSchema.safeParse({
      week_start: '2026-08-31',
      week_end: '2026-09-07',
      schema_checksum: MODEL_INPUT_SCHEMA_SHA256,
      regions: WEEKLY_REGIONS.map((region) => ({
          region,
          row_count: 10,
          source_sha256: 'a'.repeat(64),
          coverage_metadata: weeklyCoverageFixture(),
        })),
    });
    expect(valid.success).toBe(true);
    expect(addDays('2026-08-31', 7)).toBe('2026-09-07');

    expect(
      WeeklyIngestRequestSchema.safeParse({
        week_start: '2026-08-31',
        week_end: '2026-09-07',
        schema_checksum: MODEL_INPUT_SCHEMA_SHA256,
        regions: valid.success ? [valid.data.regions[0]] : [],
      }).success,
    ).toBe(false);

    expect(
      WeeklyIngestRequestSchema.safeParse({
        week_start: '2026-09-01',
        week_end: '2026-09-08',
        schema_checksum: MODEL_INPUT_SCHEMA_SHA256,
        regions: [],
      }).success,
    ).toBe(false);
  });

  it('uses the month of week_end minus one day for a cross-month week', () => {
    expect(observationMonthForWeekEnd('2026-09-07')).toBe('2026-09');
    expect(observationMonthForWeekEnd('2027-01-04')).toBe('2027-01');
  });
});

describe('weekly CSV validation', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'geoai-weekly-test-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function saveCsv(contents: string): Promise<string> {
    const filePath = path.join(temporaryDirectory, 'yangon.csv');
    await writeFile(filePath, contents, 'utf8');
    return filePath;
  }

  async function collect(
    contents: string,
    overrides: Partial<Parameters<typeof readWeeklyFeatureBatches>[0]> = {},
  ) {
    const filePath = await saveCsv(contents);
    const batches: WeeklyFeatureCell[][] = [];
    const generator = readWeeklyFeatureBatches({
      filePath,
      region: 'yangon',
      weekStart: '2026-08-31',
      weekEnd: '2026-09-07',
      batchSize: 1,
      expectedRows: 1,
      expectedSha256: sha256Text(contents),
      expectedCoverageMetadata: weeklyCoverageFixture(),
      ...overrides,
    });
    for await (const batch of generator) batches.push(batch);
    return { batches, filePath };
  }

  it('streams canonical rows in batches while preserving exact feature insertion order', async () => {
    const csv = weeklyCsv([
      modelFeatureRow('mm_123_456', 'yangon', 9),
      modelFeatureRow('mm_124_457', 'yangon', 9),
    ]);
    const filePath = await saveCsv(csv);
    const batches = [];
    for await (const batch of readWeeklyFeatureBatches({
      filePath,
      region: 'yangon',
      weekStart: '2026-08-31',
      weekEnd: '2026-09-07',
      batchSize: 1,
      expectedRows: 2,
      expectedSha256: sha256Text(csv),
      expectedCoverageMetadata: weeklyCoverageFixture(),
    })) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(2);
    expect(batches[0]?.[0]).toMatchObject({
      grid_id: 'mm_123_456',
      latitude: 16.8,
      longitude: 96.1,
    });
    expect(Object.keys(batches[0]![0]!.features)).toEqual([
      'grid_id',
      ...MODEL_FEATURE_NAMES,
    ]);
    expect(batches[0]![0]!.features.data_month).toBe(9);
    expect(await sha256File(filePath)).toBe(sha256Text(csv));
  });

  it('rejects files changed after validation', async () => {
    const csv = weeklyCsv([modelFeatureRow()]);
    await expect(
      collect(csv, { expectedSha256: '0'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'WEEKLY_SOURCE_HASH_MISMATCH', statusCode: 422 });
  });

  it('rejects CSV coverage metadata that differs from the ingest manifest', async () => {
    const csv = weeklyCsv([modelFeatureRow()]);
    const expectedCoverage = weeklyCoverageFixture();
    expectedCoverage.source_dates_used.chirps = expectedCoverage.source_dates_used.chirps.slice(
      0,
      -1,
    );

    await expect(
      collect(csv, { expectedCoverageMetadata: expectedCoverage }),
    ).rejects.toMatchObject({ code: 'WEEKLY_CSV_INVALID', statusCode: 422 });
  });

  it('rejects a start-month observation for a week whose last included day is next month', async () => {
    const csv = weeklyCsv([modelFeatureRow()], { observationMonth: '2026-08' });
    await expect(collect(csv)).rejects.toMatchObject({
      code: 'WEEKLY_CSV_INVALID',
      statusCode: 422,
    });
  });

  it('rejects non-canonical IDs, duplicate IDs, non-finite values, and row-count drift', async () => {
    const nonCanonical = weeklyCsv([modelFeatureRow('generated-grid-1')]);
    await expect(collect(nonCanonical)).rejects.toMatchObject({ code: 'WEEKLY_CSV_INVALID' });

    const duplicate = weeklyCsv([modelFeatureRow(), modelFeatureRow()]);
    await expect(collect(duplicate, { expectedRows: 2 })).rejects.toMatchObject({
      code: 'WEEKLY_CSV_INVALID',
    });

    const nonFiniteRow = modelFeatureRow() as unknown as Record<string, string | number>;
    nonFiniteRow.surface_water_seasonality_months = Number.NaN;
    const nonFinite = weeklyCsv([nonFiniteRow as unknown as ModelFeatureRow]);
    await expect(collect(nonFinite)).rejects.toMatchObject({ code: 'WEEKLY_CSV_INVALID' });

    const rowCount = weeklyCsv([modelFeatureRow()]);
    await expect(collect(rowCount, { expectedRows: 2 })).rejects.toMatchObject({
      code: 'WEEKLY_CSV_INVALID',
    });
  });

  it('rejects missing, extra, or out-of-order model feature headers', async () => {
    const csv = weeklyCsv([modelFeatureRow()]);
    const lines = csv.trimEnd().split('\n');
    const headers = lines[0]!.split(',');
    const finalIndex = headers.length - 1;
    [headers[finalIndex - 1], headers[finalIndex]] = [
      headers[finalIndex]!,
      headers[finalIndex - 1]!,
    ];
    const outOfOrder = `${headers.join(',')}\n${lines.slice(1).join('\n')}\n`;
    await expect(collect(outOfOrder)).rejects.toMatchObject({ code: 'WEEKLY_CSV_INVALID' });
  });
});
