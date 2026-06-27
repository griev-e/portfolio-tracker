/**
 * Minimal .env loader for standalone scripts (create-user, drizzle-kit).
 *
 * Next.js loads `.env.local` automatically for the app, but plain `tsx` scripts
 * and `drizzle-kit` do not. This reads `.env.local` then `.env` and populates
 * `process.env` for any key not already set — no dotenv dependency, import for
 * side effects: `import "./load-env"`.
 */
import { existsSync, readFileSync } from "node:fs";

function load(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

load(".env.local");
load(".env");
