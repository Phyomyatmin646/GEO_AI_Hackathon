import 'dotenv/config';

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Pool } from 'pg';

type AuditQueryResult = {
  rows: Record<string, unknown>[];
};

export type CropCalendarAuditClient = {
  query(sql: string, values?: unknown[]): Promise<AuditQueryResult>;
};

export type CropCalendarDatabaseAudit = {
  status: 'ready' | 'data_pending' | 'invalid';
  issues: string[];
  summary: Record<string, number>;
  rows_per_crop: Array<{ model_key: string; records: number }>;
  rows_per_region: Array<{ region: string; records: number }>;
  source_organizations: string[];
  spot_checks: Record<string, unknown>[];
};

export async function auditCropCalendarDatabase(
  client: CropCalendarAuditClient,
): Promise<CropCalendarDatabaseAudit> {
  const aggregate = await client.query(`SELECT
    COUNT(*)::integer AS total_records,
    COUNT(DISTINCT model_key)::integer AS crop_count,
    COUNT(DISTINCT region)::integer AS region_count,
    COUNT(DISTINCT dataset_version)::integer AS active_dataset_versions,
    COUNT(*) FILTER (WHERE township IS NOT NULL)::integer AS township_records,
    COUNT(*) FILTER (WHERE verification_status = 'verified')::integer AS verified_records,
    COUNT(*) FILTER (WHERE verification_status = 'needs_verification')::integer
      AS needs_verification_records,
    COUNT(*) FILTER (WHERE verification_status = 'insufficient_evidence')::integer
      AS insufficient_evidence_records,
    COUNT(*) FILTER (WHERE verification_status = 'not_applicable')::integer
      AS not_applicable_records,
    COUNT(*) FILTER (WHERE verification_status = 'not_recommended')::integer
      AS not_recommended_records,
    COUNT(*) FILTER (WHERE crop_type = 'annual')::integer AS annual_records,
    COUNT(*) FILTER (WHERE crop_type = 'perennial')::integer AS perennial_records,
    COUNT(*) FILTER (
      WHERE crop_type = 'annual'
        AND (planting_start_month IS NOT NULL OR planting_end_month IS NOT NULL)
    )::integer AS annual_rows_with_planting,
    COUNT(*) FILTER (
      WHERE crop_type = 'annual'
        AND (harvest_start_month IS NOT NULL OR harvest_end_month IS NOT NULL)
    )::integer AS annual_rows_with_harvest,
    COUNT(*) FILTER (
      WHERE crop_type = 'perennial'
        AND (establishment_start_month IS NOT NULL OR establishment_end_month IS NOT NULL)
    )::integer AS perennial_rows_with_establishment,
    COUNT(*) FILTER (
      WHERE crop_type = 'perennial'
        AND (harvest_season_start_month IS NOT NULL OR harvest_season_end_month IS NOT NULL)
    )::integer AS perennial_rows_with_harvest_season,
    COUNT(*) FILTER (
      WHERE verification_status <> CASE
        WHEN model_key IN (
          'crop_suitability_black_gram',
          'crop_suitability_mango'
        ) OR (model_key = 'crop_suitability_sugarcane' AND region = 'Mandalay')
          OR (model_key = 'crop_suitability_chili' AND region = 'Mandalay')
          OR (model_key = 'crop_suitability_green_gram' AND region IN ('Ayeyarwady', 'Bago', 'Yangon'))
          OR (model_key = 'crop_suitability_pigeon_pea' AND region IN ('Mandalay', 'Sagaing', 'Magway'))
          OR (model_key = 'crop_suitability_sesame' AND region = 'Sagaing')
          OR (model_key = 'crop_suitability_durian' AND region = 'Bago')
        THEN 'verified'
        ELSE 'needs_verification'
      END
    )::integer AS verification_pair_mismatches,
    COUNT(*) FILTER (
      WHERE (crop_type = 'annual' AND (planting_start_month IS NOT NULL OR planting_end_month IS NOT NULL))
         OR (crop_type = 'perennial' AND (establishment_start_month IS NOT NULL OR establishment_end_month IS NOT NULL))
    )::integer AS records_with_planting_or_establishment,
    COUNT(*) FILTER (
      WHERE (crop_type = 'annual' AND (harvest_start_month IS NOT NULL OR harvest_end_month IS NOT NULL))
         OR (crop_type = 'perennial' AND (harvest_season_start_month IS NOT NULL OR harvest_season_end_month IS NOT NULL))
    )::integer AS records_with_harvest,
    COUNT(*) FILTER (
      WHERE (crop_type = 'annual' AND planting_start_month IS NULL AND planting_end_month IS NULL)
         OR (crop_type = 'perennial' AND establishment_start_month IS NULL AND establishment_end_month IS NULL)
    )::integer AS records_without_planting_or_establishment,
    COUNT(*) FILTER (
      WHERE (crop_type = 'annual' AND harvest_start_month IS NULL AND harvest_end_month IS NULL)
         OR (crop_type = 'perennial' AND harvest_season_start_month IS NULL AND harvest_season_end_month IS NULL)
    )::integer AS records_without_harvest,
    (
      SELECT COUNT(*)::integer FROM (
        SELECT model_key, region, COALESCE(township, '') AS township_scope,
               COALESCE(season, '') AS season_scope
        FROM crop_calendars
        WHERE is_active
        GROUP BY model_key, region, COALESCE(township, ''), COALESCE(season, '')
        HAVING COUNT(*) > 1
      ) AS duplicate_scopes
    ) AS duplicate_scopes
  FROM crop_calendars
  WHERE is_active`);
  const rowsPerCrop = await client.query(
    `SELECT model_key, COUNT(*)::integer AS records
     FROM crop_calendars WHERE is_active GROUP BY model_key ORDER BY model_key`,
  );
  const rowsPerRegion = await client.query(
    `SELECT region, COUNT(*)::integer AS records
     FROM crop_calendars WHERE is_active GROUP BY region ORDER BY region`,
  );
  const sources = await client.query(
    `SELECT DISTINCT source_name
     FROM crop_calendars
     WHERE is_active AND source_name IS NOT NULL
     ORDER BY source_name`,
  );
  const spotChecks = await client.query(
    `SELECT
       model_key, crop_name_en, crop_name_mm, crop_type, region, township, season,
       planting_start_month, planting_end_month, harvest_start_month, harvest_end_month,
       growing_duration_min_days, growing_duration_max_days,
       establishment_start_month, establishment_end_month,
       years_to_first_harvest_min, years_to_first_harvest_max,
       harvest_season_start_month, harvest_season_end_month,
       verification_status, source_name, source_title, source_url,
       last_updated::text AS last_updated
     FROM crop_calendars
     WHERE is_active AND (model_key, region) IN (
       ('crop_suitability_black_gram', 'Ayeyarwady'),
       ('crop_suitability_monsoon_rice', 'Ayeyarwady'),
       ('crop_suitability_groundnut', 'Magway'),
       ('crop_suitability_sesame', 'Sagaing'),
       ('crop_suitability_mango', 'Mandalay'),
       ('crop_suitability_rubber', 'Bago'),
       ('crop_suitability_durian', 'Bago'),
       ('crop_suitability_longan', 'Mandalay')
     )
     ORDER BY model_key, region`,
  );

  const summaryRow = aggregate.rows[0] ?? {};
  const summary = Object.fromEntries(
      Object.entries(summaryRow).map(([key, value]) => [key, Number(value)]),
    );
  const rows_per_crop = rowsPerCrop.rows.map((row) => ({
      model_key: String(row.model_key),
      records: Number(row.records),
    }));
  const rows_per_region = rowsPerRegion.rows.map((row) => ({
      region: String(row.region),
      records: Number(row.records),
    }));
  const issues = auditIssues(summary, rows_per_crop, rows_per_region);
  return {
    status: summary.total_records === 0 ? 'data_pending' : issues.length === 0 ? 'ready' : 'invalid',
    issues,
    summary,
    rows_per_crop,
    rows_per_region,
    source_organizations: sources.rows.map((row) => String(row.source_name)),
    spot_checks: spotChecks.rows,
  };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  try {
    const audit = await auditCropCalendarDatabase(pool);
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    if (audit.status !== 'ready') process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

const EXPECTED_CROPS = new Set([
  'crop_suitability_monsoon_rice',
  'crop_suitability_dry_season_rice',
  'crop_suitability_black_gram',
  'crop_suitability_groundnut',
  'crop_suitability_maize',
  'crop_suitability_sugarcane',
  'crop_suitability_cassava',
  'crop_suitability_chili',
  'crop_suitability_tomato',
  'crop_suitability_green_gram',
  'crop_suitability_pigeon_pea',
  'crop_suitability_sesame',
  'crop_suitability_rubber',
  'crop_suitability_durian',
  'crop_suitability_mangosteen',
  'crop_suitability_longan',
  'crop_suitability_mango',
]);

const EXPECTED_REGIONS = new Set([
  'Ayeyarwady',
  'Bago',
  'Mandalay',
  'Sagaing',
  'Magway',
  'Yangon',
]);

function auditIssues(
  summary: Record<string, number>,
  rowsPerCrop: Array<{ model_key: string; records: number }>,
  rowsPerRegion: Array<{ region: string; records: number }>,
): string[] {
  if (summary.total_records === 0) {
    return ['Canonical Crop Calendar data has not been imported.'];
  }
  const issues: string[] = [];
  const expectedSummary: Record<string, number> = {
    total_records: 102,
    crop_count: 17,
    region_count: 6,
    active_dataset_versions: 1,
    township_records: 0,
    verified_records: 22,
    needs_verification_records: 80,
    insufficient_evidence_records: 0,
    not_applicable_records: 0,
    not_recommended_records: 0,
    annual_records: 72,
    perennial_records: 30,
    annual_rows_with_planting: 48,
    annual_rows_with_harvest: 44,
    perennial_rows_with_establishment: 0,
    perennial_rows_with_harvest_season: 24,
    verification_pair_mismatches: 0,
    records_with_planting_or_establishment: 48,
    records_with_harvest: 68,
    records_without_planting_or_establishment: 54,
    records_without_harvest: 34,
    duplicate_scopes: 0,
  };
  for (const [key, expected] of Object.entries(expectedSummary)) {
    if (summary[key] !== expected) issues.push(`${key} must equal ${expected}.`);
  }
  if (
    rowsPerCrop.length !== EXPECTED_CROPS.size ||
    rowsPerCrop.some((row) => !EXPECTED_CROPS.has(row.model_key) || row.records !== 6)
  ) {
    issues.push('Every supported crop must have exactly six active regional records.');
  }
  if (
    rowsPerRegion.length !== EXPECTED_REGIONS.size ||
    rowsPerRegion.some((row) => !EXPECTED_REGIONS.has(row.region) || row.records !== 17)
  ) {
    issues.push('Every supported region must have exactly 17 active crop records.');
  }
  return issues;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  void main().catch(() => {
    process.stderr.write('Crop Calendar database audit failed.\n');
    process.exitCode = 1;
  });
}
