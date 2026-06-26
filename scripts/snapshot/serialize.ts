import type { FundamentalsPatch } from "@/lib/live/types";

/**
 * Pure serializer for the bundled fundamentals snapshot refresh.
 *
 * Given the text of `lib/data/fundamentals.ts` and a map of live patches keyed
 * by symbol, it overlays each provider value onto the matching `ROWS` entry —
 * but only where the value has genuinely drifted. The comparison is numeric (or
 * exact for strings); unchanged values keep their original text byte-for-byte,
 * so:
 *
 *   - a run with no patches (or no drift) returns the input unchanged
 *     (idempotent — safe to run repeatedly),
 *   - a real refresh produces a minimal diff touching only the values that
 *     moved, which keeps the review PR readable.
 *
 * It deliberately edits in place rather than re-emitting the whole array, so
 * the hand-authored section comments, key ordering, and curated identity fields
 * (symbol, name, sector, industry, ETF look-through weights) are preserved. A
 * field the provider didn't return — or one the row doesn't already carry — is
 * left untouched; the refresh never blanks a curated value or adds new keys.
 */

export interface SnapshotChange {
  symbol: string;
  key: string;
  from: string;
  to: string;
}

interface FieldUpdate {
  /** Row key as it appears in the source (e.g. "beta", "insNet"). */
  key: string;
  /** New value from the patch, or undefined to leave the field alone. */
  read: (p: FundamentalsPatch) => number | string | undefined;
  /** Serialize the new value to source text. */
  format: (v: number | string) => string;
  /** True when the existing token already represents this value (skip). */
  equal: (oldText: string, v: number | string) => boolean;
}

/** Format a number with up to `decimals` places, trimming trailing zeros. */
function fmtNum(v: number, decimals: number): string {
  let s = v.toFixed(decimals);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

function numField(
  key: string,
  read: (p: FundamentalsPatch) => number | null | undefined,
  decimals: number,
  tol: number
): FieldUpdate {
  return {
    key,
    read: (p) => {
      const v = read(p);
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    },
    format: (v) => fmtNum(v as number, decimals),
    equal: (oldText, v) => {
      const o = parseFloat(oldText);
      return Number.isFinite(o) && Math.abs(o - (v as number)) <= tol;
    },
  };
}

function strField(
  key: string,
  read: (p: FundamentalsPatch) => string | null | undefined
): FieldUpdate {
  return {
    key,
    read: (p) => {
      const v = read(p);
      return typeof v === "string" && v.length > 0 ? v : undefined;
    },
    format: (v) => `"${v}"`,
    equal: (oldText, v) => oldText.replace(/^"|"$/g, "") === v,
  };
}

/**
 * Refreshable fields. Curated identity/classification (s, n, sec, ind), the
 * analyst target band (ptl, pth) and ETF sector look-through (fundSec) are
 * intentionally left out — they're either risky to auto-rewrite or hand-tuned.
 */
const FIELDS: FieldUpdate[] = [
  numField("cap", (p) => (p.marketCap != null ? p.marketCap / 1e9 : undefined), 0, 1),
  numField("beta", (p) => p.beta, 2, 0.02),
  numField("vol", (p) => p.volatility, 3, 0.005),
  numField("rg", (p) => p.revenueGrowth, 4, 0.005),
  numField("eg", (p) => p.epsGrowth, 4, 0.005),
  numField("fg", (p) => p.fcfGrowth, 4, 0.005),
  numField("pe", (p) => p.forwardPE ?? undefined, 2, 0.2),
  numField("fy", (p) => p.fcfYield, 4, 0.0005),
  numField("roic", (p) => p.roic, 4, 0.005),
  numField("om", (p) => p.operatingMargin, 4, 0.005),
  numField("gm", (p) => p.grossMargin, 4, 0.005),
  numField("dy", (p) => p.dividendYield, 4, 0.0005),
  numField("r12", (p) => p.return12m, 4, 0.01),
  strField("rt", (p) => p.analyst?.rating),
  numField("pt", (p) => p.analyst?.priceTarget, 2, 0.5),
  numField("an", (p) => p.analyst?.count, 0, 0.5),
  strField("ins", (p) => p.insider?.signal),
  numField(
    "insNet",
    (p) => (p.insider?.netActivity6m != null ? p.insider.netActivity6m / 1e6 : undefined),
    0,
    1
  ),
  strField("ed", (p) => p.earningsDate ?? undefined),
  numField("eu", (p) => p.regions?.Europe, 2, 0.01),
  numField("ap", (p) => p.regions?.["Asia-Pacific"], 2, 0.01),
  numField("em", (p) => p.regions?.Emerging, 2, 0.01),
];

/** Matches a single `key: value` token, anchored to a key boundary (`{`/`,`). */
function tokenRegex(key: string): RegExp {
  return new RegExp(`([{,]\\s*${key}:\\s*)("[^"]*"|[^,}\\s]+)(\\s*[,}])`);
}

const ROW_LINE = /^\s*\{\s*s:\s*"([^"]+)",/;
const HEADER_DATE = /snapshot date \(\d{4}-\d{2}-\d{2}\)/;

export function applySnapshotPatches(
  text: string,
  patches: Map<string, FundamentalsPatch>,
  asOf: string
): { text: string; changes: SnapshotChange[] } {
  const lines = text.split("\n");
  const changes: SnapshotChange[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ROW_LINE);
    if (!m) continue;
    const symbol = m[1];
    const patch = patches.get(symbol);
    if (!patch) continue;

    let line = lines[i];
    for (const f of FIELDS) {
      const v = f.read(patch);
      if (v === undefined) continue;
      const re = tokenRegex(f.key);
      const tm = line.match(re);
      if (!tm) continue; // field not present on this row — never add it
      const oldText = tm[2];
      if (f.equal(oldText, v)) continue;
      const newText = f.format(v);
      if (newText === oldText) continue;
      line = line.replace(re, `$1${newText}$3`);
      changes.push({ symbol, key: f.key, from: oldText, to: newText });
    }
    lines[i] = line;
  }

  let out = lines.join("\n");
  // Only stamp a fresh snapshot date when something actually changed.
  if (changes.length > 0) {
    out = out.replace(HEADER_DATE, `snapshot date (${asOf})`);
  }
  return { text: out, changes };
}
