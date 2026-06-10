# HLEE — Holdings, Liquidity & Equity Evaluation

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

- **Your positions** come only from the CSV you import. They never leave the
  browser.
- **Fundamentals** (growth, valuation, analyst targets, insider activity,
  betas, volatilities, sector/region mixes) are a **bundled point-in-time
  snapshot** in `lib/data/fundamentals.ts` (~90 tickers + major ETFs with
  sector look-through), with the snapshot date shown in the UI. They are
  deliberately editable approximations — refresh or extend them there.
- **Derived analytics** (correlations, portfolio volatility, scenarios,
  Monte Carlo) are model estimates built from that snapshot: a single-market-
  factor correlation model with sector/industry affinity, CAPM expected
  returns, and GBM simulation. Methodology notes live next to the math in
  `lib/analytics/*`.
- Unknown tickers degrade gracefully: they keep full allocation/P&L math and
  use conservative defaults (β = 1.0, σ = 32%) in risk calculations, flagged
  in the UI.

Want live data later? Everything reads through `getFundamentals()` — swap in
a fetch against your provider of choice (FMP, Finnhub, Polygon…) and the rest
of the app follows.

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
   Framework preset "Next.js" is auto-detected; no env vars needed.

Or from the CLI: `npx vercel`.

## Disclaimer

HLEE is an analysis tool, not investment advice. Bundled fundamentals are
approximations; simulations are models with thinner tails than real markets.
