import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  return drizzle(getRawDb(), { schema });
}

export function getRawDb(): D1Database {
  const workerEnv = env as unknown as { DB?: D1Database };
  if (!workerEnv.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in wrangler.jsonc to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return workerEnv.DB;
}
