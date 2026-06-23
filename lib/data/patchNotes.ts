export type PatchNote = {
  version: string;
  date: string;
  title: string;
  changes: string[];
};

// Newest first. Add an entry here whenever a notable change ships.
export const PATCH_NOTES: PatchNote[] = [
  {
    version: "1.19",
    date: "2026-06-23",
    title: "Unlock transition",
    changes: [
      "Entering the correct PIN now plays a single continuous animation into the terminal: the PIN field collapses inward and the title recedes, the α sigil swells under a soft white glow while two light rings ripple outward, the lock screen washes to black, and the app fades back out of that same black with the sigil dissolving from where it left off — so the two screens read as one slow, deliberate motion instead of a hard page swap.",
    ],
  },
  {
    version: "1.18",
    date: "2026-06-23",
    title: "Rebrand to alpha",
    changes: ["Renamed the project from grieve to alpha across the app, storage keys, and the auth cookie."],
  },
  {
    version: "1.17",
    date: "2026-06-23",
    title: "Hover explainers & cross-tab polish",
    changes: [
      "Added hover-reveal explanation boxes throughout the terminal — rest the pointer on a metric (beta, volatility, Sharpe, expected return, diversification ratio, HHI, effective N, average pairwise ρ, regime confidence/health/direction/age, and the analytical layers' weight/agreement/stability) to read what it actually measures.",
      "Overview: centered the holdings table column headers over their columns.",
      "Intelligence: the daily brief now generates on a button instead of on page load, the earnings calendar has a legend for the weight bar, the holdings news feed dedupes and counts per ticker, and the brief shows its estimated AI cost.",
      "Optimizer: default position cap is now 10%, a new guardrail lets you allow full exits (off by default, with a minimum-position floor when off), the efficient-frontier chart fills its column, bought slices in the allocation bars glow, and the AI review reports its estimated cost.",
      "Market Analysis: the Direction and Regime-age tiles read more clearly at the same size.",
      "Quality: per-holding drill-down cards now show a book-relative grade and a strongest/softest category read alongside the bars.",
      "Dividends: the explainability panel is collapsible and starts collapsed.",
      "Rebalance: target-mix inputs are wider and step in 0.1% increments.",
      "Scenarios: the custom stock-move slider now defaults to 0%, and the empty results panel matches the controls' height.",
      "Monte Carlo: the target can now reach 100× today, hovering a terminal-distribution bar shows how many outcomes landed there, and a Refresh simulation button redraws a fresh set of paths.",
    ],
  },
  {
    version: "1.16",
    date: "2026-06-23",
    title: "AI Optimizer",
    changes: [
      "Added an Optimizer tab under Analysis: an institutional portfolio-construction tool that solves for optimal weights on your holdings against the terminal's factor risk model.",
      "Eight objective presets — maximum Sharpe, minimum volatility, risk parity, max diversification, maximum return, income, quality tilt, and equal weight — with position-cap and drop-threshold guardrails.",
      "Plots the efficient frontier with your current and optimized portfolios, shows the before → after risk/return metrics, and generates a rebalance order ticket.",
      "Claude Sonnet 4.6 reviews each optimization and writes the construction desk note: the thesis, the tradeoffs you take on, the residual risk, and a calibrated verdict.",
    ],
  },
  {
    version: "1.15",
    date: "2026-06-22",
    title: "Risk-weighted average correlation",
    changes: [
      "The Correlation page and Export Report now headline a risk-weighted average pairwise correlation — each pair weighted by its contribution to portfolio variance — so two large, volatile holdings moving together count for more than two tiny tail positions. It tracks the diversification math in the risk model and reflects realized co-movement better than the old equal-weighted mean.",
    ],
  },
  {
    version: "1.14",
    date: "2026-06-20",
    title: "Aligned Intelligence cards",
    changes: [
      "On the Intelligence page, the Holdings news card now matches the height of the Earnings calendar beside it and scrolls its headlines internally, instead of stretching the row to fit the news list.",
    ],
  },
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
      "Renamed the project from Sanctum to alpha and stopped the lock-screen logo spin.",
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
      "Redesigned the UI in a Vercel-inspired layout with Geist, and rebranded to alpha.",
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
