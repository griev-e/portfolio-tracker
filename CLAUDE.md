# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

grieve is a dark, institutional-grade personal portfolio
analytics terminal. You import holdings as CSV and it computes allocation,
risk, research, quality, factor, scenario, correlation, and Monte Carlo
analysis. There are no accounts and no database: the portfolio lives in the
browser's `localStorage`, almost all analytics run client-side, and the only
server code is a thin set of caching proxies to external data providers.

Stack: Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4
· Framer Motion. All charts are hand-built SVG — **no chart library**.

## Commands

```bash
npm run dev        # dev server → http://localhost:3000
npm run build      # production build
npm run start      # serve the production build
npm run lint       # next lint (ESLint)
npm run typecheck  # tsc --noEmit — strict type check, run this after edits
npm test           # vitest run — the analytics unit suite
npm run test:watch # vitest in watch mode
```

After edits, verify with `npm run typecheck` and `npm run lint`; run `npm test`
when you touch anything under `lib/analytics`, `lib/csv.ts`, or `lib/data`.
Tests live next to the code as `*.test.ts` (Vitest, `node` environment — see
`vitest.config.ts`); shared fixtures are in `lib/__tests__/factory.ts`. The
suite covers the pure analytics (risk, correlation, quality, scenarios, Monte
Carlo, the regime engine and its `mathx` helpers, CSV parsing, fundamentals).

### Environment variables (both optional, see `.env.example`)

- `ACCESS_PIN` — a 4-digit code that gates the whole app via `middleware.ts`.
  When unset, the app is open (so local dev never locks you out). The auth
  cookie stores a SHA-256 hash of the PIN with a fixed application prefix
  (`SHA-256("grieve:" + pin)`), never the PIN itself. The gate is meant to keep
  casual visitors out, not to be hardened auth.
- `ANTHROPIC_API_KEY` — enables the AI daily brief on the Intelligence page.
  When unset, the brief section degrades gracefully and everything else works.

## Architecture

### The data-layering model (read this first)

Every fundamental and price value flows through a three-tier fallback. Understand
this before touching anything in `lib/analytics` or `lib/live`:

1. **Your positions** — the imported CSV is the source of truth for *shares and
   cost basis*. Persisted in `localStorage`, never sent anywhere.
2. **Live quotes / fundamentals** — Yahoo Finance (unofficial, keyless) via
   `yahoo-finance2`, proxied through `/api/quotes` and `/api/fundamentals`.
   Live values overlay the snapshot field-by-field where the provider returns
   them.
3. **Bundled snapshot** — `lib/data/fundamentals.ts` (~90 tickers + major ETFs)
   is the offline fallback and fills any field the provider didn't return
   (ROIC, FCF growth, region mixes, per-name volatility).

When the live feed fails, the app silently falls back down the tiers (amber
status dot in the sidebar). Unknown tickers degrade gracefully: with live data
they're promoted to full coverage via `mergeFundamentals`/`fromPatch` in
`lib/live/merge.ts`; without it they keep allocation/P&L math on conservative
defaults (β = 1.0, σ derived from beta).

### Client state flow

`app/layout.tsx` wraps everything in `PortfolioProvider` → `AppShell`.

- **`lib/store.tsx`** (`usePortfolio`) is the single source of truth for the
  portfolio. It reads/writes `localStorage` (key `grieve.portfolio.v1`,
  migrates legacy keys), drives `useLiveData`, and memoizes the enriched
  `Portfolio` via `buildPortfolio`.
- **`lib/analytics/build.ts`** (`buildPortfolio`) is the central enrichment
  step: it reprices holdings from live quotes, computes weights / cost basis /
  P&L / day-change, and merges fundamentals onto each position. **Most pages
  consume the `Portfolio` it produces** — changes here ripple everywhere.
- **`lib/live/useLiveData.ts`** polls `/api/quotes` every 60s (only while the
  tab is visible), fetches the fundamentals overlay once per symbol set, and
  exposes a `refresh()` that punches through every cache layer. Symbols are
  sorted into a stable key to keep the CDN cache hot.
