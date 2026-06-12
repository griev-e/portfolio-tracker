"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAlerts } from "@/lib/alerts/store";
import { relativeTime } from "@/lib/format";
import { IconBell } from "./icons";

/** Top-bar bell: unread badge + dropdown of triggered alerts. */
export function AlertBell() {
  const { ready, events, unreadCount, markAllRead, dismissEvent, clearEvents } =
    useAlerts();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!ready) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) markAllRead();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={toggle}
        title="Alerts"
        aria-label={`Alerts${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className="relative flex h-7 w-7 items-center justify-center rounded-md text-mute transition-colors hover:bg-white/[0.06] hover:text-ink [&>svg]:h-[15px] [&>svg]:w-[15px]"
      >
        <IconBell />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-neg px-[3px] font-mono text-[8.5px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="panel absolute right-0 top-9 z-50 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
            <span className="text-[12px] font-medium text-ink">Alerts</span>
            {events.length > 0 && (
              <button
                onClick={clearEvents}
                className="text-[11px] text-faint transition-colors hover:text-ink"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {events.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-faint">
                No triggered alerts.
              </div>
            ) : (
              events.map((e) => (
                <div
                  key={e.id}
                  className="group flex items-start gap-2.5 border-b border-edge/60 px-4 py-3 last:border-b-0"
                >
                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn/70" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] leading-snug text-mute">
                      {e.message}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-faint">
                      {relativeTime(e.at)}
                    </div>
                  </div>
                  <button
                    onClick={() => dismissEvent(e.id)}
                    aria-label="Dismiss alert"
                    className="mt-px shrink-0 text-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <Link
            href="/intelligence"
            onClick={() => setOpen(false)}
            className="block border-t border-edge px-4 py-2.5 text-[11.5px] text-mute transition-colors hover:bg-white/[0.03] hover:text-ink"
          >
            Manage alerts →
          </Link>
        </div>
      )}
    </div>
  );
}
