/**
 * Lazy Drizzle client over a standard Postgres connection (postgres-js).
 *
 * Deliberately provider-agnostic — works against Neon, Supabase, or any
 * Postgres reachable by connection string, rather than a vendor-specific
 * HTTP driver. The connection is created on first use, not at import — so
 * modules that transitively import this (auth.ts, the /api/state routes)
 * don't throw at load time when DATABASE_URL is unset (open mode).
 * `isDbConfigured()` lets callers degrade gracefully instead of hitting a
 * missing connection string.
 *
 * Server-only: never import from client components.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | null = null;

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — the database layer is disabled.");
  }
  cached = drizzle(postgres(url, { max: 1 }), { schema });
  return cached;
}
