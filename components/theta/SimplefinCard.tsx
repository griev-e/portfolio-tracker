"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { useTheta } from "@/lib/theta/store";

type Status = { connected: boolean; syncedAt: string | null };
type Msg = { tone: "ok" | "err"; text: string };

const ERR_TEXT: Record<string, string> = {
  invalid_token: "That doesn't look like a valid setup token. Copy the whole token from the bridge.",
  token_spent: "This setup token was already used. Generate a fresh one on the bridge.",
  not_connected: "No bank is connected yet.",
  unauthorized: "The bank link expired or was revoked. Disconnect and reconnect to refresh it.",
};
const errText = (code: string) => ERR_TEXT[code] ?? "Something went wrong talking to the bridge. Try again.";

function whenSynced(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "never" : d.toLocaleString();
}

export function SimplefinCard({ i = 2 }: { i?: number }) {
  const { enabled, status: authStatus } = useAuth();
  const { applySimplefinSync } = useTheta();

  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "sync" | "disconnect">(null);
  const [msg, setMsg] = useState<Msg | null>(null);

  const signedIn = enabled && authStatus === "authenticated";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/theta/simplefin", { credentials: "same-origin" });
      if (res.ok) setStatus((await res.json()) as Status);
    } catch {
      /* leave status null — the card stays in its default state */
    }
  }, []);

  useEffect(() => {
    if (signedIn) void refresh();
  }, [signedIn, refresh]);

  // Bank sync stores credentials server-side, so it only exists in accounts mode.
  if (!enabled) {
    return (
      <Card className="px-5 py-5" i={i}>
        <CardHeader eyebrow="Bank sync" title="Connect a bank" className="mb-3" />
        <p className="text-[13px] leading-relaxed text-mute">
          Automatic bank sync (via SimpleFIN) needs accounts enabled, since your
          bank link is stored to your account rather than this browser. Set{" "}
          <span className="font-mono text-[12px] text-faint">AUTH_SECRET</span> +{" "}
          <span className="font-mono text-[12px] text-faint">DATABASE_URL</span> and
          sign in to use it. Until then, import a CSV.
        </p>
      </Card>
    );
  }

  async function connect() {
    setBusy("connect");
    setMsg(null);
    try {
      const res = await fetch("/api/theta/simplefin/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ tone: "err", text: errText(String(data?.error ?? "")) });
        return;
      }
      setToken("");
      setMsg({ tone: "ok", text: "Bank connected. Syncing…" });
      await refresh();
      await sync();
    } catch {
      setMsg({ tone: "err", text: errText("") });
    } finally {
      setBusy((b) => (b === "connect" ? null : b));
    }
  }

  async function sync() {
    setBusy("sync");
    try {
      const res = await fetch("/api/theta/simplefin/sync", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ tone: "err", text: errText(String(data?.error ?? "")) });
        return;
      }
      applySimplefinSync({ accounts: data.accounts ?? [], transactions: data.transactions ?? [] });
      setStatus({ connected: true, syncedAt: data.syncedAt ?? null });
      const n = (data.transactions ?? []).length;
      const partial = Array.isArray(data.errors) && data.errors.length > 0;
      setMsg({
        tone: "ok",
        text: `Synced ${data.accounts?.length ?? 0} account${
          (data.accounts?.length ?? 0) === 1 ? "" : "s"
        } and ${n} transaction${n === 1 ? "" : "s"}.${
          partial ? " Some accounts reported issues at the bank." : ""
        }`,
      });
    } catch {
      setMsg({ tone: "err", text: errText("") });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setMsg(null);
    try {
      await fetch("/api/theta/simplefin", { method: "DELETE", credentials: "same-origin" });
      setStatus({ connected: false, syncedAt: null });
      setMsg({ tone: "ok", text: "Bank disconnected. Synced data stays in your ledger." });
    } catch {
      setMsg({ tone: "err", text: errText("") });
    } finally {
      setBusy(null);
    }
  }

  const connected = status?.connected ?? false;

  return (
    <Card className="px-5 py-5" i={i}>
      <CardHeader eyebrow="Bank sync" title="Connect a bank" className="mb-3" />

      {!connected ? (
        <>
          <p className="mb-3 text-[13px] leading-relaxed text-mute">
            Pull balances and transactions automatically through SimpleFIN —
            read-only, and it works with Robinhood. Connect your bank at{" "}
            <a
              href="https://bridge.simplefin.org/"
              target="_blank"
              rel="noreferrer"
              className="text-vio/80 underline-offset-2 transition-colors hover:text-vio hover:underline"
            >
              bridge.simplefin.org
            </a>
            , then paste the <span className="text-ink">setup token</span> it gives you.
          </p>
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            spellCheck={false}
            placeholder="Paste your SimpleFIN setup token…"
            className="h-24 w-full resize-none rounded-lg border border-edge2 bg-panel p-3 font-mono text-[12px] text-ink placeholder:text-faint/60 outline-none transition-colors focus:border-white/30"
          />
          <div className="mt-3">
            <button
              onClick={connect}
              disabled={!signedIn || !token.trim() || busy !== null}
              className="btn-primary disabled:opacity-40"
            >
              {busy === "connect" ? "Connecting…" : "Connect & sync"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-edge bg-white/[0.02] px-3 py-2.5">
            <div>
              <div className="flex items-center gap-2 text-[13px] text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-pos" /> Bank connected
              </div>
              <div className="mt-0.5 text-[11.5px] text-faint">
                Last synced {whenSynced(status?.syncedAt ?? null)}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button onClick={sync} disabled={busy !== null} className="btn-primary disabled:opacity-40">
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </button>
            <button
              onClick={disconnect}
              disabled={busy !== null}
              className="text-[12px] text-faint transition-colors hover:text-neg disabled:opacity-40"
            >
              Disconnect
            </button>
          </div>
        </>
      )}

      {msg && (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-[12.5px] ${
            msg.tone === "ok"
              ? "border-pos/30 bg-pos/10 text-pos"
              : "border-neg/30 bg-neg/10 text-neg"
          }`}
        >
          {msg.text}
        </div>
      )}
    </Card>
  );
}
