"use client";

import { AnimatePresence, motion } from "framer-motion";
import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { APP_HOME, APP_META, type AppKind, Mark } from "@/components/shell/brand";

const SERIF = '"Palatino Linotype", "Book Antiqua", Palatino, serif';

// Signature accent (raw RGB) per app — mint for alpha, iris for delta. Drives
// the hover bloom, the field theming and the unlock choreography tint.
const ACCENT_RGB: Record<AppKind, string> = {
  alpha: "176,43,10",
  delta: "167,139,250",
};

/**
 * The portal. Both alpha (portfolio analytics) and delta (personal finance)
 * live behind one door; this screen lets you pick which to enter — α | Δ —
 * then, when the deploy has accounts enabled (AUTH_SECRET set), takes your
 * username and password. With auth disabled, choosing a side walks straight in.
 */
export default function LockPage() {
  const { enabled } = useAuth();
  const [mode, setMode] = useState<"portal" | "auth">("portal");
  const [selected, setSelected] = useState<AppKind>("alpha");
  const [hovered, setHovered] = useState<AppKind | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "auth") {
      const id = setTimeout(() => userRef.current?.focus(), 80);
      return () => clearTimeout(id);
    }
  }, [mode]);

  // Sets the cross-reload entrance flag and washes to the chosen app.
  function triggerUnlock(kind: AppKind) {
    setUnlocked(true);
    try {
      // The app shell reads this and plays a matching reveal out of black so
      // the two screens feel like one continuous motion (see AppShell/layout).
      sessionStorage.setItem("alpha.entrance", "1");
    } catch {
      /* private mode — entrance just no-ops */
    }
    setTimeout(() => window.location.replace(APP_HOME[kind]), 1450);
  }

  function choose(kind: AppKind) {
    if (unlocked) return;
    setSelected(kind);
    if (enabled) {
      setMode("auth");
    } else {
      triggerUnlock(kind); // accounts disabled — open access
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (checking || unlocked) return;
    if (!username.trim() || !password) {
      setError("Enter your username and password");
      return;
    }
    setChecking(true);
    setError("");
    try {
      const res = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Incorrect username or password");
        setPassword("");
      } else {
        triggerUnlock(selected);
      }
    } catch {
      setError("Something went wrong — try again");
    } finally {
      setChecking(false);
    }
  }

  const accent = ACCENT_RGB[selected];

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* Ambient wash that leans toward whichever side is in focus. */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        animate={{
          background:
            mode === "auth"
              ? `radial-gradient(circle at 50% 42%, rgba(${accent},0.07), transparent 60%)`
              : hovered
                ? `radial-gradient(circle at ${hovered === "alpha" ? "32%" : "68%"} 45%, rgba(${ACCENT_RGB[hovered]},0.07), transparent 55%)`
                : "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.02), transparent 60%)",
        }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />

      <AnimatePresence mode="wait">
        {mode === "portal" ? (
          <motion.div
            key="portal"
            className="relative z-30 w-full max-w-3xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: unlocked ? 0 : 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex flex-col items-stretch md:flex-row md:items-center">
              <PortalChoice
                kind="alpha"
                hovered={hovered}
                onHover={setHovered}
                onChoose={choose}
                from={-32}
              />

              {/* the divider — the " | " in α | Δ */}
              <motion.div
                aria-hidden
                initial={{ opacity: 0, scaleY: 0.3 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{ delay: 0.25, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto my-2 hidden h-48 w-px bg-gradient-to-b from-transparent via-edge2 to-transparent md:block"
              />
              <motion.div
                aria-hidden
                initial={{ opacity: 0, scaleX: 0.3 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: 0.25, duration: 0.6 }}
                className="mx-auto my-2 h-px w-32 bg-gradient-to-r from-transparent via-edge2 to-transparent md:hidden"
              />

              <PortalChoice
                kind="delta"
                hovered={hovered}
                onHover={setHovered}
                onChoose={choose}
                from={32}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="auth"
            className="relative z-30 flex w-full max-w-sm flex-col items-center"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: unlocked ? 0 : 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* back to the portal */}
            <button
              onClick={() => {
                setMode("portal");
                setPassword("");
                setError("");
              }}
              className="absolute -top-2 left-0 flex items-center gap-1.5 text-[12px] text-faint transition-colors hover:text-ink"
              aria-label="Back to portal"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4l-5 6 5 6" />
              </svg>
              portal
            </button>

            <motion.div
              className="relative"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: unlocked ? 1.12 : 1, opacity: 1, y: unlocked ? -4 : 0 }}
              transition={{ duration: unlocked ? 1.2 : 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{ filter: `drop-shadow(0 0 26px rgba(${accent},0.4))` }}
            >
              <Mark kind={selected} size={96} />
            </motion.div>

            <motion.h1
              animate={{ opacity: unlocked ? 0 : 1 }}
              className="mt-5 text-[24px] font-bold tracking-[0.11em] text-ink"
              style={{ fontFamily: SERIF }}
            >
              {APP_META[selected].name}
            </motion.h1>
            <motion.p
              animate={{ opacity: unlocked ? 0 : 1 }}
              className="mt-1 font-mono text-[13px] text-faint"
            >
              {APP_META[selected].phonetic}
            </motion.p>
            <motion.p
              animate={{ opacity: unlocked ? 0 : 1 }}
              className="eyebrow mt-2 italic text-mute"
            >
              noun
            </motion.p>
            <motion.p
              animate={{ opacity: unlocked ? 0 : 1 }}
              className="eyebrow mt-1 max-w-[280px] pl-8 -indent-8 text-center"
            >
              {"   "}1. {APP_META[selected].definition}
            </motion.p>

            <motion.form
              onSubmit={submit}
              animate={{ opacity: unlocked ? 0 : 1, y: unlocked ? -10 : 0 }}
              transition={{ duration: 0.5 }}
              className="mt-7 flex w-full flex-col items-center gap-2.5"
              style={{ ["--accent" as string]: `rgba(${accent},0.6)` }}
            >
              <input
                ref={userRef}
                type="text"
                name="login-user"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                placeholder="username"
                value={username}
                disabled={unlocked}
                onChange={(e) => {
                  if (error) setError("");
                  setUsername(e.target.value);
                }}
                className="h-9 w-full max-w-[220px] rounded-lg border border-edge bg-[var(--color-panel)] px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-[var(--accent)]"
                aria-label="Username"
              />
              <input
                type="password"
                name="login-pass"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                placeholder="password"
                value={password}
                disabled={unlocked}
                onChange={(e) => {
                  if (error) setError("");
                  setPassword(e.target.value);
                }}
                className="h-9 w-full max-w-[220px] rounded-lg border border-edge bg-[var(--color-panel)] px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-[var(--accent)]"
                aria-label="Password"
              />
              <button
                type="submit"
                disabled={checking || unlocked}
                className="mt-1 flex h-9 w-[100px] items-center justify-center rounded-lg text-[13px] font-medium lowercase transition-opacity disabled:opacity-50"
                style={{
                  background: `rgba(${accent},0.12)`,
                  color: `rgb(${accent})`,
                  boxShadow: `inset 0 0 0 1px rgba(${accent},0.4)`,
                }}
              >
                {checking ? "verifying…" : "enter"}
              </button>
            </motion.form>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: unlocked ? 0 : 1 }}
                className="mt-4 h-4 font-mono text-[12px]"
                style={{ color: "var(--color-neg)" }}
              >
                {error}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unlock choreography — a bloom + light rings swelling from the mark,
          tinted to the chosen app, then a wash to pure black that hides the
          hard navigation. The app shell fades back out of that same black. */}
      {unlocked && (
        <>
          <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.12, opacity: 0 }}
              animate={{ scale: 3.6, opacity: [0, 0.5, 0] }}
              transition={{ duration: 1.25, ease: "easeOut", times: [0, 0.38, 1] }}
              className="absolute h-[540px] w-[540px] rounded-full"
              style={{
                willChange: "transform, opacity",
                background: `radial-gradient(circle, rgba(255,255,255,0.5) 0%, rgba(${accent},0.18) 38%, rgba(255,255,255,0) 66%)`,
              }}
            />
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 6, opacity: [0, 0.6, 0] }}
              transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1], times: [0, 0.2, 1] }}
              className="absolute h-[160px] w-[160px] rounded-full border"
              style={{ willChange: "transform, opacity", borderColor: `rgba(${accent},0.7)` }}
            />
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 8.5, opacity: [0, 0.4, 0] }}
              transition={{ duration: 1.25, ease: [0.16, 1, 0.3, 1], times: [0, 0.22, 1], delay: 0.16 }}
              className="absolute h-[160px] w-[160px] rounded-full border"
              style={{ willChange: "transform, opacity", borderColor: `rgba(${accent},0.4)` }}
            />
          </div>
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

