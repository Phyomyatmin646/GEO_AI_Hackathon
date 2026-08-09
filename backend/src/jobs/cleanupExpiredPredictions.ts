import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { PostgresStore } from '../db/store.js';

export async function cleanupExpiredPredictions(
  databaseUrl: string,
  now = new Date(),
): Promise<number> {
  const store = new PostgresStore(databaseUrl, { maximumConnections: 1 });
  try {
    return await store.cleanupExpiredPredictions(now);
  } finally {
    await store.close();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const deleted = await cleanupExpiredPredictions(databaseUrl);
  process.stdout.write(`Deleted ${deleted} expired regional prediction row(s).\n`);
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `Expired prediction cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exitCode = 1;
  });
}
