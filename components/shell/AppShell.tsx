"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

/** Big cursive alpha — the thing the whole app is chasing. */
export function Sigil({ size = 26 }: { size?: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <text
        x="16"
        y="16.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontSize="30"
      >
        α
      </text>
    </svg>
  );
}

function LiveDot({ degraded }: { degraded: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {!degraded && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full" style={{ backgroundColor: "#23653360" }} />
      )}
      <span
        className="relative inline-flex h-2 w-2 rounded-full"
        style={{ backgroundColor: degraded ? "var(--color-warn)" : "#236533" }}
      />
    </span>
  );
}

function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-100 ${
        active ? "text-ink" : "text-mute hover:text-ink hover:bg-white/[0.05]"
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-md bg-white/[0.07]"
          transition={{ type: "spring", stiffness: 520, damping: 40 }}
        />
      )}
      <span className="relative z-10 opacity-80 [&>svg]:h-4 [&>svg]:w-4">
        <Icon />
      </span>
      <span className="relative z-10">{item.label}</span>
    </Link>
  );
}

/** Sidebar nav with a Vercel-style Find filter ("/" to focus, Enter to go). */
function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return NAV.filter(
      (n) =>
        n.label.toLowerCase().includes(q) || n.group.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <>
      <div className="px-3 pb-2">
        <div className="relative">
          <svg
            width="13"
            height="13"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
          >
            <circle cx="8.6" cy="8.6" r="5.4" />
            <path d="M12.6 12.6 L17 17" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered?.[0]) {
                router.push(filtered[0].href);
                setQuery("");
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Find..."
            className="h-8 w-full rounded-md border border-edge bg-white/[0.03] pl-8 pr-8 text-[13px] text-ink placeholder:text-faint outline-none transition-colors focus:border-edge2"
          />
          <span className="kbd absolute right-2 top-1/2 -translate-y-1/2">/</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {filtered ? (
          <div className="flex flex-col gap-0.5 pt-1">
            {filtered.length === 0 && (
              <div className="px-2.5 py-2 text-[12px] text-faint">No matches</div>
            )}
            {filtered.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                active={pathname === item.href}
                onNavigate={() => setQuery("")}
              />
            ))}
          </div>
        ) : (
          GROUPS.map((group) => (
            <div key={group}>
              <div className="px-2.5 pb-1 pt-4 text-[11px] font-medium text-faint">
                {group}
              </div>
              <div className="flex flex-col gap-0.5">
                {NAV.filter((n) => n.group === group).map((item) => (
                  <NavRow key={item.href} item={item} active={pathname === item.href} />
                ))}
              </div>
            </div>
          ))
        )}
      </nav>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { portfolio, isDemo, ready, live } = usePortfolio();

  // The lock screen renders bare — no sidebar, no nav.
  if (pathname === "/lock") {
    return <main className="min-h-screen">{children}</main>;
  }

  const current = NAV.find((n) => n.href === pathname);

  const liveLabel = live.degraded
    ? live.livePriceCount > 0
      ? "offline · last good prices"
      : "offline · imported prices"
    : live.quotesAt
      ? "live"
      : "connecting";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex sticky top-0 h-screen flex-col border-r border-edge bg-[#050505]">
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Sigil size={24} />
            <span className="text-[14px] font-medium text-ink">
              grieve
            </span>
          </Link>
          {isDemo && (
            <span className="ml-auto rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-warn">
              Demo
            </span>
          )}
        </div>

        <SidebarNav />

      </aside>

      <div className="min-w-0">
        {/* Desktop top bar */}
        <header className="sticky top-0 z-40 hidden h-12 items-center border-b border-edge bg-black/80 px-6 backdrop-blur-md lg:flex">
          <span className="text-[13px] text-faint">{current?.group ?? "Sanctum"}</span>
          <span className="absolute left-1/2 -translate-x-1/2 text-[13px] font-medium text-mute">
            {current?.label ?? ""}
          </span>
          {ready && portfolio && (
            <div className="ml-auto flex items-center gap-2">
              <LiveDot degraded={live.degraded || !live.quotesAt} />
              <span
                className={`font-mono text-[11px] tracking-[0.08em] ${
                  live.degraded || !live.quotesAt ? "text-warn/90" : "text-mute"
                }`}
              >
                {(live.degraded || !live.quotesAt) ? liveLabel.toUpperCase() : "LIVE"}
              </span>
            </div>
          )}
        </header>

        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-40 border-b border-edge bg-black/85 backdrop-blur-md">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <Sigil size={22} />
              <span className="text-[13px] font-medium text-ink">
                grieve
              </span>
            </Link>
            {ready && portfolio && (
              <div className="flex items-center gap-2">
                <LiveDot degraded={live.degraded || !live.quotesAt} />
                <span className="font-mono tnum text-[12px] text-mute">
                  {fmtUSDCompact(portfolio.totalValue)}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] transition-colors ${
                    active
                      ? "bg-white/[0.08] text-ink"
                      : "text-mute hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1380px] min-w-0 px-4 py-6 sm:px-8 sm:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
