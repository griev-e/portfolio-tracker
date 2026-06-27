import "./scripts/load-env";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — drives `npm run db:push` (creates/updates the two tables
 * in Neon / Vercel Postgres). The schema lives in `lib/db/schema.ts`. Reads
 * DATABASE_URL from the environment (see scripts/load-env.ts for local `.env`).
 */
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
