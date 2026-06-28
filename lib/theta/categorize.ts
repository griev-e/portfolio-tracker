/**
 * Pure merchant → category inference for theta.
 *
 * Feeds derived from sources that don't carry theta's own categories — bank
 * syncs (SimpleFIN) and category-less CSV columns — get a best-effort category
 * from the merchant string, falling back to "Other". Keyword-only, no AI cost;
 * the user re-categorizes the misses by hand. Order matters: the first rule
 * whose keyword appears in the (lower-cased) merchant wins, so more specific
 * keywords are listed before broad ones.
 */
import type { Category } from "./data";

type Rule = { match: string[]; category: Category };

/** Substring rules, scanned top-to-bottom. Keep specific before generic. */
export const CATEGORIZE_RULES: Rule[] = [
  { match: ["payroll", "paycheck", "direct dep", "deposit from", "interest earned", "dividend"], category: "Income" },
  { match: ["transfer", "withdrawal", "venmo", "zelle", "cash app", "wire"], category: "Transfer" },
  { match: ["rent", "mortgage", "landlord", "property mgmt", "hoa"], category: "Housing" },
  { match: ["uber", "lyft", "shell", "chevron", "exxon", "bp ", "gas", "parking", "transit", "mta", "metro", "toll", "delta", "united air", "american air", "southwest"], category: "Transport" },
  { match: ["netflix", "spotify", "hulu", "disney+", "youtube premium", "icloud", "patreon", "prime video", "hbo", "audible"], category: "Subscriptions" },
  { match: ["whole foods", "trader joe", "safeway", "kroger", "grocery", "chipotle", "starbucks", "coffee", "mcdonald", "restaurant", "sweetgreen", "doordash", "grubhub", "cafe", "pizza", "deli"], category: "Food & Dining" },
  { match: ["con ed", "coned", "electric", "verizon", "at&t", "t-mobile", "comcast", "xfinity", "water", "utility", "internet"], category: "Utilities" },
  { match: ["cvs", "walgreens", "pharmacy", "doctor", "dental", "clinic", "hospital", "equinox", "gym", "fitness"], category: "Health" },
  { match: ["amc", "cinema", "theatre", "theater", "ticketmaster", "steam", "playstation", "xbox", "concert"], category: "Entertainment" },
  { match: ["airbnb", "hotel", "marriott", "hilton", "expedia", "airlines", "vrbo", "resort"], category: "Travel" },
  { match: ["amazon", "target", "walmart", "best buy", "apple store", "etsy", "ebay", "ikea", "nike", "store"], category: "Shopping" },
];

/**
 * Infer a category from a merchant/description. Income/transfer signals win
 * regardless of amount sign, since a refund can arrive as a positive shopping
 * line. Returns "Other" when nothing matches.
 */
export function categorize(merchant: string): Category {
  const s = merchant.toLowerCase();
  for (const rule of CATEGORIZE_RULES) {
    if (rule.match.some((k) => s.includes(k))) return rule.category;
  }
  return "Other";
}
