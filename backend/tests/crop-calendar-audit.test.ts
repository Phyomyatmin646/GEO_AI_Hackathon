import { describe, expect, it } from 'vitest';

import {
  CROP_CALENDAR_CROPS,
  CROP_CALENDAR_REGIONS,
} from '../src/crop-calendar-dataset.js';
import {
  auditCropCalendarDatabase,
  type CropCalendarAuditClient,
} from '../src/db/audit-crop-calendars.js';

describe('Crop Calendar database audit', () => {
  it('reports ready only for the complete active research snapshot', async () => {
    const sql: string[] = [];
    const client = auditClient(
      [
        [readyAggregate()],
        CROP_CALENDAR_CROPS.map((crop) => ({ model_key: crop.model_key, records: '6' })),
        CROP_CALENDAR_REGIONS.map((region) => ({ region, records: '17' })),
        [{ source_name: 'IFPRI/CGIAR' }],
        [{ model_key: 'crop_suitability_black_gram', region: 'Ayeyarwady' }],
      ],
      sql,
    );

    const audit = await auditCropCalendarDatabase(client);

    expect(audit.status).toBe('ready');
    expect(audit.issues).toEqual([]);
    expect(audit.summary).toMatchObject({
      total_records: 102,
      crop_count: 17,
      region_count: 6,
      verified_records: 22,
      needs_verification_records: 80,
      duplicate_scopes: 0,
    });
    expect(audit.rows_per_crop).toHaveLength(17);
    expect(audit.rows_per_region).toHaveLength(6);
    expect(audit.source_organizations).toEqual(['IFPRI/CGIAR']);
    expect(audit.spot_checks).toHaveLength(1);
    expect(sql.join('\n')).toMatch(/crop_suitability_longan[\s\S]*Mandalay/i);
    expect(sql).toSatisfy((statements: string[]) =>
      statements.every((statement) => /is_active/u.test(statement)),
    );
    expect(sql.join('\n')).not.toMatch(/DATABASE_URL|password|credential/i);
  });

  it('fails closed as data_pending when no canonical snapshot is imported', async () => {
    const audit = await auditCropCalendarDatabase(
      auditClient([[{ total_records: '0' }], [], [], [], []]),
    );

    expect(audit.status).toBe('data_pending');
    expect(audit.issues).toEqual(['Canonical Crop Calendar data has not been imported.']);
  });

  it('reports invalid for a partial snapshot or wrong crop distribution', async () => {
    const partialAggregate = {
      ...readyAggregate(),
      total_records: '101',
      verification_pair_mismatches: '1',
    };
    const cropRows = CROP_CALENDAR_CROPS.map((crop, index) => ({
      model_key: crop.model_key,
      records: index === 0 ? '5' : '6',
    }));
    const audit = await auditCropCalendarDatabase(
      auditClient([
        [partialAggregate],
        cropRows,
        CROP_CALENDAR_REGIONS.map((region) => ({ region, records: '17' })),
        [],
        [],
      ]),
    );

    expect(audit.status).toBe('invalid');
    expect(audit.issues).toContain('total_records must equal 102.');
    expect(audit.issues).toContain('verification_pair_mismatches must equal 0.');
    expect(audit.issues).toContain(
      'Every supported crop must have exactly six active regional records.',
    );
  });
});

function readyAggregate(): Record<string, string> {
  return {
    total_records: '102',
    crop_count: '17',
    region_count: '6',
    active_dataset_versions: '1',
    township_records: '0',
    verified_records: '22',
    needs_verification_records: '80',
    insufficient_evidence_records: '0',
    not_applicable_records: '0',
    not_recommended_records: '0',
    annual_records: '72',
    perennial_records: '30',
    annual_rows_with_planting: '48',
    annual_rows_with_harvest: '44',
    perennial_rows_with_establishment: '0',
    perennial_rows_with_harvest_season: '24',
    verification_pair_mismatches: '0',
    records_with_planting_or_establishment: '48',
    records_with_harvest: '68',
    records_without_planting_or_establishment: '54',
    records_without_harvest: '34',
    duplicate_scopes: '0',
  };
}

function auditClient(
  responses: Record<string, unknown>[][],
  statements: string[] = [],
): CropCalendarAuditClient {
  return {
    async query(statement) {
      statements.push(statement);
      return { rows: responses.shift() ?? [] };
    },
  };
}
