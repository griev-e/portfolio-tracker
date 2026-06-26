/**
 * Refresh the bundled fundamentals snapshot (`lib/data/fundamentals.ts`) from
 * the live providers, so the offline backstop never goes stale.
 *
 * For every symbol the snapshot already knows, it pulls the same Yahoo (+ FMP
 * when `FMP_API_KEY` is set) patch the app uses live, then overlays drifted
 * values onto the source via the pure, idempotent serializer in
 * ./snapshot/serialize. Curated identity fields are preserved and missing keys
 * are never added; only values that genuinely moved are rewritten.
 *
 * Usage:
 *   npx tsx scripts/refresh-snapshot.ts            # rewrite the file in place
 *   npx tsx scripts/refresh-snapshot.ts --dry-run  # print the diff, write nothing
 *   npx tsx scripts/refresh-snapshot.ts --limit=5  # only the first N symbols
 *
 * Intended to run on a schedule (see .github/workflows/refresh-snapshot.yml),
 * which opens a PR with the diff for human review — it never commits to the
 * snapshot directly.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { knownSymbols } from "@/lib/data/fundamentals";
import type { FundamentalsPatch } from "@/lib/live/types";
import { fetchFundamentalsPatch } from "@/lib/server/fundamentals";
import { applySnapshotPatches } from "./snapshot/serialize";

const FILE = path.join(process.cwd(), "lib/data/fundamentals.ts");
const CONCURRENCY = 5;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : Infinity;

async function fetchAll(
  symbols: string[]
): Promise<Map<string, FundamentalsPatch>> {
  const out = new Map<string, FundamentalsPatch>();
  let idx = 0;
  async function worker() {
    while (idx < symbols.length) {
      const sym = symbols[idx++];
      try {
        const patch = await fetchFundamentalsPatch(sym);
        if (patch) out.set(sym, patch);
        process.stderr.write(patch ? "." : "x");
      } catch {
        process.stderr.write("!"); // provider hiccup — keep the curated value
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, symbols.length) },
    worker
  );
  await Promise.all(workers);
  process.stderr.write("\n");
  return out;
}

async function main() {
  const symbols = knownSymbols().slice(0, limit);
  console.error(`Fetching live fundamentals for ${symbols.length} symbols…`);
  const patches = await fetchAll(symbols);
  console.error(`Got patches for ${patches.size}/${symbols.length} symbols.`);

  const text = await readFile(FILE, "utf8");
  const asOf = new Date().toISOString().slice(0, 10);
  const { text: next, changes } = applySnapshotPatches(text, patches, asOf);

  if (changes.length === 0) {
    console.error("No drift beyond tolerance — snapshot unchanged.");
    return;
  }

  const symbolsChanged = new Set(changes.map((c) => c.symbol)).size;
  console.error(
    `${changes.length} field updates across ${symbolsChanged} symbols.`
  );

  if (dryRun) {
    for (const c of changes.slice(0, 50)) {
      console.error(`  ${c.symbol}.${c.key}: ${c.from} → ${c.to}`);
    }
    if (changes.length > 50) {
      console.error(`  …and ${changes.length - 50} more`);
    }
    console.error("(dry run — not writing)");
    return;
  }

  await writeFile(FILE, next);
  console.error(`Wrote ${FILE}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