/** One half of the portal: the giant glyph, its name, and a hover bloom. */
function PortalChoice({
  kind,
  hovered,
  onHover,
  onChoose,
  from,
}: {
  kind: AppKind;
  hovered: AppKind | null;
  onHover: (k: AppKind | null) => void;
  onChoose: (k: AppKind) => void;
  from: number;
}) {
  const meta = APP_META[kind];
  const rgb = ACCENT_RGB[kind];
  const isHot = hovered === kind;
  const dimmed = hovered !== null && !isHot;

  return (
    <motion.button
      type="button"
      onMouseEnter={() => onHover(kind)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(kind)}
      onBlur={() => onHover(null)}
      onClick={() => onChoose(kind)}
      aria-label={`Enter ${meta.name} — ${meta.tagline}`}
      initial={{ opacity: 0, x: from }}
      animate={{ opacity: dimmed ? 0.4 : 1, x: 0 }}
      transition={{
        opacity: { duration: 0.4 },
        x: { type: "spring", stiffness: 120, damping: 18, delay: 0.05 },
      }}
      className="group relative flex flex-1 flex-col items-center justify-center gap-5 rounded-2xl px-8 py-12 outline-none"
    >
      {/* hover bloom */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-[28%] h-56 w-56 rounded-full blur-[70px]"
        style={{ background: `radial-gradient(circle, rgba(${rgb},0.22), transparent 70%)` }}
        animate={{ opacity: isHot ? 1 : 0, scale: isHot ? 1 : 0.6 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />

      <motion.div
        className="relative"
        animate={{ scale: isHot ? 1.08 : 1, y: isHot ? -4 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        style={{ filter: isHot ? `drop-shadow(0 0 28px rgba(${rgb},0.45))` : "none" }}
      >
        <Mark kind={kind} size={128} />
      </motion.div>

      <div className="relative text-center">
        <div
          className="text-[22px] font-bold lowercase tracking-[0.14em] text-ink"
          style={{ fontFamily: SERIF }}
        >
          {meta.name}
        </div>
        <div className="eyebrow mt-1">{meta.tagline}</div>
      </div>

      <motion.div
        className="relative flex items-center gap-1.5 font-mono text-[12px]"
        style={{ color: `rgb(${rgb})` }}
        animate={{ opacity: isHot ? 1 : 0, y: isHot ? 0 : 6 }}
        transition={{ duration: 0.25 }}
      >
        Enter
        <motion.span animate={{ x: isHot ? 3 : 0 }} transition={{ repeat: Infinity, repeatType: "mirror", duration: 0.8 }}>
          →
        </motion.span>
      </motion.div>
    </motion.button>
  );
}
