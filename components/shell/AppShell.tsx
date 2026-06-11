"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { fmtUSDCompact } from "@/lib/format";
import { usePortfolio } from "@/lib/store";
import {
  IconBenchmark,
  IconImport,
  IconMatrix,
  IconMonteCarlo,
  IconOverview,
  IconQuality,
  IconResearch,
  IconRisk,
  IconScenario,
} from "./icons";

const NAV = [
  { href: "/", label: "Overview", icon: IconOverview, group: "Portfolio" },
  { href: "/risk", label: "Risk", icon: IconRisk, group: "Portfolio" },
  { href: "/research", label: "Research", icon: IconResearch, group: "Portfolio" },
  { href: "/quality", label: "Quality", icon: IconQuality, group: "Analysis" },
  { href: "/benchmark", label: "Benchmark & Factors", icon: IconBenchmark, group: "Analysis" },
  { href: "/correlation", label: "Correlation", icon: IconMatrix, group: "Analysis" },
  { href: "/scenarios", label: "Scenarios", icon: IconScenario, group: "Simulation" },
  { href: "/montecarlo", label: "Monte Carlo", icon: IconMonteCarlo, group: "Simulation" },
  { href: "/import", label: "Import & Data", icon: IconImport, group: "Data" },
];

const GROUPS = ["Portfolio", "Analysis", "Simulation", "Data"];

/** Vault-rotor sigil: three interlocking arcs around a core. */
export function Sigil({ size = 26, id = "sgrad" }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="12.5" stroke={`url(#${id})`} strokeWidth="1.3" />
      <g stroke={`url(#${id})`} strokeWidth="1.6" strokeLinecap="round">
        <path d="M14 5.6 A 8.4 8.4 0 0 1 21.27 18.2" />
        <path d="M14 5.6 A 8.4 8.4 0 0 1 21.27 18.2" transform="rotate(120 14 14)" />
        <path d="M14 5.6 A 8.4 8.4 0 0 1 21.27 18.2" transform="rotate(240 14 14)" />
      </g>
      <circle cx="14" cy="14" r="1.7" fill={`url(#${id})`} />
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="28" y2="28">
          <stop stopColor="#5EEAD4" />
          <stop offset="1" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2 group">
      <Sigil />
      <div className="leading-none">
        <div className="font-display text-[15px] font-semibold tracking-[0.18em] text-ink">
          SANCTUM
        </div>
        <div className="eyebrow mt-1 !text-[0.52rem]">
          private portfolio intelligence
        </div>
      </div>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5">
      {GROUPS.map((group) => (
        <div key={group}>
          <div className="eyebrow px-3 mb-1.5">{group}</div>
          <div className="flex flex-col gap-0.5">
            {NAV.filter((n) => n.group === group).map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150 ${
                    active
                      ? "text-mint"
                      : "text-mute hover:text-ink hover:bg-white/[0.03]"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg bg-mint/[0.07] border border-mint/15"
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                    />
                  )}
                  <span className="relative z-10 opacity-90">
                    <Icon />
                  </span>
                  <span className="relative z-10 font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function LiveDot({ degraded }: { degraded: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {!degraded && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint/60" />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${
          degraded ? "bg-warn" : "bg-mint"
        }`}
      />
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { portfolio, isDemo, ready, live } = usePortfolio();

  // The lock screen renders bare — no sidebar, no nav.
  if (pathname === "/lock") {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[228px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex sticky top-0 h-screen flex-col gap-7 border-r border-edge px-3 py-6 bg-panel/40">
        <Wordmark />
        <NavLinks />
        <div className="mt-auto px-3 space-y-2">
          {ready && portfolio && (
            <div className="panel px-3 py-2.5">
              <div className="eyebrow">Net value</div>
              <div className="font-mono tnum text-[15px] text-ink mt-0.5">
                {fmtUSDCompact(portfolio.totalValue)}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px]">
                <LiveDot degraded={live.degraded || !live.quotesAt} />
                <span className={live.degraded || !live.quotesAt ? "text-warn/90" : "text-mint/90"}>
                  {live.degraded
                    ? live.livePriceCount > 0
                      ? "offline · last good prices"
                      : "offline · imported prices"
                    : live.quotesAt
                      ? `live · ${live.livePriceCount}/${portfolio.positions.length} priced`
                      : "connecting…"}
                </span>
              </div>
              {isDemo && (
                <div className="mt-1 text-[10px] text-warn/90 font-mono">
                  demo portfolio
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 border-b border-edge bg-void/85 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <Wordmark />
        </div>
        <div className="flex gap-1 overflow-x-auto px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                  active
                    ? "border-mint/30 bg-mint/10 text-mint"
                    : "border-edge text-mute"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8 max-w-[1380px] w-full mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