- **`lib/research/useResearch.ts`** (`useResearch`) backs the Research terminal:
  given a single symbol it polls `/api/quotes`, fetches the fundamentals patch,
  and merges them onto the bundled snapshot via `lib/live/merge.ts` — the same
  three-tier fallback as the main portfolio, scoped to one ticker.

### Server routes (`app/api/*`) — all thin cached proxies

Each route handler sanitizes input, calls a `lib/server/*` module, and sets
`Cache-Control` for CDN caching. `lib/server/*` modules also keep module-scope
Maps as a warm-lambda cache. Provider code (`yahoo-finance2`, Anthropic SDK) is
**only ever imported from `lib/server/*`** — it must never ship to the browser.

| Route | Backed by | Notes |
| --- | --- | --- |
| `/api/quotes` | `lib/server/yahoo.ts` | Live prices, 60s CDN cache, `?fresh=1` bypasses caches. Extended-hours aware. |
| `/api/fundamentals` | `lib/server/yahoo.ts` | Fundamentals patch, 12h cache. |
| `/api/history` | `lib/server/yahoo.ts` | Adjusted-close price history for one symbol (`?symbol=&range=1m\|6m\|1y\|5y`), 10min cache. Powers the Research price chart. |
| `/api/search` | `lib/server/yahoo.ts` | Ticker / company lookup for the Research terminal, 6h cache. Failures return an empty list, never a 5xx. |
| `/api/market` | `lib/server/marketData.ts` | Market regime report (see below), 5min cache. |
| `/api/news` | `lib/server/news.ts` | Headlines for the Intelligence page. |
| `/api/dividends` | `lib/server/dividends.ts` | Dividend history/projection. |
| `/api/brief` | `lib/server/brief.ts` | AI daily brief (Anthropic). POSTs the in-browser portfolio snapshot since holdings never persist server-side. Caches one brief per day per portfolio shape. |
| `/api/allocate` | `lib/server/allocator.ts` | AI dry-powder allocator for the Rebalance page (Anthropic). POSTs a fundamentals-enriched snapshot; returns a structured cash-deployment plan. Caches one plan per day per portfolio shape. |
| `/api/auth` | `lib/server/rateLimit.ts` | Validates the PIN, sets the auth cookie. A fixed-window limiter throttles brute force (locks a client after a handful of wrong PINs). |

`middleware.ts` enforces the PIN gate: pages redirect to `/lock`, APIs return
401, and `/api/auth` is always allowed through.

### Analytics modules (`lib/analytics/*`)

All pure, client-side, model-based estimates. Methodology notes live next to the
math. Key pieces: `risk.ts`, `correlation.ts` (single-market-factor model with
sector affinity), `quality.ts` (weighted scorecard vs S&P 500; multiples use
weighted harmonic mean), `factors.ts`, `scenarios.ts`, `montecarlo.ts` (seeded
GBM — deterministic per portfolio), `rebalance.ts`, `dividends/`.

**The market regime engine (`lib/analytics/regime/`)** is the most involved
subsystem. It turns ~23 daily index series into 8 analytical layers
(`layers/`) → a composite regime score, confidence, health, and drivers. Its
defining principle: **no hand-tuned signal thresholds or layer weights**. Every
signal is ranked against its own trailing-year distribution (percentiles, not
fixed thresholds), and each layer's weight is *earned* from its data coverage,
internal agreement, and month-long stability (`engine.ts`). The aggregation and
labelling layer on top does use structural constants (a confidence exponent,
coherence/stability multipliers, a sign deadband, and the regime-label /
driver cutoffs). To add a signal layer, implement a
`LayerSpec` and register it in `layers/index.ts` — weighting, consensus,
confidence, and UI all adapt automatically.

### Pages & components

