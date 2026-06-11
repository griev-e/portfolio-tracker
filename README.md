# Sanctum — Private Portfolio Intelligence

A dark, institutional-grade personal portfolio analytics terminal. Import your
holdings as CSV and get allocation, risk, research, quality, factor, scenario,
correlation, and Monte Carlo analysis — all computed client-side with
hand-built animated SVG visualizations. No accounts, no servers, no tracking:
your portfolio lives in your browser's localStorage.

## Features

| Page | What it does |
| --- | --- |
| **Overview** | Net value, cash position, P&L, squarified allocation treemap (size × performance), interactive donut, sortable holdings table |
| **Risk** | Beta / volatility / Sharpe gauges vs S&P 500, position concentration (HHI, effective N, top-N), marginal risk contributions, sector tilts vs SPX, revenue-weighted geographic exposure |
| **Research** | Per-holding dashboard: market cap, revenue/EPS/FCF growth, forward P/E, PEG, ROIC, margins, analyst rating + price-target bullet chart, insider buying/selling, next earnings countdown, per-stock factor profile |
| **Quality** | Weighted scorecard (revenue growth, EPS growth, ROIC, operating margin, valuation multiples…) graded A+–F vs the S&P 500, with composite grade ring and per-holding drill-down. Multiples aggregate via weighted harmonic mean |
| **Benchmark & Factors** | Head-to-head vs S&P 500 and NASDAQ-100, Growth/Value/Quality/Momentum factor radar, growth-vs-valuation positioning map |
| **Scenarios** | "What if TSLA falls 20%?" — single-name shocks with correlated spillover, market moves by beta, rate shocks scaled by duration/valuation/sector. Presets + custom builder |
| **Correlation** | Factor-model correlation heatmap with crosshair hover, most/least coupled pairs, diversification ratio |
| **Monte Carlo** | 3,000-path GBM simulation with monthly contributions: percentile fan chart, target probability, terminal distribution. Seeded RNG — deterministic per portfolio |
| **Import & Data** | Drag-and-drop / paste CSV, cash position, demo portfolio, CSV export, clear data |

## CSV format

```csv
name,symbol,shares,price,averageCost,totalReturn,equity
Apple,AAPL,10,291.48,250.00,414.80,2914.80
Cash,CASH,1,850.00,850.00,0,850.00
```

The importer is forgiving: any column order, `$`/`,`/`%` formatting,
parenthesized negatives, quoted names, duplicate-lot merging. `totalReturn`
is auto-detected as dollars or percent. A `CASH`/`USD` row sets the cash
position. A sample file lives at `public/sample-portfolio.csv`.

## Data model — read this once

- **Your positions**: the CSV is the source of truth for *shares and cost
  basis*. Holdings persist in localStorage and never leave the browser.
- **Live quotes** (Yahoo Finance, unofficial, keyless): proxied through
  `/api/quotes`, CDN-cached 60s, polled every minute while the tab is
  visible. Price, equity, P&L, and the "Today" stat reprice automatically;
  if the feed fails, the app silently falls back to imported prices (amber
  status dot in the sidebar).
- **Live fundamentals** (Yahoo, same proxy pattern): `/api/fundamentals`
  overlays growth, margins, forward P/E, analyst targets, insider flows,
  earnings dates, dividend yield, and ETF sector look-through onto the
  bundled snapshot, field by field. CDN-cached 12h. Each stock in Research
  shows a `live` / `snapshot` badge.
- **Bundled snapshot** (`lib/data/fundamentals.ts`, ~90 tickers + major
  ETFs) is the fallback layer for anything the provider doesn't return
  (e.g. ROIC, FCF growth, region revenue mixes, per-name volatility) and
  for fully offline use.
- **Derived analytics** (correlations, portfolio volatility, scenarios,
  Monte Carlo) are model estimates: a single-market-factor correlation model
  with sector/industry affinity, CAPM expected returns, and GBM simulation.
  Methodology notes live next to the math in `lib/analytics/*`.
- Unknown tickers degrade gracefully: with live data they get promoted to
  full research coverage; without it they keep allocation/P&L math and use
  conservative defaults (β = 1.0, σ = 32%), flagged in the UI.

Heads-up: Yahoo's API is unofficial. If it ever breaks, the app keeps
working on imported prices + snapshot until `yahoo-finance2` ships a fix, or
you can swap the provider behind `lib/server/yahoo.ts` without touching the
analytics.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
Framer Motion. All charts (treemap, donut, radar, heatmap, fan chart,
histogram, scatter, gauges) are hand-built SVG — no chart library.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Deploy to Vercel

The repo is zero-config for Vercel:

1. Push to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repo → Deploy.
   Framework preset "Next.js" is auto-detected.

Or from the CLI: `npx vercel`.

### PIN lock

Set `ACCESS_PIN` (a 4-digit code) in Vercel → Project → Settings →
Environment Variables to require a PIN before anyone can see the app.
Entry is masked, the cookie stores only a salted hash, and failed attempts
are rate-limited by a flat delay. When the variable is unset the gate is
disabled — so local dev and fresh deploys never lock you out.

## Disclaimer

Sanctum is an analysis tool, not investment advice. Bundled fundamentals are
approximations; simulations are models with thinner tails than real markets.
