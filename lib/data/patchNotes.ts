export type PatchNote = {
  version: string;
  date: string;
  title: string;
  changes: string[];
};

// Newest first. Add an entry here whenever a notable change ships.
export const PATCH_NOTES: PatchNote[] = [
  {
    version: "1.13",
    date: "2026-06-20",
    title: "Steadier Portfolio Mix legend",
    changes: [
      "The allocation donut legend now stays beside the chart and truncates long labels instead of wrapping below it, so switching to the Sector view no longer reflows or grows the card.",
    ],
  },
  {
    version: "1.12",
    date: "2026-06-19",
    title: "Consistent, PSD correlation model",
    changes: [
      "Rebuilt the correlation/covariance estimate as a positive-semi-definite factor model, so risk contributions can no longer come out negative.",
      "The correlation heatmap and the risk math now share one source of truth; most pairwise correlations are unchanged.",
    ],
  },
  {
    version: "1.11",
    date: "2026-06-18",
    title: "Patch notes",
    changes: ["Added this Patch Notes tab under Data to track what's shipped."],
  },
  {
    version: "1.10",
    date: "2026-06-17",
    title: "Tests, perf, and resilience",
    changes: [
      "Added test coverage, performance, and security hardening across the app.",
      "Improved resilience of the AI daily brief pipeline.",
    ],
  },
  {
    version: "1.9",
    date: "2026-06-17",
    title: "Quality tab overhaul",
    changes: [
      "Rebuilt the Quality tab with a categorized scorecard.",
      "Added per-holding quality grades.",
    ],
  },
  {
    version: "1.8",
    date: "2026-06-17",
    title: "Market Analysis refinements",
    changes: [
      "Redesigned the regime dial as the page centerpiece.",
      "Introduced progressive-disclosure layers for the underlying signals.",
    ],
  },
  {
    version: "1.7",
    date: "2026-06-17",
    title: "Research, search-first",
    changes: [
      "Overhauled Research into a search-first terminal for any ticker.",
      "Tab-by-tab UI and analytics refinements across the app.",
      "Renamed the project from Sanctum to grieve and stopped the lock-screen logo spin.",
    ],
  },
  {
    version: "1.6",
    date: "2026-06-16",
    title: "Rebalance tool",
    changes: ["Added the portfolio rebalancer / cash-deployment tool."],
  },
  {
    version: "1.5",
    date: "2026-06-12",
    title: "Intelligence tab",
    changes: [
      "Added the Intelligence tab: AI daily brief, news, earnings, and alerts.",
      "Fact-checked the market analysis engine; fixed a sign bug and misleading copy.",
      "Codebase sweep: dead code, small bugs, and hot-path cleanups.",
    ],
  },
  {
    version: "1.4",
    date: "2026-06-11",
    title: "Dividends, Market Analysis, and UI redesign",
    changes: [
      "Added the Dividends tab: income quality and durability engine.",
      "Added the Market Analysis tab with an adaptive regime engine.",
      "Redesigned the UI in a Vercel-inspired layout with Geist, and rebranded to grieve.",
      "Redesigned the All Positions table, added holdings logos, and compacted the correlation matrix.",
    ],
  },
  {
    version: "1.1",
    date: "2026-06-10",
    title: "Live data",
    changes: [
      "Added live data: Yahoo-backed quotes and fundamentals with offline snapshot fallback.",
      "Rebrand and theme pass, plus a round of UX fixes.",
    ],
  },
  {
    version: "1.0",
    date: "2026-06-10",
    title: "Initial release",
    changes: [
      "Launched the portfolio analytics terminal: allocation, risk, research, correlation, scenarios, and Monte Carlo.",
      "CSV import and PIN lock screen.",
    ],
  },
];
