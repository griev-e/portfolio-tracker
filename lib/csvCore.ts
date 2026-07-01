/**
 * Shared CSV primitive for the two importers (alpha `lib/csv.ts` and theta
 * `lib/theta/csv.ts`). Only the row splitter is shared: the number parsers stay
 * per-module because their contracts genuinely differ (alpha returns NaN and
 * strips `%`; theta returns null and keeps `%`), and their strip/unwrap order is
 * load-bearing for the odd formats each tolerates.
 */

/**
 * RFC-4180-ish CSV row splitter with quoted-field support. A doubled quote
 * (`""`) inside a quoted field is an escaped quote; commas inside quotes are
 * kept literal. Cells are returned untrimmed — callers trim as they need.
 */
export function splitCsvLine(line: string): string[] {
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
