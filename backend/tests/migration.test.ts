import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/0001_weekly_postgres.sql', import.meta.url);
const userMigrationUrl = new URL('../migrations/0002_user_registration.sql', import.meta.url);
const marketCommodityMigrationUrl = new URL(
  '../migrations/0003_market_commodity_coverage.sql',
  import.meta.url,
);
const marketMappingMigrationUrl = new URL(
  '../migrations/0004_market_mapping_version.sql',
  import.meta.url,
);

describe('weekly PostgreSQL migration contract', () => {
  it('defines durable weekly runs, six-region payloads, market prices, and idempotency guards', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS pipeline_runs/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS weekly_region_predictions/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS crop_market_prices/i);
    expect(sql).toMatch(/CHECK \(week_end = week_start \+ 7\)/i);
    expect(sql).toMatch(/UNIQUE \(week_start, model_catalog_version, schema_version\)/i);
    expect(sql).toMatch(/source_manifest_sha256 TEXT NOT NULL/i);
    expect(sql).toMatch(/CHECK \(regions_expected = 6\)/i);
    expect(sql).toMatch(/status <> 'succeeded'/i);
    expect(sql).toMatch(/status <> 'partially_succeeded'/i);
    expect(sql).toMatch(/UNIQUE \(pipeline_run_id, region\)/i);
    expect(sql).toMatch(/expires_at TIMESTAMPTZ NOT NULL/i);
    expect(sql).toMatch(/weekly_region_predictions_expires_at_idx/i);
    expect(sql).toMatch(
      /region IN \('yangon', 'bago', 'mandalay', 'sagaing', 'magway', 'ayeyawaddy'\)/i,
    );
    expect(sql).toMatch(/price_min IS NOT NULL OR price_max IS NOT NULL/i);
    expect(sql).toMatch(/price_max >= price_min/i);
    expect(sql).toMatch(/crop_market_prices_dedupe_idx/i);
    expect(sql).not.toMatch(/CREATE TABLE[^;]*daily_/i);
  });
});

