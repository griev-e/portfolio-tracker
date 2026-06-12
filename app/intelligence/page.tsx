"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader } from "@/components/ui/Card";
import { Computing } from "@/components/ui/Computing";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TickerLogo } from "@/components/ui/TickerLogo";
import { PALETTE } from "@/components/charts/Donut";
import { describeRule } from "@/lib/alerts/engine";
import { useAlerts } from "@/lib/alerts/store";
import type { AlertMetric, AlertRule } from "@/lib/alerts/types";
import type {
  BriefRequest,
  BriefResponse,
  NewsItem,
  NewsResponse,
} from "@/lib/intelligence/types";
import { daysUntil, fmtDate, fmtPct, relativeTime } from "@/lib/format";
import { usePortfolio } from "@/lib/store";
import type { Portfolio } from "@/lib/types";

/** Stable per-symbol accent so colors survive re-sorting. */
function symbolColor(symbol: string): string {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/* ---------------------------------- brief --------------------------------- */

function buildBriefRequest(portfolio: Portfolio): BriefRequest {
  const positions = [...portfolio.positions]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 25)
    .map((p) => ({
      symbol: p.symbol,
      name: p.name,
      weight: +p.weight.toFixed(4),
      dayChangePct:
        p.prevClose && p.prevClose > 0 ? +(p.price / p.prevClose - 1).toFixed(4) : null,
      returnPct: +p.returnPct.toFixed(4),
      sector: p.fundamentals?.sector ?? null,
      earningsDate: p.fundamentals?.earningsDate ?? null,
    }));
  return {
    portfolio: {
      totalValue: portfolio.totalValue,
      dayChangePct: portfolio.dayChangePct,
      totalReturnPct: portfolio.totalReturnPct,
      cashWeight: +portfolio.cashWeight.toFixed(4),
      positions,
    },
  };
}

type BriefState =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: BriefResponse };

function useBrief(portfolio: Portfolio | null) {
  const [state, setState] = useState<BriefState>({ kind: "loading" });
  // One request per day + portfolio shape — quote ticks shouldn't re-bill.
  const fingerprint = useMemo(() => {
    if (!portfolio) return null;
    const shape = portfolio.positions
      .map((p) => `${p.symbol}:${p.weight.toFixed(3)}`)
      .sort()
      .join(",");
    return `${new Date().toISOString().slice(0, 10)}|${shape}`;
  }, [portfolio]);
  const requestedRef = useRef<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!portfolio || !fingerprint) return;
      if (!force && requestedRef.current === fingerprint) return;
      requestedRef.current = fingerprint;
      setState({ kind: "loading" });
      try {
        const res = await fetch("/api/brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBriefRequest(portfolio)),
        });
        if (res.status === 401) {
          window.location.replace("/lock");
          return;
        }
        if (res.status === 501) {
          setState({ kind: "disabled" });
          return;
        }
        if (res.status === 429) {
          setState({
            kind: "error",
            message: "Brief provider is rate limited — try again shortly.",
          });
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        setState({ kind: "ready", data: (await res.json()) as BriefResponse });
      } catch {
        setState({ kind: "error", message: "Brief provider unreachable." });
      }
    },
    [portfolio, fingerprint]
  );

  useEffect(() => {
    load();
  }, [load]);

  return { state, retry: () => load(true) };
}

