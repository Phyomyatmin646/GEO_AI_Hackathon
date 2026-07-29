import { drizzle } from "drizzle-orm/d1";
import type { AnyD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Build a typed database client from an explicitly supplied D1 binding.
 *
 * The current site does not configure D1, so importing this module must not
 * assume a global `DB` binding. A future persistence feature can pass
 * `env.DB` here after `.openai/hosting.json` declares that binding.
 */
export function getDb(database: AnyD1Database) {
  return drizzle(database, { schema });
}
