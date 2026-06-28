# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

alpha is a dark, institutional-grade personal portfolio
analytics terminal. You import holdings as CSV and it computes allocation,
risk, research, quality, factor, scenario, correlation, and Monte Carlo
analysis. By default there are no accounts and no database: the portfolio lives
in the browser's `localStorage`, almost all analytics run client-side, and the
only server code is a thin set of caching proxies to external data providers.
Accounts are an **optional** layer (see "Accounts & persistence" below): set
`AUTH_SECRET` + `DATABASE_URL` and each person signs in to their own saved
portfolio and theta ledger; leave them unset and the app behaves exactly as the
single-user, localStorage tool it has always been.

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
npm run refresh:snapshot  # regenerate lib/data/fundamentals.ts from live providers
```

After edits, verify with `npm run typecheck` and `npm run lint`; run `npm test`
when you touch anything under `lib/analytics`, `lib/csv.ts`, or `lib/data`.
Tests live next to the code as `*.test.ts` (Vitest, `node` environment — see
`vitest.config.ts`); shared fixtures are in `lib/__tests__/factory.ts`. The
suite covers the pure analytics (risk, correlation, quality, scenarios, Monte
Carlo, the regime engine and its `mathx` helpers, CSV parsing, fundamentals).

### Environment variables (all optional, see `.env.example`)

- `AUTH_SECRET` + `DATABASE_URL` — turn on **accounts** (see "Accounts &
  persistence" below). Both must be set; when either is unset the app is open
  and single-user (localStorage), so local dev never locks you out. `AUTH_SECRET`
  signs the NextAuth JWT session; `DATABASE_URL` is a standard Postgres
  connection string (Neon, Supabase, Vercel Postgres — any provider works, via
  the `postgres-js` driver). There is no public sign-up — provision logins with
  `npm run create-user`. (This replaces the old `ACCESS_PIN` PIN gate.)
- `ANTHROPIC_API_KEY` — enables the AI daily brief on the Intelligence page.
  When unset, the brief section degrades gracefully and everything else works.
- `FMP_API_KEY` — optional Financial Modeling Prep key. When set, fundamentals
  are enriched with FMP's ROIC, FCF growth and revenue-by-region mix (the fields
  Yahoo's keyless feed can't cleanly provide). When unset, the app runs on Yahoo
  alone — see `lib/server/fmp.ts`. Mind the free tier's 250-requests/day budget;
  enrichment is per-symbol and 12h-cached.

## Architecture

### The data-layering model (read this first)

Every fundamental and price value flows through a three-tier fallback. Understand
this before touching anything in `lib/analytics` or `lib/live`:

1. **Your positions** — the imported CSV is the source of truth for *shares and
   cost basis*. Persisted in `localStorage`, never sent anywhere.
2. **Live quotes / fundamentals** — Yahoo Finance (unofficial, keyless) via
   `yahoo-finance2`, proxied through `/api/quotes` and `/api/fundamentals`.
   Live values overlay the snapshot field-by-field where the provider returns
   them. The `/api/fundamentals` orchestrator (`lib/server/fundamentals.ts`)
   also derives **realized volatility** from price history and **ROIC / FCF
   growth** from Yahoo's statement modules, and — when `FMP_API_KEY` is set —
   overrides ROIC, FCF growth and **region mix** with FMP's cleaner values.
3. **Bundled snapshot** — `lib/data/fundamentals.ts` (~90 tickers + major ETFs)
   is the offline fallback and fills any field the providers didn't return.
   Historically the only source for ROIC, FCF growth, region mixes and per-name
   volatility; those are now fetched/derived live (tier 2) where available, with
   the snapshot as backstop. It's kept fresh by a scheduled job
   (`scripts/refresh-snapshot.ts` → `.github/workflows/refresh-snapshot.yml`,
   monthly) that re-pulls live values and opens a PR with the drift — see below.

When the live feed fails, the app falls back down the tiers. **The fallback is
never silent**: `mergeFundamentals` records per-field provenance (live vs
fallback) and a `live/partial/fallback` coverage roll-up on each
`Fundamentals`, which `buildPortfolio` combines with the live-price flag into
`Position.dataSource`. The UI surfaces this (provenance dot per holding on
Overview, a coverage summary, a coverage-accurate Research badge) so a stale
snapshot value is never shown as if it were live. Unknown tickers degrade
gracefully: with live data they're promoted to full coverage via
`mergeFundamentals`/`fromPatch` in `lib/live/merge.ts`; without it they keep
allocation/P&L math on conservative defaults (β = 1.0, σ derived from beta).

**Capital-market assumptions** (`lib/data/benchmarks.ts` `CMA`) and benchmark
volatility are live too: the risk-free rate (13-week T-bill `^IRX`) and realized
S&P 500 / NASDAQ-100 volatility are fetched via `/api/cma` (`lib/server/cma.ts`,
6h-cached) and overlaid in `lib/live/cma.ts` (`getCMA`,
`liveBenchmarkVolatility`), with the static values as fallback. The equity risk
premium has no observable market quote, so it stays a fixed forward assumption.

**The snapshot refresh job** (`scripts/refresh-snapshot.ts`) pulls the live
patch for every `knownSymbols()` entry and overlays drifted values onto the
source via the pure, idempotent serializer in `scripts/snapshot/serialize.ts`
(numeric compare, textual replace only on real change → minimal diffs; curated
identity fields and missing keys are never touched). The workflow opens a PR for
review; it never commits to the snapshot directly.

### Client state flow

`app/layout.tsx` wraps everything in `PortfolioProvider` → `AppShell`.

- **`lib/store.tsx`** (`usePortfolio`) is the single source of truth for the
  portfolio. It reads/writes `localStorage` (key `alpha.portfolio.v1`,
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

### Accounts & persistence (optional)

Off by default. Set `AUTH_SECRET` + `DATABASE_URL` and the app gains real
username/password logins (NextAuth, Credentials provider, bcrypt) with each
user's data saved server-side. Unset either and everything below is bypassed —
the stores fall back to localStorage and the app is the open single-user tool it
has always been. **Preserve both paths when editing the stores, middleware, or
auth.**

- **One gate, both apps.** `middleware.ts` (edge, via the slim `auth.config.ts`)
  protects every route; `components/auth/AuthProvider.tsx` exposes `useAuth()`
  (`enabled` / `status` / `userId` / `name`) and only mounts NextAuth's
  `SessionProvider` when accounts are on. `auth.ts` (Node — bcrypt + DB) holds
  the full config; never import it from middleware or client code.
- **JSONB blob per user, not normalized tables.** The client owns all mutation
  and derivation (`buildPortfolio`, `deriveTheta`), so the DB just stores each
  app's existing shape opaquely: two tables (`users`, `user_state`) in
  `lib/db/schema.ts`, the lazy provider-agnostic Postgres client (via
  `postgres-js`) in `lib/db/index.ts`. Saving an alpha
  change never touches the theta blob (separate `PUT` endpoints). `user_state`
  also carries an optional `simplefin` column (theta's bank-sync access URL +
  last-sync time) that is read **only** by the `/api/theta/simplefin/*` routes
  and deliberately never selected by `getUserState`, so the credential can't
  ride along to the client.
- **The stores choose their backend.** `lib/store.tsx` and `lib/theta/store.tsx`
  branch on `useAuth()`: signed in → hydrate from `/api/state` and push edits
  back through `lib/persist.ts`; otherwise → localStorage as before. In server
  mode they read **only** the server (never the shared-browser cache), so one
  person's data can't leak to the next who signs in on the same machine.
- **No public sign-up.** Provision logins with `npm run create-user -- <user>
  <pass>`; create/update tables with `npm run db:push` (Drizzle Kit).

### Server routes (`app/api/*`) — all thin cached proxies

Each route handler sanitizes input, calls a `lib/server/*` module, and sets
`Cache-Control` for CDN caching. `lib/server/*` modules also keep module-scope
Maps as a warm-lambda cache. Provider code (`yahoo-finance2`, Anthropic SDK) is
**only ever imported from `lib/server/*`** — it must never ship to the browser.

| Route | Backed by | Notes |
| --- | --- | --- |
| `/api/quotes` | `lib/server/yahoo.ts` | Live prices, 60s CDN cache, `?fresh=1` bypasses caches. Extended-hours aware. |
| `/api/fundamentals` | `lib/server/fundamentals.ts` (Yahoo + optional FMP) | Fundamentals patch, 12h cache. Adds realized vol, ROIC, FCF growth, region mix. |
| `/api/history` | `lib/server/yahoo.ts` | Adjusted-close price history for one symbol (`?symbol=&range=1m\|6m\|1y\|5y`), 10min cache. Powers the Research price chart. |
| `/api/search` | `lib/server/yahoo.ts` | Ticker / company lookup for the Research terminal, 6h cache. Failures return an empty list, never a 5xx. |
| `/api/cma` | `lib/server/cma.ts` | Capital-market assumptions (risk-free rate, benchmark vols), 6h cache. Overlays live market data onto static forward assumptions. |
| `/api/market` | `lib/server/marketData.ts` | Market regime report (see below), 5min cache. |
| `/api/news` | `lib/server/news.ts` | Headlines for the Intelligence page. |
| `/api/dividends` | `lib/server/dividends.ts` | Dividend history/projection. |
| `/api/brief` | `lib/server/brief.ts` | AI daily brief (Anthropic). POSTs the in-browser portfolio snapshot since holdings never persist server-side. Caches one brief per day per portfolio shape. |
| `/api/allocate` | `lib/server/allocator.ts` | AI dry-powder allocator for the Rebalance page (Anthropic). POSTs a fundamentals-enriched snapshot; returns a structured cash-deployment plan. Caches one plan per day per portfolio shape. |
| `/api/optimize` | `lib/server/optimizer.ts` | AI optimizer review for the Optimizer page (Anthropic, Haiku 4.5). The optimal weights are solved client-side; this POSTs the before/after metrics + largest shifts and returns a structured construction read. Caches one review per day per objective + portfolio shape. |
| `/api/discover` | `lib/server/discover.ts` | AI stock-idea generator for the Discover page (Anthropic, Sonnet 4.6). POSTs the portfolio shape + chosen research lens; returns structured candidate ideas. |
| `/api/theta-brief` | `lib/server/thetaBrief.ts` | theta's AI daily brief, parallel to `/api/brief` but over the ledger snapshot instead of the portfolio. |
| `/api/auth/*` | `auth.ts` (NextAuth) | Session, sign-in/out, CSRF. The Credentials provider (username + password, bcrypt) authenticates against the `users` table; the fixed-window limiter in `lib/server/rateLimit.ts` throttles login brute force. Only meaningful when accounts are enabled. |
| `/api/state` | `lib/db/state.ts` (`lib/server/authState.ts` reads the session) | `GET` returns both saved blobs (alpha portfolio + theta ledger) for the signed-in user; `PUT /api/state/portfolio` and `PUT /api/state/ledger` upsert each independently. 404 when accounts are off, 401 when signed out. |
| `/api/theta/simplefin` | `lib/server/simplefin.ts` + `lib/db/state.ts` | theta's optional SimpleFIN bank sync (**accounts-only**). `POST /claim` exchanges a setup token for an access URL stored server-side; `POST /sync` pulls accounts+transactions and returns them already mapped to theta shapes (the pure `lib/theta/simplefin.ts`), the client merging by stable id via `applySimplefinSync`; `GET`/`DELETE` report/clear the link. The access URL holds bank credentials — it lives in the `user_state.simplefin` column, is read only by these routes, and **never** reaches the client (`getUserState` omits it). Same `requireUser` gate as `/api/state`. |

`middleware.ts` enforces the auth gate **when accounts are on**: pages redirect
to `/lock`, APIs return 401, and `/api/auth/*` + `/lock` are always allowed.
When accounts are off (no `AUTH_SECRET`/`DATABASE_URL`) it short-circuits to a
no-op and the app is fully open — the graceful-degradation default.

`lib/server/cost.ts` has the per-model $/Mtok pricing table and `usdCost()`,
which turns an Anthropic `usage` object into a USD estimate (cache writes at
1.25× input, cache reads at 0.1×). `brief.ts` and `optimizer.ts` surface this
as `costUSD` in their response so the UI can show what each AI call cost.
When adding a new Anthropic-backed model, add its pricing here too.

### Analytics modules (`lib/analytics/*`)

All pure, client-side, model-based estimates. Methodology notes live next to the
math. Key pieces: `risk.ts`, `correlation.ts` (single-market-factor model with
sector affinity), `quality.ts` (weighted scorecard vs S&P 500; multiples use
weighted harmonic mean), `factors.ts`, `scenarios.ts`, `montecarlo.ts` (seeded
GBM — deterministic per portfolio), `rebalance.ts`, `dividends/`. The
**optimizer** lives in `lib/optimizer/optimize.ts` — a deterministic constrained
solver (projected gradient ascent on a capped simplex, plus cyclical coordinate
descent for risk parity) over the same factor covariance and CAPM expected
returns, producing optimal weights, an efficient frontier, and a trade list for
eight objectives.

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
  Overview (`/`), Intelligence, Risk, Research, Dividends, Rebalance,
  Discover; Optimizer, Market Analysis, Quality, Benchmark & Factors,
  Correlation; Scenarios, Monte Carlo; Export Report (`/report`), Import &
  Data (`/import`), Patch Notes.
- **Discover** (`/discover`) is an AI stock-idea generator: pick one of six
  research lenses (diversify / growth / value / defensive / quality /
  thematic), POSTs the portfolio shape to `/api/discover`
  (`lib/server/discover.ts`, Claude Sonnet 4.6), and returns a structured list of
  candidate ideas with rationale. Types in `lib/discover/types.ts`.
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

### theta — the sister personal-finance app (`app/theta/*`)

theta is a separate personal-finance terminal living in the same Next.js app,
behind its own routes (`/theta`, `/theta/networth`, `/theta/intelligence`,
`/theta/accounts`, `/theta/transactions`, `/theta/cashflow`, `/theta/budgets`,
`/theta/goals`, `/theta/recurring`, `/theta/import`, `/theta/settings`). It
shares the project, the optional accounts/auth layer, and `components/ui/*`
with alpha, but otherwise has its own state, shell, and analytics:

- **State** — `lib/theta/store.tsx` (`ThetaProvider`/`useTheta`) mirrors
  `lib/store.tsx`'s pattern exactly: localStorage (key `theta.ledger.v1`,
  plus a `theta.isSample.v1` flag for the bundled sample ledger) by default,
  or server-backed via `lib/persist.ts` when accounts are enabled.
- **Domain types & derivation** — `lib/theta/data.ts` defines `Account`,
  `Transaction`, `Budget`, `Category`, `Goal`, `Recurring`, `Ledger`, plus
  `EMPTY_LEDGER`/`SAMPLE_LEDGER`. `lib/theta/compute.ts` (`deriveTheta`,
  `advanceRecurring`) is theta's analogue to `buildPortfolio` — the pure
  derivation layer most pages consume. `lib/theta/csv.ts` handles transaction
  CSV import; `lib/theta/categorize.ts` is the shared merchant→category
  inference (used by CSV import and bank sync when no category is given).
  `lib/theta/intelligence.ts` builds the `ThetaSnapshot`/`ThetaBrief` consumed
  by `/api/theta-brief`.
- **Bank sync (optional, accounts-only)** — `lib/theta/simplefin.ts` is the
  pure mapper from a SimpleFIN payload to theta `Account`/`Transaction` records
  (stable prefixed ids for dedup, account-kind inference, liability-sign
  normalization). It's driven by the `/api/theta/simplefin/*` routes over
  `lib/server/simplefin.ts`; the client merges results with `applySimplefinSync`
  in the store. See the route table above for the credential-isolation rule.
- **Shell & nav** — `components/shell/ThetaShell.tsx` (own icon set in
  `components/shell/thetaIcons.tsx`) replaces `AppShell` entirely for
  `/theta/*` routes: `AppShell.tsx` detects the `/theta` path prefix, wraps
  the tree in `ThetaProvider`, and renders `ThetaShell` instead of its own
  chrome. theta's nav groups Overview (Dashboard, Net Worth, Intelligence),
  Money (Accounts, Transactions, Cash Flow), Planning (Budgets, Goals,
  Recurring), System (Import & Data, Settings) — add new theta routes there,
  not to alpha's `NAV` array.
- **Components** — theta-only UI lives in `components/theta/*`
  (`EditableMoney.tsx`, `modals.tsx`, `bits.tsx`, `ui.tsx`); shared primitives
  still come from `components/ui/*`.
- `app/theta/layout.tsx` overrides the root metadata (title "theta", its own
  favicon at `app/theta/icon.svg`) so the two apps feel distinct even though
  they're one deployment.

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
  (`lib/server/allocator.ts`) and the Discover idea generator
  (`lib/server/discover.ts`) use Sonnet 4.6 (`claude-sonnet-4-6`) with adaptive
  thinking at `high` effort: allocation and idea generation are both genuine
  reasoning tasks (concentration, valuation, quality, diversification), so they
  earn the deepest reasoning pass. The optimizer review
  (`lib/server/optimizer.ts`) uses Haiku 4.5 (`claude-haiku-4-5`) with adaptive
  thinking at `low` effort — the optimal weights are already solved, so the
  model only reasons about a grounded result; the cheaper tier earns its keep.
  Use the latest Claude models when adding AI features; pick the tier the task
  needs.
- Analytics are **models, not advice** — keep methodology copy honest and
  surfaced (the regime engine, scenarios, and Monte Carlo all expose their
  assumptions in the UI).

## Deployment

Zero-config for Vercel (Next.js preset auto-detected). Push to GitHub → import
at vercel.com/new, or `npx vercel`. Set `ANTHROPIC_API_KEY` as desired; to enable
accounts set `AUTH_SECRET` + `DATABASE_URL` (any Postgres database — Neon,
Supabase, Vercel Postgres), then run `npm run db:push` and `npm run create-user`
against that database.
