import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  CROP_CALENDAR_CROPS,
  CROP_CALENDAR_RECORDS_EXPECTED,
  CROP_CALENDAR_REGIONS,
  CropCalendarDatasetValidationError,
  LONGAN_BURMESE_NAME_DATA_QUALITY_NOTE,
  parseCropCalendarDataset,
} from '../src/crop-calendar-dataset.js';
import {
  CROP_CALENDAR_UPSERT_SQL,
  importCropCalendarDataset,
  type CropCalendarImportClient,
  type LoadedCropCalendarDataset,
} from '../src/db/import-crop-calendars.js';

const migrationUrl = new URL('../migrations/0005_crop_calendars.sql', import.meta.url);
const activeMigrationUrl = new URL(
  '../migrations/0006_crop_calendar_active_snapshots.sql',
  import.meta.url,
);
const TEST_DATASET_VERSION = `sha256:${'a'.repeat(64)}`;

describe('Crop Calendar canonical dataset validation', () => {
  it('accepts exact 17 by 6 coverage, preserves UTF-8/nulls, and maps crop_id', () => {
    const source = canonicalDataset();
    source[0].notes_mm = 'မြန်မာစာ စမ်းသပ်မှတ်စု';
    const result = parseCropCalendarDataset(source);

    expect(result.summary).toEqual({
      total_records: CROP_CALENDAR_RECORDS_EXPECTED,
      crop_count: 17,
      region_count: 6,
      verification_statuses: {
        verified: 22,
        needs_verification: 80,
        insufficient_evidence: 0,
        not_applicable: 0,
        not_recommended: 0,
      },
      annual_records: 72,
      perennial_records: 30,
      annual_rows_with_planting: 48,
      annual_rows_with_harvest: 44,
      perennial_rows_with_establishment: 0,
      perennial_rows_with_harvest_season: 24,
    });
    expect(result.records[0]).toMatchObject({
      model_key: 'crop_suitability_monsoon_rice',
      notes_mm: 'မြန်မာစာ စမ်းသပ်မှတ်စု',
      source_code: null,
      confidence: null,
    });
    expect(result.records.find((record) => record.model_key.endsWith('_longan'))).toMatchObject({
      crop_name_mm: 'တညင်း',
      data_quality_note: LONGAN_BURMESE_NAME_DATA_QUALITY_NOTE,
    });
  });

  it('requires all 102 records and each crop-region pair exactly once', () => {
    expect(() => parseCropCalendarDataset(canonicalDataset().slice(0, -1))).toThrow(
      CropCalendarDatasetValidationError,
    );

    const duplicated = canonicalDataset();
    duplicated[duplicated.length - 1] = { ...duplicated[0] };
    expect(() => parseCropCalendarDataset(duplicated)).toThrow(
      /duplicate crop-region record.*missing crop-region record/i,
    );
  });

  it('rejects a shape-only skeleton that is not the reported research dataset', () => {
    const skeleton = canonicalDataset().map((record) => ({
      ...record,
      planting_start_month: null,
      planting_end_month: null,
      harvest_start_month: null,
      harvest_end_month: null,
      harvest_season_start_month: null,
      harvest_season_end_month: null,
      source_name: null,
      source_url: null,
      verification_status: 'needs_verification',
    }));

    expect(() => parseCropCalendarDataset(skeleton)).toThrow(
      /verification_status.*must be verified|annual_rows_with_planting must be 48/i,
    );
  });

  it('rejects missing explicit nulls, invalid months, names, types, and range order', () => {
    const missingNull = canonicalDataset();
    delete missingNull[0].township;
    expect(() => parseCropCalendarDataset(missingNull)).toThrow(/0\.township/i);

    const invalidMonth = canonicalDataset();
    invalidMonth[0].planting_start_month = 13;
    expect(() => parseCropCalendarDataset(invalidMonth)).toThrow(/planting_start_month/i);

    const invalidName = canonicalDataset();
    invalidName[0].crop_name_en = 'Rice';
    expect(() => parseCropCalendarDataset(invalidName)).toThrow(/crop_name_en/i);

    const nonCanonicalRegion = canonicalDataset();
    nonCanonicalRegion[0].region = 'ayeyawaddy';
    expect(() => parseCropCalendarDataset(nonCanonicalRegion)).toThrow(/0\.region/i);

    const unsupportedTownshipScope = canonicalDataset();
    unsupportedTownshipScope[0].township = 'Danubyu';
    expect(() => parseCropCalendarDataset(unsupportedTownshipScope)).toThrow(
      /regional dataset requires township to be null/i,
    );

    const invalidType = canonicalDataset();
    invalidType[0].crop_type = 'perennial';
    expect(() => parseCropCalendarDataset(invalidType)).toThrow(/crop_type/i);

    const reversedDuration = canonicalDataset();
    reversedDuration[0].growing_duration_min_days = 120;
    reversedDuration[0].growing_duration_max_days = 90;
    expect(() => parseCropCalendarDataset(reversedDuration)).toThrow(
      /minimum cannot exceed its maximum/i,
    );
  });

  it('separates annual/perennial fields and permits legitimate cross-year month windows', () => {
    const annualMisuse = canonicalDataset();
    annualMisuse[0].harvest_season_start_month = 5;
    expect(() => parseCropCalendarDataset(annualMisuse)).toThrow(
      /annual records cannot populate perennial/i,
    );

    const perennialMisuse = canonicalDataset();
    const rubber = perennialMisuse.find((record) => String(record.crop_id).endsWith('_rubber'))!;
    rubber.planting_start_month = 5;
    expect(() => parseCropCalendarDataset(perennialMisuse)).toThrow(
      /perennial records cannot populate annual/i,
    );

    const crossYear = canonicalDataset();
    crossYear[0].planting_start_month = 12;
    crossYear[0].planting_end_month = 1;
    expect(parseCropCalendarDataset(crossYear).records[0]).toMatchObject({
      planting_start_month: 12,
      planting_end_month: 1,
    });
  });

  it('requires source attribution for verified records and rejects unknown fields', () => {
    const verifiedWithoutSource = canonicalDataset();
    verifiedWithoutSource[0].verification_status = 'verified';
    expect(() => parseCropCalendarDataset(verifiedWithoutSource)).toThrow(
      /verified records require source_name and source_url/i,
    );

    const unknownField = canonicalDataset();
    unknownField[0].invented_calendar_value = 7;
    expect(() => parseCropCalendarDataset(unknownField)).toThrow(/unrecognized key/i);
  });

  it('uses a transactional conflict update that is idempotent for the same dataset', async () => {
    const dataset = validatedDataset();
    const client = new InMemoryImportClient();

    const first = await importCropCalendarDataset(client, dataset);
    const second = await importCropCalendarDataset(client, dataset);

    expect(first.stored_dataset_records).toBe(102);
    expect(second.stored_dataset_records).toBe(102);
    expect(client.rows.size).toBe(102);
    expect(client.statements.filter((statement) => statement === 'BEGIN')).toHaveLength(2);
    expect(client.statements.filter((statement) => statement === 'COMMIT')).toHaveLength(2);
    expect(CROP_CALENDAR_UPSERT_SQL).toMatch(/ON CONFLICT[\s\S]*DO UPDATE/i);
    expect(CROP_CALENDAR_UPSERT_SQL).toMatch(
      /COALESCE\(season, ''\)[\s\S]*dataset_version[\s\S]*is_active = TRUE/i,
    );
    expect(CROP_CALENDAR_UPSERT_SQL).toMatch(
      /ROW\([\s\S]*crop_calendars\.notes_en[\s\S]*\) IS DISTINCT FROM ROW\([\s\S]*EXCLUDED\.notes_en/i,
    );
  });
});

describe('Crop Calendar PostgreSQL migration contract', () => {
  it('is additive, UUID-based, range constrained, and duplicate-safe', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toMatch(/CREATE TABLE crop_calendars/i);
    expect(sql).toMatch(/id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
    expect(sql).toMatch(/model_key IN[\s\S]*crop_suitability_monsoon_rice/i);
    expect(sql).toMatch(/model_key IN[\s\S]*crop_suitability_longan/i);
    expect(sql).toMatch(
      /region IN \('Ayeyarwady', 'Bago', 'Mandalay', 'Sagaing', 'Magway', 'Yangon'\)/i,
    );
    expect(sql).toMatch(/verification_status IN[\s\S]*needs_verification/i);
    expect(sql).toMatch(/planting_start_month BETWEEN 1 AND 12/i);
    expect(sql).toMatch(/years_to_first_harvest_min <= years_to_first_harvest_max/i);
    expect(sql).toMatch(/crop_calendars_scope_unique_idx/i);
    expect(sql).toMatch(/COALESCE\(township, ''\)[\s\S]*COALESCE\(season, ''\)/i);
    expect(sql).toMatch(/dataset_version ~ '\^sha256:/i);
    const migrationModelKeys = [
      ...new Set([...sql.matchAll(/'crop_suitability_[a-z_]+'/gu)].map(([key]) => key.slice(1, -1))),
    ].sort();
    expect(migrationModelKeys).toEqual(CROP_CALENDAR_CROPS.map((crop) => crop.model_key).sort());
    expect(sql).not.toMatch(/DELETE FROM|DROP TABLE|TRUNCATE|ALTER TABLE/i);
  });

  it('preserves old source snapshots while exposing one active regional record', async () => {
    const sql = await readFile(activeMigrationUrl, 'utf8');

    expect(sql).toMatch(/ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE/i);
    expect(sql).toMatch(/crop_calendars_version_scope_unique_idx/i);
    expect(sql).toMatch(/dataset_version/i);
    expect(sql).toMatch(/crop_calendars_active_region_scope_unique_idx/i);
    expect(sql).toMatch(/WHERE is_active/i);
    expect(sql).not.toMatch(/DELETE FROM|DROP TABLE|TRUNCATE/i);
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseIt = databaseUrl ? it : it.skip;

describe('optional Crop Calendar PostgreSQL import integration', () => {
  databaseIt(
    'preserves same-version UUIDs and archives a complete prior snapshot',
    async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is missing.');
      const schema = `calendar_test_${randomUUID().replaceAll('-', '')}`;
      const pool = new Pool({ connectionString: databaseUrl, max: 1, allowExitOnIdle: true });
      const client = await pool.connect();
      try {
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}", public`);
        await client.query(await readFile(migrationUrl, 'utf8'));
        await client.query(await readFile(activeMigrationUrl, 'utf8'));

        const dataset = validatedDataset();
        await importCropCalendarDataset(client as unknown as CropCalendarImportClient, dataset);
        const first = await client.query<{ id: string; updated_at: string }>(
          `SELECT id, updated_at::text AS updated_at
           FROM crop_calendars ORDER BY model_key, region`,
        );
        await importCropCalendarDataset(client as unknown as CropCalendarImportClient, dataset);
        const sameVersion = await client.query<{ id: string; updated_at: string }>(
          `SELECT id, updated_at::text AS updated_at
           FROM crop_calendars ORDER BY model_key, region`,
        );

        expect(first.rows).toHaveLength(102);
        expect(sameVersion.rows).toEqual(first.rows);

        await client.query(
          `UPDATE crop_calendars
           SET notes_en = 'out-of-band corruption',
               updated_at = '2000-01-01T00:00:00Z'
           WHERE model_key = 'crop_suitability_monsoon_rice'
             AND region = 'Ayeyarwady'
             AND dataset_version = $1`,
          [dataset.dataset_version],
        );
        await importCropCalendarDataset(client as unknown as CropCalendarImportClient, dataset);
        const repaired = await client.query<{
          id: string;
          model_key: string;
          region: string;
          notes_en: string | null;
          updated_at: string;
        }>(
          `SELECT id, model_key, region, notes_en, updated_at::text AS updated_at
           FROM crop_calendars ORDER BY model_key, region`,
        );
        const repairedIndex = repaired.rows.findIndex(
          (row) =>
            row.model_key === 'crop_suitability_monsoon_rice' &&
            row.region === 'Ayeyarwady',
        );
        expect(repairedIndex).toBeGreaterThanOrEqual(0);
        expect(repaired.rows[repairedIndex]?.notes_en).toBeNull();
        expect(repaired.rows[repairedIndex]?.updated_at).not.toContain('2000-01-01');
        for (const [index, row] of repaired.rows.entries()) {
          if (index === repairedIndex) continue;
          expect({ id: row.id, updated_at: row.updated_at }).toEqual(sameVersion.rows[index]);
        }

        const nextDataset: LoadedCropCalendarDataset = {
          ...dataset,
          dataset_version: `sha256:${'b'.repeat(64)}`,
          records: dataset.records.map((record, index) =>
            index === 0 ? { ...record, season: 'research-correction' } : { ...record },
          ),
        };
        const nextResult = await importCropCalendarDataset(
          client as unknown as CropCalendarImportClient,
          nextDataset,
        );
        const snapshotCounts = await client.query<{
          total_records: number;
          active_records: number;
          inactive_records: number;
        }>(`SELECT
          COUNT(*)::integer AS total_records,
          COUNT(*) FILTER (WHERE is_active)::integer AS active_records,
          COUNT(*) FILTER (WHERE NOT is_active)::integer AS inactive_records
          FROM crop_calendars`);
        const archivedRows = await client.query<{ id: string }>(
          `SELECT id FROM crop_calendars
           WHERE dataset_version = $1 AND NOT is_active
           ORDER BY model_key, region`,
          [dataset.dataset_version],
        );
        const activeRows = await client.query<{ id: string }>(
          `SELECT id FROM crop_calendars
           WHERE dataset_version = $1 AND is_active
           ORDER BY model_key, region`,
          [nextDataset.dataset_version],
        );

        expect(nextResult.superseded_records).toBe(102);
        expect(snapshotCounts.rows[0]).toEqual({
          total_records: 204,
          active_records: 102,
          inactive_records: 102,
        });
        expect(archivedRows.rows.map((row) => row.id)).toEqual(
          first.rows.map((row) => row.id),
        );
        expect(activeRows.rows).toHaveLength(102);
        expect(
          new Set(activeRows.rows.map((row) => row.id)).has(first.rows[0]?.id ?? ''),
        ).toBe(false);
      } finally {
        await client.query('RESET search_path').catch(() => undefined);
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
        client.release();
        await pool.end();
      }
    },
    30_000,
  );
});

function canonicalDataset(): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = CROP_CALENDAR_CROPS.flatMap((crop) =>
    CROP_CALENDAR_REGIONS.map((region): Record<string, unknown> => ({
      crop_id: crop.model_key,
      crop_name_en: crop.crop_name_en,
      crop_name_mm: crop.crop_name_mm,
      region,
      township: null,
      crop_type: crop.crop_type,
      planting_start_month: null,
      planting_end_month: null,
      harvest_start_month: null,
      harvest_end_month: null,
      growing_duration_min_days: null,
      growing_duration_max_days: null,
      establishment_start_month: null,
      establishment_end_month: null,
      years_to_first_harvest_min: null,
      years_to_first_harvest_max: null,
      harvest_season_start_month: null,
      harvest_season_end_month: null,
      season: null,
      notes_en: null,
      notes_mm: null,
      source_name: isCanonicalVerifiedPair(crop.model_key, region)
        ? 'Canonical test source'
        : null,
      source_url: isCanonicalVerifiedPair(crop.model_key, region)
        ? 'https://example.org/crop-calendar-source'
        : null,
      verification_status: isCanonicalVerifiedPair(crop.model_key, region)
        ? 'verified'
        : 'needs_verification',
      last_updated: '2026-08-10',
    })),
  );

  const annualRecords = records.filter((record) => record.crop_type === 'annual');
  annualRecords.slice(0, 48).forEach((record) => {
    record.planting_start_month = 1;
    record.planting_end_month = 1;
  });
  annualRecords.slice(0, 44).forEach((record) => {
    record.harvest_start_month = 2;
    record.harvest_end_month = 2;
  });
  records
    .filter((record) => record.crop_type === 'perennial')
    .slice(0, 24)
    .forEach((record) => {
      record.harvest_season_start_month = 3;
      record.harvest_season_end_month = 3;
    });

  return records;
}

function isCanonicalVerifiedPair(modelKey: string, region: string): boolean {
  if (modelKey === 'crop_suitability_black_gram') return true;
  if (modelKey === 'crop_suitability_sugarcane') return region === 'Mandalay';
  if (modelKey === 'crop_suitability_chili') return region === 'Mandalay';
  if (modelKey === 'crop_suitability_green_gram') {
    return ['Ayeyarwady', 'Bago', 'Yangon'].includes(region);
  }
  if (modelKey === 'crop_suitability_pigeon_pea') {
    return ['Mandalay', 'Sagaing', 'Magway'].includes(region);
  }
  if (modelKey === 'crop_suitability_sesame') return region === 'Sagaing';
  if (modelKey === 'crop_suitability_durian') return region === 'Bago';
  return modelKey === 'crop_suitability_mango';
}

function validatedDataset(): LoadedCropCalendarDataset {
  return {
    ...parseCropCalendarDataset(canonicalDataset()),
    dataset_version: TEST_DATASET_VERSION,
  };
}

class InMemoryImportClient implements CropCalendarImportClient {
  readonly rows = new Map<string, unknown[]>();
  readonly statements: string[] = [];

  async query(sql: string, values: unknown[] = []) {
    this.statements.push(sql);
    if (sql.startsWith('INSERT INTO crop_calendars')) {
      const key = `${String(values[0])}\u0000${String(values[4])}\u0000${String(values[5] ?? '')}\u0000${String(values[6] ?? '')}`;
      this.rows.set(key, values);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('COUNT(*)::integer AS record_count')) {
      const datasetVersion = values[0];
      const count = [...this.rows.values()].filter((row) => row[32] === datasetVersion).length;
      return { rows: [{ record_count: count }], rowCount: 1 };
    }
    return { rows: [], rowCount: null };
  }
}