function BriefCard({ portfolio }: { portfolio: Portfolio }) {
  const { state, retry } = useBrief(portfolio);

  if (state.kind === "disabled") {
    return (
      <Card className="mb-5 px-6 py-4" i={0} hover={false}>
        <div className="flex items-center gap-3 text-[12.5px] text-faint">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
          AI brief is off — set{" "}
          <code className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px]">
            ANTHROPIC_API_KEY
          </code>{" "}
          to enable a daily portfolio brief.
        </div>
      </Card>
    );
  }

  return (
    <Card className="relative mb-5 px-6 py-5 sm:px-8" i={0} hover={false}>
      <CardHeader
        eyebrow="Daily brief"
        title="The morning read on your book"
        right={
          state.kind === "ready" ? (
            <span className="font-mono text-[10px] text-faint">
              {state.data.cached ? "cached · " : ""}
              {relativeTime(state.data.generatedAt)}
            </span>
          ) : undefined
        }
        className="mb-4"
      />

      {state.kind === "loading" && (
        <div className="relative h-[180px]">
          <Computing active label="writing the morning brief…" />
        </div>
      )}

      {state.kind === "error" && (
        <div className="flex h-[120px] flex-col items-center justify-center gap-3 text-center">
          <div className="text-[13px] text-mute">{state.message}</div>
          <button onClick={retry} className="btn-secondary">
            Retry
          </button>
        </div>
      )}

      {state.kind === "ready" && (
        <div>
          <h3 className="font-display text-[17px] font-semibold leading-snug text-ink">
            {state.data.brief.headline}
          </h3>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-mute">
            {state.data.brief.summary}
          </p>

          <div className="mt-5 grid gap-x-10 gap-y-5 lg:grid-cols-2">
            {state.data.brief.movers.length > 0 && (
              <div>
                <div className="eyebrow mb-2">movers</div>
                <ul className="space-y-2.5">
                  {state.data.brief.movers.map((m) => (
                    <li key={m.symbol} className="flex items-start gap-2.5">
                      <TickerLogo
                        symbol={m.symbol}
                        accent={symbolColor(m.symbol)}
                        size={20}
                      />
                      <span className="text-[12.5px] leading-snug text-mute">
                        <span className="font-mono font-medium text-ink">
                          {m.symbol}
                        </span>{" "}
                        — {m.comment}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-5">
              {state.data.brief.watchItems.length > 0 && (
                <div>
                  <div className="eyebrow mb-2">on watch</div>
                  <ul className="space-y-2">
                    {state.data.brief.watchItems.map((w) => (
                      <li
                        key={w}
                        className="flex items-start gap-2.5 text-[12.5px] leading-snug text-mute"
                      >
                        <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky/70" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <div className="eyebrow mb-2">risk note</div>
                <p className="text-[12.5px] leading-snug text-mute">
                  {state.data.brief.risk}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------- earnings -------------------------------- */

function EarningsCard({ portfolio }: { portfolio: Portfolio }) {
  const upcoming = useMemo(
    () =>
      portfolio.positions
        .flatMap((p) => {
          const date = p.fundamentals?.earningsDate;
          if (!date) return [];
          const days = daysUntil(date);
          if (days === null || days < 0 || days > 60) return [];
          return [{ position: p, date, days }];
        })
        .sort((a, b) => a.days - b.days),
    [portfolio]
  );

  const maxWeight = Math.max(...upcoming.map((u) => u.position.weight), 0.01);

  return (
    <Card className="px-6 py-5" i={1}>
      <CardHeader
        eyebrow="Earnings calendar"
        title="Reports in the next 60 days"
        right={
          <span className="font-mono text-[10px] text-faint">
            {upcoming.length} scheduled
          </span>
        }
        className="mb-4"
      />
      {upcoming.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-faint">
          No earnings dates in the next 60 days.
        </p>
      ) : (
        <div className="space-y-1">
          {upcoming.map(({ position: p, date, days }, i) => (
            <motion.div
              key={p.symbol}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.04 }}
              className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/[0.02]"
            >
              <TickerLogo symbol={p.symbol} accent={symbolColor(p.symbol)} size={26} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[12.5px] font-medium text-ink">
                    {p.symbol}
                  </span>
                  <span className="truncate text-[11.5px] text-faint">{p.name}</span>
                </div>
                <div className="mt-1 h-[3px] w-full max-w-[140px] overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full bg-vio/60"
                    style={{ width: `${(p.weight / maxWeight) * 100}%` }}
                  />
                </div>
              </div>
              <span className="hidden font-mono tnum text-[11px] text-faint sm:block">
                {fmtPct(p.weight, 1)} of book
              </span>
              <span className="w-[88px] text-right text-[12px] text-mute">
                {fmtDate(date)}
              </span>
              <span
                className={`w-[60px] rounded border px-1.5 py-0.5 text-center font-mono text-[10px] ${
                  days <= 7
                    ? "border-warn/30 bg-warn/10 text-warn"
                    : "border-edge bg-white/[0.03] text-mute"
                }`}
              >
                {days === 0 ? "today" : `in ${days}d`}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------- news ---------------------------------- */

function useNews(symbols: string[]) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = symbols.join(",");

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/news?symbols=${key}`);
      if (res.status === 401) {
        window.location.replace("/lock");
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as NewsResponse;
      setItems(json.items);
    } catch {
      setError("News provider unreachable.");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, error, loading, refresh: load };
}

function NewsCard({ symbols }: { symbols: string[] }) {
  const { items, error, loading, refresh } = useNews(symbols);
  const [filter, setFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const withNews = useMemo(
    () =>
      items
        ? [...new Set(items.map((n) => n.symbol))].sort()
        : [],
    [items]
  );

  const visible = useMemo(() => {
    if (!items) return [];
    const filtered = filter
      ? items.filter(
          (n) => n.symbol === filter || n.relatedTickers.includes(filter)
        )
      : items;
    return expanded ? filtered : filtered.slice(0, 12);
  }, [items, filter, expanded]);

  return (
    <Card className="relative px-6 py-5" i={2}>
      <CardHeader
        eyebrow="Holdings news"
        title="What's being written about your names"
        className="mb-3"
      />

      {items && withNews.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {[null, ...withNews].map((s) => (
            <button
              key={s ?? "all"}
              onClick={() => setFilter(s)}
              className={`rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors ${
                filter === s
                  ? "bg-white/[0.08] text-ink"
                  : "text-mute hover:bg-white/[0.04] hover:text-ink"
              }`}
            >
              {s ?? "All"}
            </button>
          ))}
        </div>
      )}

      {loading && !items && (
        <div className="relative h-[200px]">
          <Computing active label="pulling headlines…" />
        </div>
      )}

      {!loading && error && !items && (
        <div className="flex h-[160px] flex-col items-center justify-center gap-3">
          <div className="text-[13px] text-mute">{error}</div>
          <button onClick={refresh} className="btn-secondary">
            Retry
          </button>
        </div>
      )}

      {items && items.length === 0 && (
        <p className="py-6 text-center text-[12.5px] text-faint">
          No recent headlines for these holdings.
        </p>
      )}

      {items && visible.length > 0 && (
        <div className="space-y-1">
          {visible.map((n, i) => (
            <motion.a
              key={n.id}
              href={n.link}
              target="_blank"
              rel="noreferrer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(i * 0.03, 0.4) }}
              className="group flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-white/[0.03]"
            >
              <TickerLogo symbol={n.symbol} accent={symbolColor(n.symbol)} size={24} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] leading-snug text-mute transition-colors group-hover:text-ink">
                  {n.title}
                </div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-faint">
                  <span className="text-ink/70">{n.symbol}</span>
                  {n.publisher && <span>{n.publisher}</span>}
                  <span>{relativeTime(n.publishedAt)}</span>
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      )}

      {items &&
        !expanded &&
        (filter
          ? items.filter(
              (n) => n.symbol === filter || n.relatedTickers.includes(filter)
            ).length
          : items.length) > 12 && (
          <button
            onClick={() => setExpanded(true)}
            className="mt-3 w-full rounded-md border border-edge py-2 text-[11.5px] text-mute transition-colors hover:bg-white/[0.03] hover:text-ink"
          >
            Show more
          </button>
        )}
    </Card>
  );
}

/* --------------------------------- alerts --------------------------------- */

const METRIC_OPTIONS: { value: AlertMetric; label: string; unit: "$" | "%" }[] = [
  { value: "price", label: "Price", unit: "$" },
  { value: "dayChangePct", label: "Day move", unit: "%" },
  { value: "returnPct", label: "Total return", unit: "%" },
  { value: "portfolioDayChangePct", label: "Portfolio day move", unit: "%" },
];

const inputCls =
  "h-8 rounded-md border border-edge bg-white/[0.03] px-2.5 text-[12.5px] text-ink outline-none transition-colors focus:border-edge2";

function AlertsCard({ symbols }: { symbols: string[] }) {
  const { rules, events, addRule, updateRule, deleteRule } = useAlerts();

  const [metric, setMetric] = useState<AlertMetric>("price");
  const [symbol, setSymbol] = useState(symbols[0] ?? "");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("");
  const [mode, setMode] = useState<AlertRule["mode"]>("once");

  const unit = METRIC_OPTIONS.find((m) => m.value === metric)?.unit ?? "$";
  const needsSymbol = metric !== "portfolioDayChangePct";

  const submit = () => {
    const raw = Number(threshold);
    if (!Number.isFinite(raw)) return;
    if (needsSymbol && !symbol) return;
    addRule({
      metric,
      symbol: needsSymbol ? symbol : null,
      direction,
      threshold: unit === "%" ? raw / 100 : raw,
      mode,
    });
    setThreshold("");
  };

  return (
    <Card className="px-6 py-5" i={3}>
      <CardHeader
        eyebrow="Watch conditions"
        title="Alert when the book crosses a line"
        className="mb-4"
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(260px,340px)_1fr]">
        {/* Composer */}
        <div>
          <div className="grid gap-2.5">
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as AlertMetric)}
              className={inputCls}
            >
              {METRIC_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            {needsSymbol && (
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className={inputCls}
              >
                {symbols.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}

            <div className="flex gap-2.5">
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as "above" | "below")}
                className={`${inputCls} flex-1`}
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
              <div className="relative flex-1">
                <input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder={unit === "$" ? "180.00" : "5"}
                  className={`${inputCls} w-full pr-7`}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-faint">
                  {unit}
                </span>
              </div>
            </div>

            <div className="flex gap-1.5">
              {(["once", "rearm"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[11.5px] transition-colors ${
                    mode === m
                      ? "border-edge2 bg-white/[0.07] text-ink"
                      : "border-edge text-mute hover:text-ink"
                  }`}
                >
                  {m === "once" ? "Fire once" : "Re-arming"}
                </button>
              ))}
            </div>

            <button
              onClick={submit}
              disabled={!Number.isFinite(Number(threshold)) || threshold === ""}
              className="btn-primary disabled:pointer-events-none disabled:opacity-40"
            >
              Add alert
            </button>
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
            Conditions are checked against live quotes while a tab is open —
            roughly every minute during market hours.
          </p>
        </div>

        {/* Rules + recent events */}
        <div className="min-w-0">
          {rules.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-faint">
              No watch conditions yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-md border border-edge/60 px-3 py-2"
                >
                  <button
                    onClick={() => updateRule(r.id, { enabled: !r.enabled, armed: true })}
                    title={r.enabled ? "Disable" : "Enable"}
                    aria-label={r.enabled ? "Disable alert" : "Enable alert"}
                    className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                      r.enabled ? "bg-mint/50" : "bg-white/[0.08]"
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] h-3 w-3 rounded-full bg-white transition-all ${
                        r.enabled ? "left-[14px]" : "left-[2px]"
                      }`}
                    />
                  </button>
                  <span
                    className={`min-w-0 flex-1 truncate text-[12.5px] ${
                      r.enabled ? "text-mute" : "text-faint line-through"
                    }`}
                  >
                    {describeRule(r)}
                  </span>
                  {r.lastTriggeredAt && (
                    <span className="hidden shrink-0 rounded border border-warn/30 bg-warn/10 px-1.5 py-0.5 font-mono text-[9.5px] text-warn sm:block">
                      fired {relativeTime(r.lastTriggeredAt)}
                    </span>
                  )}
                  <span className="hidden shrink-0 font-mono text-[9.5px] uppercase text-faint sm:block">
                    {r.mode === "once" ? "once" : "re-arm"}
                  </span>
                  <button
                    onClick={() => deleteRule(r.id)}
                    aria-label="Delete alert"
                    className="shrink-0 text-faint transition-colors hover:text-neg"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {events.length > 0 && (
            <>
              <div className="eyebrow mb-2 mt-6">recent triggers</div>
              <ul className="space-y-2">
                {events.slice(0, 6).map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start gap-2.5 text-[12px] leading-snug text-mute"
                  >
                    <span className="mt-[4px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn/70" />
                    <span className="min-w-0 flex-1">{e.message}</span>
                    <span className="shrink-0 font-mono text-[10px] text-faint">
                      {relativeTime(e.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function IntelligencePage() {
  const { ready, portfolio } = usePortfolio();

  const symbols = useMemo(
    () =>
      portfolio
        ? [...new Set(portfolio.positions.map((p) => p.symbol))].sort()
        : [],
    [portfolio]
  );

  if (!ready) return null;
  if (!portfolio) return <EmptyState page="Intelligence" />;

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Intelligence"
        description="The proactive layer — a daily AI brief on your book, headlines for every holding, upcoming earnings, and watch conditions that ring the bell when something crosses a line."
      />

      <BriefCard portfolio={portfolio} />

      <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <EarningsCard portfolio={portfolio} />
        <NewsCard symbols={symbols} />
      </div>

      <AlertsCard symbols={symbols} />
    </div>
  );
}
