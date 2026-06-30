# alpha — Private Portfolio Intelligence

A dark, institutional-grade personal finance suite with two apps in one
deployment: **alpha**, a portfolio analytics terminal, and **theta**, its
sister personal-finance/budgeting app. Import your holdings (or transactions)
as CSV and get allocation, risk, research, quality, factor, scenario,
correlation, and Monte Carlo analysis — all computed client-side with
hand-built animated SVG visualizations. By default there are no accounts and
no database: your data lives in the browser's `localStorage`. Accounts are an
**optional** layer — turn them on and each person gets their own saved
portfolio/ledger persisted server-side.

## alpha — portfolio analytics

| Page | What it does |
| --- | --- |
| **Overview** | Net value, cash position, P&L, squarified allocation treemap (size × performance), interactive donut, sortable holdings table with per-position data-source provenance |
| **Intelligence** | AI daily brief (Claude) summarizing the portfolio's state, plus the market regime read |
| **Risk** | Beta / volatility / Sharpe gauges vs S&P 500, position concentration (HHI, effective N, top-N), marginal risk contributions, sector tilts vs SPX, revenue-weighted geographic exposure |
| **Research** | Per-holding dashboard: market cap, revenue/EPS/FCF growth, forward P/E, PEG, ROIC, margins, analyst rating + price-target bullet chart, insider buying/selling, next earnings countdown, per-stock factor profile |
| **Dividends** | Dividend history and forward income projection across the portfolio |
| **Rebalance** | AI dry-powder allocator — pick where new cash should go given current weights and fundamentals |
| **Discover** | AI stock-idea generator across six research lenses (diversify / growth / value / defensive / quality / thematic) |
| **Optimizer** | Deterministic constrained solver (projected gradient ascent / coordinate descent) over factor covariance and CAPM returns for eight objectives, with an AI review of the result |
| **Market Analysis** | The regime engine's composite read across ~23 daily index series — score, confidence, health, and drivers |
| **Quality** | Weighted scorecard (revenue growth, EPS growth, ROIC, operating margin, valuation multiples…) graded A+–F vs the S&P 500, with composite grade ring and per-holding drill-down |
| **Benchmark & Factors** | Head-to-head vs S&P 500 and NASDAQ-100, Growth/Value/Quality/Momentum factor radar, growth-vs-valuation positioning map |
| **Correlation** | Factor-model correlation heatmap with crosshair hover, most/least coupled pairs, diversification ratio |
| **Scenarios** | "What if TSLA falls 20%?" — single-name shocks with correlated spillover, market moves by beta, rate shocks scaled by duration/valuation/sector. Presets + custom builder |
| **Monte Carlo** | 3,000-path GBM simulation with monthly contributions, run in a Web Worker: percentile fan chart, target probability, terminal distribution. Seeded RNG — deterministic per portfolio |
| **Export Report** | Print-optimized, full-portfolio dossier (risk, quality, factors, correlation, dividends, regime) — exported via the browser's native print-to-PDF |
| **Import & Data** | Drag-and-drop / paste CSV, cash position, demo portfolio, CSV export, clear data |
| **Patch Notes** | Changelog of notable updates |

### CSV format

```csv
name,symbol,shares,price,averageCost,totalReturn,equity
Apple,AAPL,10,291.48,250.00,414.80,2914.80
Cash,CASH,1,850.00,850.00,0,850.00
```

The importer is forgiving: any column order, `$`/`,`/`%` formatting,
parenthesized negatives, quoted names, duplicate-lot merging. `totalReturn`
is auto-detected as dollars or percent. A `CASH`/`USD` row sets the cash
position. A sample file lives at `public/sample-portfolio.csv`.

## theta — personal finance

