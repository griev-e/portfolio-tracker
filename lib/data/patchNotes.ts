export type PatchNote = {
  version: string;
  date: string;
  title: string;
  changes: string[];
};

// Newest first. Add an entry here whenever a notable change ships.
export const PATCH_NOTES: PatchNote[] = [
  {
    version: "1.9",
    date: "2026-06",
    title: "Patch notes",
    changes: ["Added this Patch Notes tab under Data to track what's shipped."],
  },
  {
    version: "1.8",
    date: "2026-05",
    title: "Tests, perf, and resilience",
    changes: [
      "Added test coverage, performance, and security hardening across the app.",
      "Improved resilience of the AI daily brief pipeline.",
    ],
  },
  {
    version: "1.7",
    date: "2026-04",
    title: "Quality tab overhaul",
    changes: [
      "Rebuilt the Quality tab with a categorized scorecard.",
      "Added per-holding quality grades.",
    ],
  },
  {
    version: "1.6",
    date: "2026-04",
    title: "Market Analysis refinements",
    changes: [
      "Redesigned the regime dial as the page centerpiece.",
      "Introduced progressive-disclosure layers for the underlying signals.",
    ],
  },
  {
    version: "1.5",
    date: "2026-03",
    title: "Research, search-first",
    changes: ["Overhauled Research into a search-first terminal for any ticker."],
  },
  {
    version: "1.4",
    date: "2026-03",
    title: "Cross-tab refinements",
    changes: ["Tab-by-tab UI and analytics refinements across the app."],
  },
  {
    version: "1.3",
    date: "2026-02",
    title: "Rebrand to grieve",
    changes: ["Renamed the project from Sanctum to grieve.", "Stopped the lock-screen logo spin."],
  },
  {
    version: "1.2",
    date: "2026-01",
    title: "Rebalance and Intelligence",
    changes: [
      "Added the portfolio rebalancer / cash-deployment tool.",
      "Added the Intelligence tab: AI daily brief, news, earnings, and alerts.",
    ],
  },
  {
    version: "1.1",
    date: "2025-12",
    title: "Market Analysis and Dividends",
    changes: [
      "Added the Market Analysis tab with an adaptive regime engine.",
      "Added the Dividends tab: income quality and durability engine.",
    ],
  },
  {
    version: "1.0",
    date: "2025-10",
    title: "Initial release",
    changes: [
      "Launched the portfolio analytics terminal: allocation, risk, research, correlation, scenarios, and Monte Carlo.",
      "CSV import, live quotes and fundamentals with offline snapshot fallback, PIN lock screen.",
    ],
  },
];
