import type { RawHolding } from "./types";

export interface ParseResult {
  holdings: RawHolding[];
  cash: number | null;
  warnings: string[];
  errors: string[];
}

const REQUIRED = [
  "name",
  "symbol",
  "shares",
  "price",
  "averagecost",
  "totalreturn",
  "equity",
] as const;

const CASH_SYMBOLS = new Set(["CASH", "USD", "$CASH", "MONEY", "SWEEP"]);

/** RFC-4180-ish CSV row splitter with quoted-field support. */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[$,%\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (cleaned === "" || cleaned === "-" || cleaned === "—") return NaN;
  return Number(cleaned);
}

function normalizeHeader(h: string): string {
  return h.replace(/[^a-z]/gi, "").toLowerCase();
}

/**
 * Parses a portfolio CSV with header:
 *   name,symbol,shares,price,averageCost,totalReturn,equity
 *
 * Tolerant of: column reordering, quoted fields, $/,/% formatting,
 * parenthesized negatives, blank lines, and a cash row (symbol CASH/USD).
 * totalReturn is auto-detected as dollars or percent and normalized to dollars.
 */
export function parsePortfolioCSV(text: string): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return {
      holdings: [],
      cash: null,
      warnings,
      errors: ["File needs a header row and at least one holding."],
    };
  }

  const header = splitRow(lines[0]).map(normalizeHeader);
  const idx: Record<string, number> = {};
  for (const col of REQUIRED) {
    const i = header.indexOf(col);
    if (i === -1) {
      errors.push(
        `Missing column "${col}". Expected header: name,symbol,shares,price,averageCost,totalReturn,equity`
      );
    }
    idx[col] = i;
  }
  if (errors.length) return { holdings: [], cash: null, warnings, errors };

  const holdings: RawHolding[] = [];
  let cash: number | null = null;

  for (let r = 1; r < lines.length; r++) {
    const cells = splitRow(lines[r]);
    const get = (col: (typeof REQUIRED)[number]) =>
      (cells[idx[col]] ?? "").trim();

    const symbol = get("symbol").toUpperCase().replace(/\s+/g, "");
    const name = get("name").trim() || symbol;
    if (!symbol) {
      warnings.push(`Row ${r + 1}: skipped — no symbol.`);
      continue;
    }

    // A cash row sets the cash position instead of becoming a holding.
    if (CASH_SYMBOLS.has(symbol)) {
      const cashVal = parseNumber(get("equity")) || parseNumber(get("price"));
      if (Number.isFinite(cashVal)) cash = (cash ?? 0) + cashVal;
      continue;
    }

    const shares = parseNumber(get("shares"));
    const price = parseNumber(get("price"));
    const averageCost = parseNumber(get("averagecost"));
    let totalReturn = parseNumber(get("totalreturn"));
    let equity = parseNumber(get("equity"));

    if (!Number.isFinite(shares) || shares <= 0) {
      warnings.push(`Row ${r + 1} (${symbol}): skipped — invalid shares.`);
      continue;
    }
    if (!Number.isFinite(price) || price <= 0) {
      warnings.push(`Row ${r + 1} (${symbol}): skipped — invalid price.`);
      continue;
    }

    if (!Number.isFinite(equity)) equity = shares * price;
    const impliedEquity = shares * price;
    if (Math.abs(equity - impliedEquity) / impliedEquity > 0.02) {
      warnings.push(
        `${symbol}: equity (${equity.toFixed(2)}) ≠ shares × price (${impliedEquity.toFixed(2)}); using the imported equity.`
      );
    }

    const costBasis = shares * averageCost;
    const dollarPL = equity - costBasis;

    if (!Number.isFinite(totalReturn)) {
      totalReturn = dollarPL;
    } else if (Number.isFinite(averageCost) && averageCost > 0) {
      // Detect % vs $: a raw value like "12.5" could be 12.5% or $12.50.
      // Prefer whichever interpretation reconciles with equity − cost basis.
      const rawCell = get("totalreturn");
      const looksPercent = rawCell.includes("%");
      const asPercentDollars = (totalReturn / 100) * costBasis;
      const dollarGap = Math.abs(totalReturn - dollarPL);
      const pctGap = Math.abs(asPercentDollars - dollarPL);
      if (looksPercent || (pctGap < dollarGap && Math.abs(totalReturn) <= 500)) {
        totalReturn = asPercentDollars;
      }
    }

    holdings.push({
      name,
      symbol,
      shares,
      price,
      averageCost: Number.isFinite(averageCost) ? averageCost : price,
      totalReturn,
      equity,
    });
  }

  // Merge duplicate symbols (e.g. multiple lots exported separately).
  const merged = new Map<string, RawHolding>();
  for (const h of holdings) {
    const prev = merged.get(h.symbol);
    if (!prev) {
      merged.set(h.symbol, { ...h });
    } else {
      const shares = prev.shares + h.shares;
      const equity = prev.equity + h.equity;
      const costBasis = prev.shares * prev.averageCost + h.shares * h.averageCost;
      merged.set(h.symbol, {
        name: prev.name,
        symbol: h.symbol,
        shares,
        price: equity / shares,
        averageCost: costBasis / shares,
        totalReturn: prev.totalReturn + h.totalReturn,
        equity,
      });
      warnings.push(`${h.symbol}: merged duplicate rows.`);
    }
  }

  const final = [...merged.values()];
  if (final.length === 0 && errors.length === 0) {
    errors.push("No valid holdings found in file.");
  }
  return { holdings: final, cash, warnings, errors };
}

export function toCSV(holdings: RawHolding[], cash: number): string {
  const rows = [
    "name,symbol,shares,price,averageCost,totalReturn,equity",
    ...holdings.map((h) =>
      [
        /[",]/.test(h.name) ? `"${h.name.replace(/"/g, '""')}"` : h.name,
        h.symbol,
        h.shares,
        h.price.toFixed(2),
        h.averageCost.toFixed(2),
        h.totalReturn.toFixed(2),
        h.equity.toFixed(2),
      ].join(",")
    ),
  ];
  if (cash > 0) rows.push(`Cash,CASH,1,${cash.toFixed(2)},${cash.toFixed(2)},0,${cash.toFixed(2)}`);
  return rows.join("\n");
}
