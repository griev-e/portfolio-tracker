"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m as Motion } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TickerLogo } from "@/components/ui/TickerLogo";
import { riskReport } from "@/lib/analytics/risk";
import { SPX } from "@/lib/data/benchmarks";
import {
  DISCOVER_MODES,
  type Conviction,
  type DiscoverIdea,
  type DiscoverModeId,
  type DiscoverRequest,
  type DiscoverResponse,
} from "@/lib/discover/types";
import { fmtUSD } from "@/lib/format";
import { usePortfolio } from "@/lib/store";
import type { Portfolio } from "@/lib/types";

/* ------------------------------- mode styling ------------------------------- */

const MODE_ACCENT: Record<DiscoverModeId, string> = {
  diversify: "#6ea8fe",
  growth: "#4ade80",
  value: "#fbbf78",
  defensive: "#5fb3c9",
  quality: "#b58cff",
  thematic: "#f0729a",
};

function ModeGlyph({ id }: { id: DiscoverModeId }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (id) {
    case "diversify":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="3" />
          <path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.5 4.5l2 2M13.5 13.5l2 2M15.5 4.5l-2 2M6.5 13.5l-2 2" />
        </svg>
      );
    case "growth":
      return (
        <svg {...common}>
          <path d="M3 15 L8 9 L11 12 L17 5" />
          <path d="M13 5 H17 V9" />
        </svg>
      );
    case "value":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6.2v7.6M8 8.2c0-1 .9-1.6 2-1.6s2 .6 2 1.5c0 2-3.8 1-3.8 3 0 .9.9 1.5 1.8 1.5s2-.5 2-1.5" />
        </svg>
      );
    case "defensive":
      return (
        <svg {...common}>
          <path d="M10 2.6 L16 5 V10 C16 13.6 13.4 15.8 10 17 C6.6 15.8 4 13.6 4 10 V5 Z" />
          <path d="M7.4 10 L9.2 11.8 L12.8 8" />
        </svg>
      );
    case "quality":
      return (
        <svg {...common}>
          <path d="M10 2.6 L12 6.6 L16.4 7.2 L13.2 10.3 L14 14.7 L10 12.6 L6 14.7 L6.8 10.3 L3.6 7.2 L8 6.6 Z" />
        </svg>
      );
    case "thematic":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="2" />
          <ellipse cx="10" cy="10" rx="8" ry="3.4" />
          <ellipse cx="10" cy="10" rx="8" ry="3.4" transform="rotate(60 10 10)" />
          <ellipse cx="10" cy="10" rx="8" ry="3.4" transform="rotate(120 10 10)" />
        </svg>
      );
  }
}

const CONVICTION_COLOR: Record<Conviction, string> = {
  high: "var(--color-mint)",
  medium: "var(--color-sky)",
  low: "var(--color-warn)",
};

/* --------------------------------- request --------------------------------- */

function buildRequest(portfolio: Portfolio, mode: DiscoverModeId): DiscoverRequest {
  const risk = riskReport(portfolio, SPX.sectorWeights);
  const positions = [...portfolio.positions]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 30)
    .map((p) => {
      const f = p.fundamentals;
      return {
        symbol: p.symbol,
        name: p.name,
        weight: +p.weight.toFixed(4),
        sector: f?.sector ?? null,
        forwardPE: f?.forwardPE ?? null,
        dividendYield: f ? +f.dividendYield.toFixed(4) : null,
        roic: f ? +f.roic.toFixed(4) : null,
        revenueGrowth: f ? +f.revenueGrowth.toFixed(4) : null,
        beta: f ? +f.beta.toFixed(2) : null,
        volatility: f ? +f.volatility.toFixed(4) : null,
      };
    });
  return {
    mode,
    portfolio: {
      totalValue: portfolio.totalValue,
      cashWeightPct: +(portfolio.cashWeight * 100).toFixed(1),
      metrics: {
        expectedReturnPct: +(risk.expectedReturn * 100).toFixed(1),
        volatilityPct: +(risk.volatility * 100).toFixed(1),
        sharpe: +risk.sharpe.toFixed(2),
        beta: +risk.beta.toFixed(2),
        effectiveHoldings: +risk.effectiveN.toFixed(1),
      },
      positions,
    },
  };
}

