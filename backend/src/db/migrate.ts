import 'dotenv/config';

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Pool } from 'pg';

const MIGRATION_FILE_PATTERN = /^\d+_[a-z0-9_]+\.sql$/;

export async function runMigrations(databaseUrl: string, migrationsDirectory: string): Promise<string[]> {
  if (!databaseUrl.trim()) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({ connectionString: databaseUrl, max: 1, allowExitOnIdle: true });
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query("SELECT pg_advisory_lock(hashtext('geoai_backend_migrations'))");

    const filenames = (await fs.readdir(migrationsDirectory))
      .filter((filename) => MIGRATION_FILE_PATTERN.test(filename))
      .sort();
    for (const filename of filenames) {
      const sql = await fs.readFile(path.join(migrationsDirectory, filename), 'utf8');
      const sha256 = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ sha256: string }>(
        'SELECT sha256 FROM schema_migrations WHERE filename = $1',
        [filename],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].sha256 !== sha256) {
          throw new Error(`Previously applied migration ${filename} has changed.`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, sha256) VALUES ($1, $2)',
          [filename, sha256],
        );
        await client.query('COMMIT');
        applied.push(filename);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('geoai_backend_migrations'))").catch(
      () => undefined,
    );
    client.release();
    await pool.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const migrationsDirectory = path.resolve(process.env.MIGRATIONS_DIR ?? 'migrations');
  const applied = await runMigrations(databaseUrl, migrationsDirectory);
  process.stdout.write(
    applied.length > 0
      ? `Applied migrations: ${applied.join(', ')}\n`
      : 'Database schema is already current.\n',
  );
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `Database migration failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exitCode = 1;
  });
}
