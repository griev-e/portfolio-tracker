"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TickerLogo } from "@/components/ui/TickerLogo";
import type { SymbolHit } from "@/lib/research/types";

/**
 * Debounced ticker / company search. Yahoo-backed (via /api/search) with
 * keyboard navigation. Pressing Enter on a raw query that matches no result
 * still resolves it as a literal symbol — handy for exact tickers.
 */
export function TickerSearch({
  onSelect,
}: {
  onSelect: (symbol: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { results?: SymbolHit[] };
        if (reqId.current !== id) return;
        setResults(data.results ?? []);
        setActive(0);
      } catch {
        if (reqId.current === id) setResults([]);
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (symbol: string) => {
    onSelect(symbol.toUpperCase());
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) choose(results[active].symbol);
      else if (query.trim()) choose(query.trim());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search any stock, ETF or fund — ticker or company name"
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-xl border border-edge2 bg-panel py-3 pl-11 pr-4 font-mono text-[14px] text-ink placeholder:text-faint focus:border-mint/40 focus:outline-none"
        />
        {loading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[11px] text-faint">
            …
          </span>
        )}
      </div>

      <AnimatePresence>
        {open && query.trim().length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-edge2 bg-void/95 p-1.5 shadow-2xl backdrop-blur-md"
          >
            {results.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-mute">
                {loading
                  ? "Searching…"
                  : `No matches — press Enter to look up "${query.trim().toUpperCase()}" directly`}
              </div>
            ) : (
              results.map((r, i) => (
                <button
                  key={`${r.symbol}-${i}`}
                  onClick={() => choose(r.symbol)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    i === active ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <TickerLogo symbol={r.symbol} accent="var(--color-mint)" size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[13px] font-medium text-ink">
                        {r.symbol}
                      </span>
                      <span className="truncate text-[12px] text-mute">
                        {r.name}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded border border-edge bg-panel px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-faint">
                    {r.exchange || r.type}
                  </span>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