/* ---------------------------------- hook ---------------------------------- */

type DiscoverState =
  | { kind: "idle" }
  | { kind: "loading"; mode: DiscoverModeId }
  | { kind: "disabled" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: DiscoverResponse };

function useDiscover(portfolio: Portfolio) {
  const [state, setState] = useState<DiscoverState>({ kind: "idle" });

  // Reset when the holdings actually change (re-import), not on a quote tick.
  const shapeSig = portfolio.positions.map((p) => p.symbol).sort().join(",");
  const shapeRef = useRef(shapeSig);
  useEffect(() => {
    if (shapeRef.current !== shapeSig) {
      shapeRef.current = shapeSig;
      setState({ kind: "idle" });
    }
  }, [shapeSig]);

  const generate = useCallback(
    async (mode: DiscoverModeId) => {
      setState({ kind: "loading", mode });
      try {
        const res = await fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRequest(portfolio, mode)),
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
            message: "Discover is rate limited — try again shortly.",
          });
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        setState({ kind: "ready", data: (await res.json()) as DiscoverResponse });
      } catch {
        setState({ kind: "error", message: "Discover is unreachable. Try again." });
      }
    },
    [portfolio]
  );

  return { state, generate };
}

/* ---------------------------------- page ---------------------------------- */

export default function DiscoverPage() {
  const { ready, portfolio } = usePortfolio();
  const { state, generate } = useDiscover(portfolio ?? ({ positions: [] } as unknown as Portfolio));

  const activeMode =
    state.kind === "loading"
      ? state.mode
      : state.kind === "ready"
        ? state.data.mode
        : null;

  if (!ready) return null;
  if (!portfolio) return <EmptyState page="AI Discover" />;

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Discover"
        description="AI-generated stock ideas, tailored to your book. Pick a research lens and Claude surfaces new names that fit — what they add, how they complement what you own, and the risk."
      />

      <ModeGrid
        active={activeMode}
        busy={state.kind === "loading"}
        onPick={generate}
      />

      <div className="mt-5">
        <AnimatePresence mode="wait">
          {state.kind === "idle" && <IdlePanel key="idle" />}
          {state.kind === "disabled" && <DisabledPanel key="disabled" />}
          {state.kind === "loading" && <LoadingPanel key="loading" mode={state.mode} />}
          {state.kind === "error" && (
            <ErrorPanel key="error" message={state.message} onRetry={() => activeMode && generate(activeMode)} />
          )}
          {state.kind === "ready" && <Results key="ready" data={state.data} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------- mode grid ------------------------------- */

function ModeGrid({
  active,
  busy,
  onPick,
}: {
  active: DiscoverModeId | null;
  busy: boolean;
  onPick: (m: DiscoverModeId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {DISCOVER_MODES.map((m, i) => {
        const accent = MODE_ACCENT[m.id];
        const isActive = active === m.id;
        return (
          <Motion.button
            key={m.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            disabled={busy}
            onClick={() => onPick(m.id)}
            className="group relative overflow-hidden rounded-2xl border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: isActive ? `color-mix(in srgb, ${accent} 55%, transparent)` : "var(--color-edge)",
              background: isActive
                ? `color-mix(in srgb, ${accent} 9%, transparent)`
                : "rgba(255,255,255,0.015)",
            }}
          >
            {/* hover/active glow */}
            <span
              className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: accent, opacity: isActive ? 0.5 : undefined }}
            />
            <span
              className="relative flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
            >
              <ModeGlyph id={m.id} />
            </span>
            <div className="relative mt-2.5 text-[13px] font-medium text-ink">{m.label}</div>
            <div className="relative mt-0.5 text-[10.5px] leading-snug text-faint">{m.tagline}</div>
          </Motion.button>
        );
      })}
    </div>
  );
}