A companion budgeting/net-worth app at `/theta`, sharing the deployment and
optional accounts layer but with its own state and shell: Dashboard, Net
Worth, Intelligence (AI money brief), Accounts, Transactions, Cash Flow,
Budgets, Goals, Recurring, and Import & Data. Transactions can be imported
via CSV or synced from a bank through SimpleFIN (optional, requires
accounts). Categorization is inferred from merchant names and editable.

## Data model — read this once

- **Your positions**: the CSV is the source of truth for *shares and cost
  basis*. Holdings persist in localStorage (or server-side, with accounts
  on) and never leave the browser unless you turn accounts on.
- **Live quotes** (Yahoo Finance, unofficial, keyless): proxied through
  `/api/quotes`, CDN-cached 60s, polled every minute while the tab is
  visible. Price, equity, P&L, and the "Today" stat reprice automatically;
  if the feed fails, the app silently falls back to imported prices (amber
  status dot in the sidebar).
- **Live fundamentals** (Yahoo, same proxy pattern, enriched with Financial
  Modeling Prep when `FMP_API_KEY` is set): `/api/fundamentals` returns
  growth, margins, forward P/E, analyst targets, insider flows, earnings
  dates, dividend yield, realized volatility, ROIC, FCF growth, region mix,
  and ETF sector look-through — entirely live, no bundled snapshot.
  CDN-cached 12h. Each stock in Research shows a `live` / `partial` badge.
- **Market assumptions** (`lib/data/assumptions.ts`) cover the few inputs
  with no live quote — the equity risk premium and the S&P 500 / NASDAQ-100
  profitability & growth aggregates (no keyless index-level source exists).
  They're user-editable with reference-anchored presets (Market today /
  10-year average / Recession) on the Benchmark page, not hidden constants.
- **Derived analytics** (correlations, portfolio volatility, scenarios,
  Monte Carlo) are model estimates: a single-market-factor correlation model
  with sector/industry affinity, CAPM expected returns, and GBM simulation.
  Methodology notes live next to the math in `lib/analytics/*`.
- Holdings with no live data degrade honestly: allocation and P&L still work
  from the imported book, but they're **excluded** from the factor analytics
  (never imputed with a fake beta) and surfaced as a coverage gap in the UI.

Heads-up: Yahoo's API is unofficial. If it ever breaks, the app keeps
working on the imported book (allocation, weights, P&L) until `yahoo-finance2`
ships a fix, or you can swap the provider behind `lib/server/yahoo.ts` without
touching the analytics.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 ·
Framer Motion. All charts (treemap, donut, radar, heatmap, fan chart,
histogram, scatter, gauges, sparklines, price chart) are hand-built SVG — no
chart library.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # production build
npm run lint           # eslint (flat config + eslint-config-next)
npm run typecheck      # tsc --noEmit (strict)
npm test               # vitest — the analytics unit suite
```

## Environment variables (all optional)

See `.env.example` for full details. Nothing below is required to run the
app — every feature degrades gracefully when its variable is unset.

| Variable | Enables |
| --- | --- |
| `AUTH_SECRET` + `DATABASE_URL` | Real username/password accounts (NextAuth + Postgres) with server-side saved data. Both must be set; provision logins with `npm run create-user -- <user> <pass>`. |
| `ANTHROPIC_API_KEY` | The AI daily brief, dry-powder allocator, Discover ideas, optimizer review, and theta's money brief (Claude). |
| `FMP_API_KEY` | Financial Modeling Prep enrichment for ROIC, FCF growth, and region mix (free tier, 250 req/day). |

## Deploy to Vercel

The repo is zero-config for Vercel:

1. Push to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repo → Deploy.
   Framework preset "Next.js" is auto-detected.

Or from the CLI: `npx vercel`.

Set any of the environment variables above as desired, post-deploy. To turn
on accounts, also run `npm run db:push` and `npm run create-user` against
your `DATABASE_URL`.

## Disclaimer

alpha is an analysis tool, not investment advice. Bundled fundamentals are
approximations; simulations are models with thinner tails than real markets.