describe('user registration PostgreSQL migration contract', () => {
  it('stores only the requested profile fields with race-safe uniqueness constraints', async () => {
    const sql = await readFile(userMigrationUrl, 'utf8');

    expect(sql).toMatch(/CREATE TABLE app_users/i);
    expect(sql).not.toMatch(/IF NOT EXISTS/i);
    expect(sql).toMatch(/username TEXT NOT NULL/i);
    expect(sql).toMatch(/phone TEXT NOT NULL/i);
    expect(sql).toMatch(/CHECK \(phone ~ '\^\[\+\]/i);
    expect(sql).toMatch(/phone !~ '\^\[\+\]950'/i);
    expect(sql).toMatch(/location TEXT NOT NULL/i);
    expect(sql).toMatch(/email TEXT/i);
    expect(sql).toMatch(/UNIQUE INDEX[^;]*LOWER\(username\)/is);
    expect(sql).toMatch(/UNIQUE INDEX[^;]*\(phone\)/is);
    expect(sql).toMatch(/UNIQUE INDEX[^;]*LOWER\(email\)[^;]*WHERE email IS NOT NULL/is);
    expect(sql).not.toMatch(/password|credential|token|secret/i);
  });
});

describe('market commodity PostgreSQL migration contract', () => {
  it('allows unmapped raw commodities without weakening canonical crop keys or deduplication', async () => {
    const sql = await readFile(marketCommodityMigrationUrl, 'utf8');

    expect(sql).toMatch(/ALTER TABLE crop_market_prices[\s\S]*ALTER COLUMN crop_key DROP NOT NULL/i);
    expect(sql).toMatch(/DROP INDEX crop_market_prices_dedupe_idx/i);
    expect(sql).not.toMatch(/IF EXISTS/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX crop_market_prices_dedupe_idx/i);
    expect(sql).toMatch(/COALESCE\(crop_key, '__unmapped__'\)/i);
    expect(sql).toMatch(/crop_market_prices_source_date_commodity_idx/i);
    expect(sql).not.toMatch(/DROP CONSTRAINT[^;]*crop_key_check/i);
  });
});

describe('market mapping-version PostgreSQL migration contract', () => {
  it('quarantines legacy mappings without deleting their audit rows', async () => {
    const sql = await readFile(marketMappingMigrationUrl, 'utf8');

    expect(sql).toMatch(/ADD COLUMN mapping_version TEXT NOT NULL DEFAULT 'legacy'/i);
    expect(sql).toMatch(/mapping_version ~ '\^\[a-z0-9\]/i);
    expect(sql).toMatch(/DROP INDEX crop_market_prices_dedupe_idx/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX crop_market_prices_dedupe_idx/i);
    expect(sql).toMatch(/mapping_version,[\s\S]*COALESCE\(crop_key, '__unmapped__'\)/i);
    expect(sql).toMatch(/crop_market_prices_mapping_crop_date_idx/i);
    expect(sql).toMatch(/crop_market_prices_mapping_source_date_idx/i);
    expect(sql).not.toMatch(/DELETE FROM|DROP TABLE|TRUNCATE/i);
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseIt = databaseUrl ? it : it.skip;

describe('optional PostgreSQL migration integration', () => {
  databaseIt(
    'applies in an isolated schema and enforces weekly and registration constraints',
    async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is missing.');
      const schema = `geoai_test_${randomUUID().replaceAll('-', '')}`;
      const pool = new Pool({ connectionString: databaseUrl, max: 1, allowExitOnIdle: true });
      const client = await pool.connect();
      try {
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}", public`);
        await client.query(await readFile(migrationUrl, 'utf8'));
        await client.query(await readFile(userMigrationUrl, 'utf8'));
        await client.query(await readFile(marketCommodityMigrationUrl, 'utf8'));
        await client.query(await readFile(marketMappingMigrationUrl, 'utf8'));

        const tables = await client.query<{ table_name: string }>(
          `SELECT table_name
           FROM information_schema.tables
           WHERE table_schema = $1
           ORDER BY table_name`,
          [schema],
        );
        expect(tables.rows.map((row) => row.table_name)).toEqual([
          'app_users',
          'crop_market_prices',
          'pipeline_runs',
          'weekly_region_predictions',
        ]);

        await client.query(
          `INSERT INTO crop_market_prices (
             crop_key, commodity_name_raw, price_min, currency, quantity, unit,
             source_name, source_date, source_url, fetched_at
           ) VALUES (
             NULL, 'Onion', 1800, 'MMK', 1, 'viss',
             'wisarra', '2026-08-09', 'https://wisarra.example/onion', NOW()
           )`,
        );
        await expect(
          client.query(
            `INSERT INTO crop_market_prices (
               crop_key, commodity_name_raw, price_min, currency, quantity, unit,
               source_name, source_date, source_url, fetched_at
             ) VALUES (
               NULL, 'Onion', 1900, 'MMK', 1, 'viss',
               'wisarra', '2026-08-09', 'https://wisarra.example/onion-later', NOW()
             )`,
          ),
        ).rejects.toMatchObject({ code: '23505' });
        await client.query(
          `INSERT INTO crop_market_prices (
             crop_key, commodity_name_raw, price_min, currency, quantity, unit,
             source_name, source_date, source_url, fetched_at, mapping_version
           ) VALUES (
             NULL, 'Onion', 1900, 'MMK', 1, 'viss',
             'wisarra', '2026-08-09', 'https://wisarra.example/onion-v2', NOW(),
             'market-map-v2'
           )`,
        );
        const mappingVersions = await client.query<{ mapping_version: string }>(
          `SELECT mapping_version FROM crop_market_prices
           WHERE commodity_name_raw = 'Onion'
           ORDER BY mapping_version`,
        );
        expect(mappingVersions.rows.map((row) => row.mapping_version)).toEqual([
          'legacy',
          'market-map-v2',
        ]);
        await expect(
          client.query(
            `INSERT INTO crop_market_prices (
               crop_key, commodity_name_raw, price_min, currency, quantity, unit,
               source_name, source_date, source_url, fetched_at
             ) VALUES (
               'onion', 'Onion', 1800, 'MMK', 1, 'viss',
               'wisarra', '2026-08-10', 'https://wisarra.example/onion', NOW()
             )`,
          ),
        ).rejects.toMatchObject({ code: '23514' });

        await client.query(
          `INSERT INTO app_users (username, phone, location, email)
           VALUES ('Farmer_01', '+959123456789', 'Yangon', 'farmer@example.com')`,
        );
        await expect(
          client.query(
            `INSERT INTO app_users (username, phone, location)
             VALUES ('farmer_01', '+959111111111', 'Bago')`,
          ),
        ).rejects.toMatchObject({ code: '23505' });
        await expect(
          client.query(
            `INSERT INTO app_users (username, phone, location)
             VALUES ('farmer_02', '09123456789', 'Bago')`,
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          client.query(
            `INSERT INTO app_users (username, phone, location)
             VALUES ('farmer_03', '+9509123456789', 'Bago')`,
          ),
        ).rejects.toMatchObject({ code: '23514' });

        await expect(
          client.query(
            `INSERT INTO pipeline_runs (
               week_start, week_end, status, schema_version, model_catalog_version,
               source_manifest_sha256
             ) VALUES (
               '2026-08-31', '2026-09-06', 'processing', 'schema', 'catalog',
               'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
             )`,
          ),
        ).rejects.toMatchObject({ code: '23514' });
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