/* ------------------------------- states ------------------------------- */

function Shell({ children }: { children: ReactNode }) {
  return (
    <Motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Motion.div>
  );
}

function IdlePanel() {
  return (
    <Shell>
      <Card className="px-8 py-14 text-center" hover={false}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-mute">
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="9" r="6" />
            <path d="M13.5 13.5 L17 17" />
            <path d="M9 6.4 L9.9 8.3 L11.8 8.6 L10.4 10 L10.7 11.9 L9 11 L7.3 11.9 L7.6 10 L6.2 8.6 L8.1 8.3 Z" />
          </svg>
        </div>
        <h2 className="font-display text-[16px] font-medium text-ink">Pick a research lens</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-mute">
          Each lens runs a different brief against your portfolio. Claude reads your
          holdings, finds the gaps, and proposes new names that fit — with a thesis,
          a fit rationale, and the key risk for every idea.
        </p>
      </Card>
    </Shell>
  );
}

function DisabledPanel() {
  return (
    <Shell>
      <Card className="px-8 py-12 text-center" hover={false}>
        <h2 className="font-display text-[15px] font-medium text-ink">AI Discover isn&apos;t configured</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-mute">
          Set <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px]">ANTHROPIC_API_KEY</code> in
          the environment to generate ideas. Everything else in the app works without it.
        </p>
      </Card>
    </Shell>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Shell>
      <Card className="px-8 py-12 text-center" hover={false}>
        <h2 className="font-display text-[15px] font-medium text-neg">Couldn&apos;t generate ideas</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-mute">{message}</p>
        <button
          onClick={onRetry}
          className="mt-5 rounded-lg border border-edge bg-white/[0.03] px-4 py-2 text-[12px] font-medium text-ink transition-colors hover:border-edge2 hover:bg-white/[0.05]"
        >
          Try again
        </button>
      </Card>
    </Shell>
  );
}

function LoadingPanel({ mode }: { mode: DiscoverModeId }) {
  const label = DISCOVER_MODES.find((m) => m.id === mode)?.label ?? "ideas";
  const accent = MODE_ACCENT[mode];
  return (
    <Shell>
      <Card className="px-6 py-5" hover={false}>
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full" style={{ background: accent, opacity: 0.5 }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
          </span>
          <span className="text-[13px] text-ink">
            Claude is researching <span className="font-medium">{label}</span> ideas for your book
          </span>
          <DotPulse />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <ShimmerCard key={i} delay={i * 0.12} />
          ))}
        </div>
      </Card>
    </Shell>
  );
}