- `app/*/page.tsx` — one route per nav item. The nav list is defined in
  `components/shell/AppShell.tsx` (`NAV` array, grouped under **Portfolio** /
  **Analysis** / **Simulation** / **Data**) — add routes there. Current items:
  Overview (`/`), Intelligence, Risk, Research, Dividends, Rebalance; Market
  Analysis, Quality, Benchmark & Factors, Correlation; Scenarios, Monte Carlo;
  Export Report (`/report`), Import & Data (`/import`), Patch Notes.
- **`/report`** renders a print-optimized, full-portfolio dossier and exports it
  via the browser's native `window.print()` (→ Save as PDF). Toolbar/nav chrome
  is hidden with `no-print` classes — there is no PDF library. It recomputes
  every analytics report (risk, quality, factors, correlation, dividends,
  regime) inline against the live `Portfolio`.
- **Patch Notes** (`/patch-notes`) renders `lib/data/patchNotes.ts` (`PATCH_NOTES`,
  newest first). Add an entry there whenever a notable change ships.
- `lib/data/benchmarks.ts` holds the S&P 500 / NASDAQ-100 (`SPX`, `NDX`)
  reference profiles the Quality and Report pages score holdings against.
- `components/charts/*` — hand-built SVG visualizations (Treemap, Donut, Radar,
  Heatmap, FanChart, Histogram, Scatter, Sparkline, PriceChart).
- `components/ui/*` — reusable primitives (Card, Gauge, Ring, Stat, Meter,
  AnimatedNumber, Delta, EmptyState, ErrorBoundary, PageHeader, Computing,
  TickerLogo, etc.).
- `lib/useAsyncCompute.ts` — runs expensive synchronous analytics off the
  critical render path (paints UI first, computes on the next tick, keeps the
  previous value so charts don't unmount). Use this for heavy page-level
  computations rather than computing inline. **Monte Carlo** goes one step
  further: `lib/analytics/useMonteCarlo.ts` runs the sim in a Web Worker
  (`montecarlo.worker.ts`) to keep the main thread free, falling back to
  synchronous compute when Workers are unavailable.

## Conventions

- **Path alias:** `@/*` maps to the repo root (e.g. `@/lib/store`).
- **Provider isolation:** never import `yahoo-finance2` or `@anthropic-ai/sdk`
  outside `lib/server/*`. Client code talks to them only through `/api/*`.
- **Client vs server:** files needing browser APIs / hooks start with
  `"use client"`. Route handlers and `lib/server/*` are server-only.
- **CSV import** (`lib/csv.ts`) is intentionally forgiving: any column order,
  `$`/`,`/`%` formatting, parenthesized negatives, quoted names, duplicate-lot
  merging, `totalReturn` auto-detected as $ or %. A `CASH`/`USD` row sets the
  cash position. Sample at `public/sample-portfolio.csv`.
- **Graceful degradation is a hard requirement**, not a nicety: the app must
  stay fully usable on imported prices + the bundled snapshot when every
  external provider is down. Preserve fallback paths when editing live/server
  code.
- **No chart libraries** — extend the SVG components in `components/charts/`.
- The AI brief uses Claude Haiku 4.5 (`claude-haiku-4-5`, `lib/server/brief.ts`)
  — the JSON schema does the heavy lifting, so the fastest/cheapest current model
  fits, with thinking disabled for cost control. The dry-powder allocator
  (`lib/server/allocator.ts`) instead uses Opus 4.8 (`claude-opus-4-8`) with
  adaptive thinking: allocation is a genuine reasoning task (concentration,
  valuation, quality, diversification), so it earns the most capable model. Use
  the latest Claude models when adding AI features; pick the tier the task needs.
- Analytics are **models, not advice** — keep methodology copy honest and
  surfaced (the regime engine, scenarios, and Monte Carlo all expose their
  assumptions in the UI).

## Deployment

Zero-config for Vercel (Next.js preset auto-detected). Push to GitHub → import
at vercel.com/new, or `npx vercel`. Set `ACCESS_PIN` and `ANTHROPIC_API_KEY` in
project env vars as desired.
