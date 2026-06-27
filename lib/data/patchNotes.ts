export type PatchNote = {
  version: string;
  date: string;
  title: string;
  changes: string[];
};

// Newest first. Add an entry here whenever a notable change ships.
export const PATCH_NOTES: PatchNote[] = [
  {
    version: "1.27",
    date: "2026-06-27",
    title: "delta — a sister personal-finance terminal, and a portal to both",
    changes: [
      "The lock screen is now a portal: α | Δ. alpha (portfolio analytics) and delta (personal finance) share one door and one PIN — pick a side with a fluid, animated chooser, then enter the code (or walk straight in when no PIN is set). The unlock choreography tints to whichever terminal you chose.",
      "Introduced delta, a new personal-finance app that shares alpha's dark, institutional aesthetic and its own shell, nav and iris accent. Tabs: Dashboard, Net Worth, Accounts, Transactions, Cash Flow, Budgets, Goals, Recurring and Settings — net worth, balances, spending mix, budget pacing and savings goals, all hand-built in the same SVG/Framer style.",
      "An always-available α ⇄ Δ switcher in both sidebars (and the mobile bars) lets you hop between the two terminals at any time. delta currently runs on illustrative sample data — clearly labelled — with no real accounts connected.",
    ],
  },
  {
    version: "1.26",
    date: "2026-06-26",
    title: "Live benchmark volatility & a self-refreshing snapshot",
    changes: [
      "Benchmark volatility is now live: the S&P 500 and NASDAQ-100 figures used on the Risk, Benchmark and Report pages are computed from trailing-1y realized returns (^GSPC / ^NDX) instead of a static number, falling back to the bundled value when the feed is down.",
      "Honest about the one input that can't be live: the equity risk premium has no observable market quote, so it stays a fixed forward-looking assumption — now said plainly in the expected-return explainer, next to the note that the risk-free rate and market volatility are fetched live.",
      "The bundled fundamentals snapshot — the offline backstop — no longer drifts silently: a scheduled monthly job re-pulls live fundamentals for every covered name and opens a pull request with only the values that moved (curated names, sectors and ETF look-through are left alone), so the fallback stays current and every change is reviewed.",
    ],
  },
  {
    version: "1.25",
    date: "2026-06-26",
    title: "Data provenance — live vs snapshot, made visible",
    changes: [
      "Every holding now carries a data-source read-out. As live quotes and fundamentals merge over the bundled snapshot, the app records — field by field — whether each value is live or a snapshot fallback, then rolls that up per holding to Live, Partial, or Snapshot.",
      "Surfaced in the UI so a frozen value is never silently shown as if it were live: a provenance dot next to every symbol on Overview (hover to see which risk-critical fields fell back to the snapshot), a portfolio-wide coverage summary on the holdings table, and a more honest badge on Research — a partial merge no longer reads as fully 'Live'.",
      "Foundation for an opt-in live-only mode (coming next) that will render an explicit 'unavailable' state instead of any stale value.",
    ],
  },
  {
    version: "1.24",
    date: "2026-06-26",
    title: "Live capital-market assumptions",
    changes: [
      "Risk-free rate and market volatility — inputs to expected return, Sharpe, and the optimizer's CAPM math — are now fetched live (13-week T-bill yield and realized S&P 500 volatility) instead of a hand-set constant, refreshed every 6h. Equity risk premium has no observable market quote and stays a static assumption.",
      "Falls back to the static snapshot in lib/data/benchmarks.ts if the live fetch fails, so risk/optimizer math never breaks when the provider is unavailable.",
    ],
  },
  {
    version: "1.23",
    date: "2026-06-24",
    title: "Discover — AI stock ideas",
    changes: [
      "New Discover tab (under Portfolio): AI-generated stock ideas tailored to your book. Six preset research lenses — Diversify, High Growth, Value & Income, Defensive Hedge, Quality Moats, Megatrends — each runs a distinct brief against your holdings.",
      "Claude reads your portfolio (weights, sectors, valuation, quality, and book-level risk/return metrics), then proposes new names you don't own: a standalone thesis, a 'fits your book' rationale tying it to your gaps, a few approximate metrics, and the key risk — highest conviction first. Each idea is grounded with a live price and a deep-link into Research.",
      "Runs on Claude Opus 4.8 with adaptive thinking (selecting securities for a specific book is a genuine reasoning task), with the estimated cost shown like the other AI outputs. Cached once per day per lens + portfolio shape; degrades gracefully when ANTHROPIC_API_KEY is unset.",
    ],
  },
  {
    version: "1.22",
    date: "2026-06-24",
    title: "Live fundamentals — volatility, ROIC, FCF growth, region mix",
    changes: [
      "The fields that used to come only from the hand-maintained snapshot are now pulled live. Realized volatility is computed from Yahoo price history; ROIC and FCF growth are derived from Yahoo's statement modules; all three overlay the snapshot field-by-field where available.",
      "Optional Financial Modeling Prep integration: set FMP_API_KEY and ROIC, FCF growth and a real revenue-by-region mix are sourced from FMP — the fields Yahoo's keyless feed can't cleanly provide. With no key, the app runs on Yahoo alone, unchanged. Kept to three calls per symbol and 12h-cached to respect the free tier.",
      "Groundwork for retiring the static snapshot: fundamentals now flow through a Yahoo + FMP orchestrator (lib/server/fundamentals.ts), with the snapshot demoted to a pure offline backstop.",
    ],
  },
  {
    version: "1.21",
    date: "2026-06-24",
    title: "Analytics audit — math fixes",
    changes: [
      "Monte Carlo: the median return shown under the fan (\"CAGR on money in\") is now a true money-weighted return (IRR). It previously divided the median outcome by every contributed dollar as if all of it had been invested on day one, which understated the rate for plans with monthly contributions; it now grows the actual contribution schedule into the median terminal, so the figure reads higher and is methodologically correct.",
      "Dividends: a year's per-share rate now uses a true median of that year's payments (averaging the two middle payments in an even quarter count) instead of picking the upper-middle one — removing a small upward bias in year-over-year growth and CAGR for some payers.",
      "Internal cleanup: de-duplicated shared math helpers and tightened a couple of module boundaries. No behavior change beyond the two items above.",
    ],
  },
  {
    version: "1.20",
    date: "2026-06-23",
    title: "Holdings news tagging fix",
    changes: [
      "The holdings news feed now tags each story with the holding it's genuinely about. Previously the ticker shown (and the filter chip a story fell under) was just whichever holding's search returned it first — so a market-wide story like \"Alphabet joins the Dow\" could surface under AAPL and stay mislabeled. Tags are now driven by Yahoo's own related-tickers (a confirmed ticker wins, then any other holding the story names), falling back to the search bucket only when there's no better signal.",
      "Incidental noise is filtered out: when Yahoo says a story is about other companies and none of them are in your book, it's no longer shown just because it mentioned a holding in passing.",
    ],
  },
  {
    version: "1.19",
    date: "2026-06-23",
    title: "Unlock transition",
    changes: [
      "Entering the correct PIN now plays a single continuous animation into the terminal: the PIN field collapses inward and the title recedes, the α sigil swells under a soft white glow while two light rings ripple outward, the lock screen washes to black, and the app fades back out of that same black — so the two screens read as one slow, deliberate motion instead of a hard page swap.",
      "The hand-off across the reload is now seamless and smooth: a render-blocking overlay covers the very first painted frame of the app (no flashes), and every step animates only GPU-composited transform/opacity, so it stays at full frame rate.",
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
