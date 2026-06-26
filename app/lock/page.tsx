"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Sigil } from "@/components/shell/AppShell";

const PIN_LENGTH = 4;

// Sigil sizing for crisp scaling. We render the SVG at its largest (unlock)
// pixel size and scale it DOWN at rest, so the composited layer is never
// stretched beyond its native resolution. 64px at rest grows to 64 * 2.3.
const SIGIL_FULL = Math.round(64 * 2.3); // 147 — the unlock size
const SIGIL_REST = 64 / SIGIL_FULL; // resting scale that renders 64px

export default function LockPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = cooldown > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Lockout countdown after too many wrong PINs.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(
      () =>
        setCooldown((c) => {
          if (c <= 1) {
            setPin("");
            inputRef.current?.focus();
            return 0;
          }
          return c - 1;
        }),
      1000
    );
    return () => clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH || checking || locked) return;
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
          // Hand the entrance off to the app shell across the reload: it reads
          // this flag and plays a matching reveal so the two screens feel like
          // one continuous motion (see AppShell). sessionStorage survives the
          // navigation but is scoped to this tab and one-shot.
          try {
            sessionStorage.setItem("alpha.entrance", "1");
          } catch {
            /* private mode / disabled storage — entrance just no-ops */
          }
          // Full reload so the middleware re-evaluates every route. Timed to
          // land after the unlock veil has fully covered the screen, so the
          // swap to the app is invisible.
          setTimeout(() => window.location.replace("/"), 1450);
        } else if (res.status === 429) {
          // Brute-force lockout — surface the cooldown and stop accepting input.
          const retryAfter = Number(res.headers.get("Retry-After")) || 900;
          setError(true);
          setCooldown(retryAfter);
          setTimeout(() => {
            if (!cancelled) {
              setError(false);
              setPin("");
            }
          }, 650);
        } else {
          // Stays red/"wrong pin" until the user edits the input themselves
          // (see the input's onChange) rather than auto-clearing on a timer.
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
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
      {/* The sigil is rendered at its largest (unlock) size and scaled DOWN via
          transform at rest. Scaling a GPU layer up rasterizes it at the base
          size and stretches the texture (blurry); keeping every scale ≤ 1 means
          the texture is always sampled down, so it stays crisp through the
          grow-on-unlock. REST is the resting fraction of full size. */}
      <motion.div
        className="relative z-30"
        style={{ willChange: "transform, opacity" }}
        initial={{ opacity: 0, scale: 0.7 * SIGIL_REST }}
        animate={{
          opacity: 1,
          scale: unlocked ? 1 : SIGIL_REST,
          y: unlocked ? -4 : 0,
        }}
        transition={{
          duration: unlocked ? 1.2 : 0.9,
          ease: unlocked ? [0.16, 1, 0.3, 1] : [0.22, 1, 0.36, 1],
        }}
      >
        <Sigil size={SIGIL_FULL} />
      </motion.div>

      <motion.div
        className="relative z-30 text-left"
        animate={{ opacity: unlocked ? 0 : 1, y: unlocked ? -18 : 0 }}
        transition={{ duration: 0.7, ease: [0.4, 0, 1, 1] }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center text-[26px] font-bold tracking-[0.11em] text-ink"
          style={{ fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif' }}
        >
          alpha
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-1 font-mono text-[15px] text-faint"
        >
          /ăl′fə/
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="eyebrow mt-1 italic text-muted"
        >
          noun
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="eyebrow mt-1 pl-8 -indent-8"
        >
          {"   "}1. a measure of risk-adjusted excess return
        </motion.p>
      </motion.div>

      {/* Hidden input drives the boxes; digits render censored. */}
      {/* type="text" (not "password") so browsers and password managers
          don't offer to autofill/save — the visible boxes mask the digits. */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        name="alpha-code"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        data-form-type="other"
        value={pin}
        disabled={locked}
        onChange={(e) => {
          if (locked) return;
          const next = e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
          // Wrong-pin state clears as soon as the user starts correcting it
          // (deleting a digit), not on a timer.
          if (error && next.length < pin.length) setError(false);
          setPin(next);
        }}
        className="absolute h-0 w-0 opacity-0"
        aria-label="PIN"
      />

      <motion.div
        animate={
          unlocked
            ? { opacity: 0, y: -10, scale: 0.4 }
            : error
              ? { x: [0, -10, 10, -7, 7, -3, 0] }
              : { x: 0 }
        }
        transition={{ duration: unlocked ? 0.7 : 0.45, ease: [0.5, 0, 0.75, 0] }}
        className="relative z-30 mt-2 flex gap-3"
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
                error || locked
                  ? "border-neg/60 bg-neg/[0.06] text-neg"
                  : unlocked
                    ? "border-ink/60 bg-ink/[0.08] text-ink"
                    : filled
                      ? "border-ink/40 bg-ink/[0.05] text-ink"
                      : "border-edge bg-panel text-faint"
              }`}
              style={{ width: 52 }}
            >
              {filled ? (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22 }}
                  className="font-mono text-[34px] leading-none translate-y-[5px]"
                >
                  *
                </motion.span>
              ) : (
                <span className="font-mono opacity-40">·</span>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Unlock choreography. All overlays mount only on success and play once.
          A soft white bloom swells from the sigil while two thin light rings
          ripple outward; the veil then washes the whole screen to pure black
          just after, so the hard navigation to the app is hidden inside the
          dark. The app shell fades back out of that same black on the other
          side, with the sigil dissolving from where it left off. */}
      {unlocked && (
        <>
          <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
            {/* Core bloom — a white glow expanding from behind the sigil. Only
                transform + opacity animate, so it composites on the GPU. */}
            <motion.div
              initial={{ scale: 0.12, opacity: 0 }}
              animate={{ scale: 3.6, opacity: [0, 0.55, 0] }}
              transition={{ duration: 1.25, ease: "easeOut", times: [0, 0.38, 1] }}
              className="absolute h-[540px] w-[540px] rounded-full"
              style={{
                willChange: "transform, opacity",
                background:
                  "radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.14) 36%, rgba(255,255,255,0) 64%)",
              }}
            />
            {/* Two light rings rippling outward at different speeds for depth. */}
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 6, opacity: [0, 0.6, 0] }}
              transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1], times: [0, 0.2, 1] }}
              className="absolute h-[160px] w-[160px] rounded-full border border-white/70"
              style={{ willChange: "transform, opacity" }}
            />
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 8.5, opacity: [0, 0.4, 0] }}
              transition={{
                duration: 1.25,
                ease: [0.16, 1, 0.3, 1],
                times: [0, 0.22, 1],
                delay: 0.16,
              }}
              className="absolute h-[160px] w-[160px] rounded-full border border-white/40"
              style={{ willChange: "transform, opacity" }}
            />
          </div>

          {/* Final wash to black — sits above everything so it covers the
              glowing sigil too, leaving a clean black frame for the reload. */}
          <motion.div
            className="pointer-events-none fixed inset-0 z-40"
            style={{ background: "var(--color-void)", willChange: "opacity" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.82, ease: [0.4, 0, 1, 1] }}
          />
        </>
      )}
    </div>
  );
}