function DotPulse() {
  return (
    <span className="ml-0.5 flex gap-1">
      {[0, 1, 2].map((i) => (
        <Motion.span
          key={i}
          className="h-1 w-1 rounded-full bg-mute"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}

function ShimmerCard({ delay }: { delay: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-white/[0.012] p-4">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-white/[0.05]" />
        <div className="flex-1 space-y-1.5">
          <Bar w="40%" delay={delay} />
          <Bar w="65%" delay={delay + 0.1} />
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <Bar w="100%" delay={delay + 0.15} />
        <Bar w="90%" delay={delay + 0.2} />
        <Bar w="55%" delay={delay + 0.25} />
      </div>
    </div>
  );
}

function Bar({ w, delay }: { w: string; delay: number }) {
  return (
    <Motion.div
      className="h-2 rounded-full bg-white/[0.05]"
      style={{ width: w }}
      animate={{ opacity: [0.35, 0.75, 0.35] }}
      transition={{ duration: 1.4, repeat: Infinity, delay }}
    />
  );
}

/* ------------------------------- results ------------------------------- */

function Results({ data }: { data: DiscoverResponse }) {
  const { plan, mode } = data;
  const accent = MODE_ACCENT[mode];

  // Ground the AI's picks with a live price + Research deep-link.
  const symbols = plan.ideas.map((i) => i.symbol);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const key = [...symbols].sort().join(",");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/quotes?symbols=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.quotes) return;
        const next: Record<string, number> = {};
        for (const k of Object.keys(d.quotes)) {
          const p = d.quotes[k]?.price;
          if (typeof p === "number") next[k] = p;
        }
        setPrices((prev) => ({ ...prev, ...next }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (
    <Shell>
      {/* The read */}
      <Card
        className="relative overflow-hidden px-6 py-5 sm:px-7"
        hover={false}
        i={0}
      >
        <span
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: accent }}
        />
        <div className="eyebrow mb-1.5">The read</div>
        <p className="max-w-3xl text-[13.5px] leading-relaxed text-mute">{plan.read}</p>

        {plan.gaps.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {plan.gaps.map((g, i) => (
              <Motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.06 }}
                title={g.detail}
                className="rounded-full border border-edge bg-white/[0.02] px-3 py-1 text-[11px] text-mute"
              >
                <span className="text-faint">gap ·</span> {g.title}
              </Motion.span>
            ))}
          </div>
        )}
      </Card>

      {/* Ideas */}
      <div className="mt-4 grid gap-3.5 lg:grid-cols-2">
        {plan.ideas.map((idea, i) => (
          <IdeaCard key={`${idea.symbol}-${i}`} idea={idea} i={i} price={prices[idea.symbol]} />
        ))}
      </div>

      {/* Cost footer */}
      <div className="mt-5 text-[11px] text-faint">
        Generated with Claude Opus 4.8
        {typeof data.costUSD === "number" && <> · est. cost {fmtCost(data.costUSD)}</>}
        {data.cached && <> · cached today</>} · AI research, not investment advice — figures are model estimates.
      </div>
    </Shell>
  );
}

function IdeaCard({ idea, i, price }: { idea: DiscoverIdea; i: number; price?: number }) {
  const conv = CONVICTION_COLOR[idea.conviction];
  return (
    <Motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 + i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col rounded-2xl border border-edge bg-white/[0.015] p-4 transition-transform duration-300 hover:-translate-y-0.5 sm:p-5"
      style={{ borderTop: `2px solid ${conv}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TickerLogo symbol={idea.symbol} accent={conv} size={38} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[15px] font-semibold text-ink">{idea.symbol}</span>
              <span className="truncate text-[11.5px] text-faint">{idea.name}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-faint">
              <span>{idea.sector}</span>
              {typeof price === "number" && (
                <>
                  <span className="text-edge2">·</span>
                  <span className="font-mono text-mute">{fmtUSD(price)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
          style={{ background: `color-mix(in srgb, ${conv} 14%, transparent)`, color: conv }}
        >
          {idea.conviction}
        </span>
      </div>

      <p className="mt-3.5 text-[12.5px] leading-relaxed text-mute">{idea.thesis}</p>

      <div className="mt-3 rounded-lg border border-edge bg-white/[0.012] px-3 py-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9.5px] font-medium uppercase tracking-wide" style={{ color: conv }}>
            Fits your book
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-mute">{idea.fit}</p>
      </div>

      {idea.metrics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {idea.metrics.map((m, mi) => (
            <span
              key={mi}
              className="flex items-baseline gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 font-mono text-[10.5px]"
            >
              <span className="text-faint">{m.label}</span>
              <span className="text-ink">{m.value}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-end justify-between gap-3 pt-3.5">
        <p className="flex-1 text-[11px] leading-snug text-faint">
          <span className="text-warn/80">Risk · </span>
          {idea.risk}
        </p>
        <Link
          href={`/research?symbol=${idea.symbol}`}
          className="shrink-0 font-mono text-[11px] text-sky transition-colors hover:text-ink"
        >
          Research →
        </Link>
      </div>
    </Motion.div>
  );
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
