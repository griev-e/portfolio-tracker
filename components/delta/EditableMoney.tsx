"use client";

import { useEffect, useRef, useState } from "react";
import { fmtUSD } from "@/lib/format";

/**
 * Click-to-edit currency value. Shows formatted USD; on click becomes a number
 * input that commits on Enter/blur and cancels on Escape.
 */
export function EditableMoney({
  value,
  onCommit,
  whole = true,
  className = "",
  allowNegative = false,
}: {
  value: number;
  onCommit: (next: number) => void;
  whole?: boolean;
  className?: string;
  allowNegative?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function start() {
    setDraft(String(value));
    setEditing(true);
  }

  function commit() {
    const n = Number(draft);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        inputMode="decimal"
        onChange={(e) =>
          setDraft(e.target.value.replace(allowNegative ? /[^0-9.\-]/g : /[^0-9.]/g, ""))
        }
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className={`w-28 rounded-md border border-edge2 bg-panel px-2 py-0.5 text-right font-mono text-[13px] text-ink outline-none focus:border-white/30 ${className}`}
      />
    );
  }

  return (
    <button
      onClick={start}
      title="Click to edit"
      className={`rounded-md px-1 font-mono tnum transition-colors hover:bg-white/[0.06] hover:text-ink ${className}`}
    >
      {value < 0 ? `−${fmtUSD(Math.abs(value), whole)}` : fmtUSD(value, whole)}
    </button>
  );
}
