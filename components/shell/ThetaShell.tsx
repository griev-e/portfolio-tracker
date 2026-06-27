"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTheta } from "@/lib/theta/store";
import { useSidebarWidth } from "@/lib/useSidebarWidth";
import { AccountChip, AppTitle, Mark, SignOutButton } from "./brand";
import { IconImport, IconIntelligence } from "./icons";
import {
  IconAccounts,
  IconBudgets,
  IconCashFlow,
  IconDashboard,
  IconGoals,
  IconNetWorth,
  IconRecurring,
  IconSettings,
  IconTransactions,
} from "./thetaIcons";

const NAV = [
  { href: "/theta", label: "Dashboard", icon: IconDashboard, group: "Overview" },
  { href: "/theta/networth", label: "Net Worth", icon: IconNetWorth, group: "Overview" },
  { href: "/theta/intelligence", label: "Intelligence", icon: IconIntelligence, group: "Overview" },
  { href: "/theta/accounts", label: "Accounts", icon: IconAccounts, group: "Money" },
  { href: "/theta/transactions", label: "Transactions", icon: IconTransactions, group: "Money" },
  { href: "/theta/cashflow", label: "Cash Flow", icon: IconCashFlow, group: "Money" },
  { href: "/theta/budgets", label: "Budgets", icon: IconBudgets, group: "Planning" },
  { href: "/theta/goals", label: "Goals", icon: IconGoals, group: "Planning" },
  { href: "/theta/recurring", label: "Recurring", icon: IconRecurring, group: "Planning" },
  { href: "/theta/import", label: "Import & Data", icon: IconImport, group: "System" },
  { href: "/theta/settings", label: "Settings", icon: IconSettings, group: "System" },
];

const GROUPS = ["Overview", "Money", "Planning", "System"];

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
          layoutId="theta-nav-active"
          className="absolute inset-0 rounded-md bg-white/[0.07]"
          style={{ boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-vio) 16%, transparent)" }}
          transition={{ type: "spring", stiffness: 520, damping: 40 }}
        />
      )}
      <span
        className={`relative z-10 opacity-80 [&>svg]:h-4 [&>svg]:w-4 ${
          active ? "text-vio" : ""
        }`}
      >
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

/** Honest tag: theta ships with illustrative sample data, no real accounts. */
function DemoTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.08em] text-vio/80 ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-vio/70" />
      SAMPLE DATA
    </span>
  );
}

export function ThetaShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isSample, ready } = useTheta();
  const current = NAV.find((n) => n.href === pathname);
  const showSample = ready && isSample;
  const sidebar = useSidebarWidth("theta.sidebarWidth.v1");

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside
        className="relative hidden shrink-0 lg:flex sticky top-0 h-screen flex-col border-r border-edge bg-[#050505]"
        style={{ width: sidebar.width }}
      >
        <div className="px-3 pb-3 pt-4">
          <div className="flex items-center gap-2.5 px-1">
            <Link href="/theta" className="flex items-center gap-2.5">
              <Mark kind="theta" size={24} />
              <AppTitle active="theta" />
            </Link>
            <SignOutButton className="ml-auto" />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <AccountChip className="px-0.5" />
          </div>
        </div>

        <SidebarNav />

        {/* Drag handle — adjusts sidebar width, persisted in localStorage. */}
        <div
          onMouseDown={sidebar.onMouseDown}
          className={`absolute right-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize ${
            sidebar.dragging ? "bg-white/15" : "hover:bg-white/10"
          }`}
        />
      </aside>

      <div className="min-w-0 flex-1">
        {/* Desktop top bar */}
        <header className="sticky top-0 z-40 hidden h-12 items-center border-b border-edge bg-black/80 px-6 backdrop-blur-md lg:flex">
          <span className="text-[13px] text-faint">{current?.group ?? "theta"}</span>
          <span className="absolute left-1/2 -translate-x-1/2 text-[13px] font-medium text-mute">
            {current?.label ?? ""}
          </span>
          {showSample && <DemoTag className="ml-auto" />}
        </header>

        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-40 border-b border-edge bg-black/85 backdrop-blur-md">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/theta" className="flex items-center gap-2.5">
              <Mark kind="theta" size={22} />
              <AppTitle active="theta" />
            </Link>
            <div className="flex items-center gap-2.5">
              {showSample && <DemoTag />}
              <SignOutButton />
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] transition-colors ${
                    active ? "bg-white/[0.08] text-ink" : "text-mute hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1380px] min-w-0 px-4 py-6 sm:px-8 sm:py-8">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
