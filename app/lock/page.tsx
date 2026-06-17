"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Sigil } from "@/components/shell/AppShell";

const PIN_LENGTH = 4;

export default function LockPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH || checking) return;
    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin }),
        });
        if (cancelled) return;
        if (res.ok) {
          setUnlocked(true);
          // Full reload so the middleware re-evaluates every route.
          setTimeout(() => window.location.replace("/"), 450);
        } else {
          setError(true);
          setTimeout(() => {
            if (!cancelled) {
              setError(false);
              setPin("");
              inputRef.current?.focus();
            }
          }, 650);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setTimeout(() => {
            if (!cancelled) {
              setError(false);
              setPin("");
            }
          }, 650);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-8 px-6"
      onClick={() => inputRef.current?.focus()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{
          opacity: 1,
          scale: unlocked ? 1.15 : 1,
        }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <Sigil size={64} />
      </motion.div>

      <div className="text-center">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="font-display text-[22px] font-semibold tracking-[0.22em] text-ink"
        >
          GRIEVE
        </motion.h1>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="eyebrow mt-2"
        >
          {unlocked ? "welcome back" : error ? "wrong pin" : "enter pin"}
        </motion.div>
      </div>

      {/* Hidden input drives the boxes; digits render censored. */}
      {/* type="text" (not "password") so browsers and password managers
          don't offer to autofill/save — the visible boxes mask the digits. */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        name="grieve-code"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        data-form-type="other"
        value={pin}
        onChange={(e) =>
          setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
        }
        className="absolute h-0 w-0 opacity-0"
        aria-label="PIN"
      />

      <motion.div
        animate={
          error
            ? { x: [0, -10, 10, -7, 7, -3, 0] }
            : { x: 0 }
        }
        transition={{ duration: 0.45 }}
        className="flex gap-3"
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 + i * 0.07 }}
              className={`flex h-16 items-center justify-center rounded-xl border text-[22px] transition-colors duration-150 ${
                error
                  ? "border-neg/60 bg-neg/[0.06] text-neg"
                  : unlocked
                    ? "border-mint/60 bg-mint/[0.08] text-mint"
                    : filled
                      ? "border-mint/40 bg-mint/[0.05] text-mint"
                      : "border-edge bg-panel text-faint"
              }`}
              style={{ width: 52 }}
            >
              {filled ? (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22 }}
                  className="font-mono"
                >
                  ✱
                </motion.span>
              ) : (
                <span className="font-mono opacity-40">·</span>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint"
      >
        {checking ? "verifying…" : "private — authorized access only"}
      </motion.p>
    </div>
  );
}
