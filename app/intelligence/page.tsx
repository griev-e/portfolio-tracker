"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader } from "@/components/ui/Card";
import { Computing } from "@/components/ui/Computing";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TickerLogo } from "@/components/ui/TickerLogo";
import { PALETTE } from "@/components/charts/Donut";
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
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: BriefResponse };

function useBrief(portfolio: Portfolio | null) {
  // Generation is now user-triggered — no auto-fetch on mount.
  const [state, setState] = useState<BriefState>({ kind: "idle" });

  const load = useCallback(async () => {
    if (!portfolio) return;
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
  }, [portfolio]);

  return { state, generate: load };
}

function BriefCard({ portfolio }: { portfolio: Portfolio }) {
  const { state, generate } = useBrief(portfolio);

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
        eyebrow="Daily Brief"
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

      {state.kind === "idle" && (
        <div className="flex h-[150px] flex-col items-center justify-center gap-3 text-center">
          <p className="max-w-sm text-[12.5px] leading-relaxed text-faint">
            Generate an AI-written desk note on today&apos;s book — movers,
            themes, positioning, and a risk read.
          </p>
          <button onClick={generate} className="btn-primary">
            Generate daily brief
          </button>
        </div>
      )}

      {state.kind === "loading" && (
        <div className="relative h-[180px]">
          <Computing active label="writing the morning brief…" />
        </div>
      )}

      {state.kind === "error" && (
        <div className="flex h-[120px] flex-col items-center justify-center gap-3 text-center">
          <div className="text-[13px] text-mute">{state.message}</div>
          <button onClick={generate} className="btn-secondary">
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

          {state.data.brief.positioning && (
            <div className="mt-4 border-l-2 border-edge2 pl-4">
              <div className="eyebrow mb-1.5">positioning</div>
              <p className="max-w-3xl text-[12.5px] leading-relaxed text-mute">
                {state.data.brief.positioning}
              </p>
            </div>
          )}

          {state.data.brief.themes?.length > 0 && (
            <div className="mt-5">
              <div className="eyebrow mb-2.5">themes</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {state.data.brief.themes.map((t) => (
                  <div
                    key={t.title}
                    className="rounded-lg border border-edge bg-void/40 px-3.5 py-3"
                  >
                    <div className="text-[12.5px] font-medium text-ink">
                      {t.title}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
                      {t.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {typeof state.data.costUSD === "number" && (
            <div className="mt-5 border-t border-edge pt-3 text-right font-mono text-[10px] text-faint">
              generated with Claude Haiku 4.5 · est. cost {fmtCost(state.data.costUSD)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Compact USD cost — sub-cent figures need more precision than $0.00. */
function fmtCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
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
          <div className="flex items-center gap-3 font-mono text-[10px] text-faint">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-full bg-vio/60" /> weight of book
            </span>
            <span className="text-edge2">·</span>
            <span>{upcoming.length} scheduled</span>
          </div>
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

const NEWS_PAGE = 12;

function NewsCard({ symbols }: { symbols: string[] }) {
  const { items, error, loading, refresh } = useNews(symbols);
  const [filter, setFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // One story can come back under several holdings (provider returns it per
  // symbol); collapse on the stable UUID and order newest-first so the feed is
  // clean rather than a jumble of repeats.
  const deduped = useMemo(() => {
    if (!items) return [];
    const seen = new Set<string>();
    const out: NewsItem[] = [];
    for (const n of [...items].sort(
      (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt)
    )) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
    }
    return out;
  }, [items]);

  // Per-symbol story counts drive the filter chips (and their order).
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of deduped) m.set(n.symbol, (m.get(n.symbol) ?? 0) + 1);
    return m;
  }, [deduped]);

  const withNews = useMemo(
    () =>
      [...counts.keys()].sort(
        (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b)
      ),
    [counts]
  );

  const filtered = useMemo(
    () =>
      filter
        ? deduped.filter(
            (n) => n.symbol === filter || n.relatedTickers.includes(filter)
          )
        : deduped,
    [deduped, filter]
  );

  const visible = expanded ? filtered : filtered.slice(0, NEWS_PAGE);

  // Switching the filter resets the expand state so the new view starts capped.
  const pick = (s: string | null) => {
    setFilter(s);
    setExpanded(false);
  };

  return (
    // On xl the news card sits beside the (shorter, finite) earnings calendar.
    // It becomes a flex column whose body is absolutely positioned, so the
    // headline list contributes no intrinsic height to the grid row — the
    // earnings card sets the row height and the news body scrolls to match it.
    // Below xl the cards stack, so heights stay natural.
    <Card
      className="relative px-6 py-5 xl:flex xl:flex-col xl:overflow-hidden"
      i={2}
    >
      <CardHeader
        eyebrow="Holdings news"
        title="What's being written about your names"
        className="mb-3 xl:shrink-0"
      />

      {items && withNews.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5 xl:shrink-0">
          {[null, ...withNews].map((s) => {
            const active = filter === s;
            const count = s === null ? deduped.length : counts.get(s) ?? 0;
            return (
              <button
                key={s ?? "all"}
                onClick={() => pick(s)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  active
                    ? "bg-white/[0.08] text-ink"
                    : "text-mute hover:bg-white/[0.04] hover:text-ink"
                }`}
              >
                {s ?? "All"}
                <span className={active ? "text-mint" : "text-faint"}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="xl:relative xl:min-h-0 xl:flex-1">
        <div className="xl:absolute xl:inset-0 xl:overflow-y-auto xl:pr-1">
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

          {items && deduped.length === 0 && (
            <p className="py-6 text-center text-[12.5px] text-faint">
              No recent headlines for these holdings.
            </p>
          )}

          {items && deduped.length > 0 && filtered.length === 0 && (
            <p className="py-6 text-center text-[12.5px] text-faint">
              No recent headlines mentioning {filter}.
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

          {items && !expanded && filtered.length > NEWS_PAGE && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-3 w-full rounded-md border border-edge py-2 text-[11.5px] text-mute transition-colors hover:bg-white/[0.03] hover:text-ink"
            >
              Show {filtered.length - NEWS_PAGE} more
            </button>
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
        description="The proactive layer — a daily AI brief on your book, headlines for every holding, and the upcoming earnings calendar."
      />

      <BriefCard portfolio={portfolio} />

      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <EarningsCard portfolio={portfolio} />
        <NewsCard symbols={symbols} />
      </div>
    </div>
  );
}
