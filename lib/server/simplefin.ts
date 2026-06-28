/**
 * SimpleFIN Bridge client (server-only).
 *
 * SimpleFIN is a read-only bank-aggregation protocol. The user connects their
 * bank at a bridge (bridge.simplefin.org by default), which hands them a
 * one-time **setup token** — a base64-encoded *claim URL*. We POST that claim
 * URL exactly once to exchange it for a durable **access URL** that embeds
 * HTTP-Basic credentials; from then on a GET to `${accessUrl}/accounts` returns
 * balances + transactions.
 *
 * The access URL is a secret (it *is* the credential) and is stored per-user in
 * the DB, read only here. Nothing in this module is ever imported by client
 * code — the /api/theta/simplefin routes are the only callers.
 *
 * Protocol: https://www.simplefin.org/protocol.html
 */
import type { SfResponse } from "@/lib/theta/simplefin";

const TIMEOUT_MS = 12_000;

/**
 * The Fetch API (browser and Node's `undici`-backed `fetch`) refuses to
 * construct a `Request` from a URL that embeds `user:pass@` credentials —
 * but that's exactly the shape of a SimpleFIN access URL. Strip any userinfo
 * out of the URL and carry it instead as an explicit `Authorization: Basic`
 * header, which is what the Bridge actually expects.
 */
export function splitCredentials(rawUrl: string): { url: string; headers: Record<string, string> } {
  const u = new URL(rawUrl);
  if (!u.username && !u.password) return { url: u.toString(), headers: {} };
  const user = decodeURIComponent(u.username);
  const pass = decodeURIComponent(u.password);
  u.username = "";
  u.password = "";
  return {
    url: u.toString(),
    headers: { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` },
  };
}

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** A claim URL must be an https bridge endpoint; reject anything else. */
function decodeSetupToken(token: string): string {
  const trimmed = token.trim();
  let claimUrl: string;
  try {
    claimUrl = Buffer.from(trimmed, "base64").toString("utf8").trim();
  } catch {
    throw new Error("invalid_token");
  }
  if (!/^https:\/\/\S+$/i.test(claimUrl)) throw new Error("invalid_token");
  return claimUrl;
}

/**
 * Exchange a setup token for a durable access URL. One-time: the claim URL is
 * spent on first use, so callers persist the returned access URL.
 */
export async function claimSetupToken(token: string): Promise<string> {
  const claimUrl = decodeSetupToken(token);
  const { url, headers } = splitCredentials(claimUrl);
  const res = await withTimeout(url, { method: "POST", headers: { ...headers, "Content-Length": "0" } });
  if (!res.ok) throw new Error(res.status === 403 ? "token_spent" : "claim_failed");
  const accessUrl = (await res.text()).trim();
  if (!/^https:\/\/\S+$/i.test(accessUrl)) throw new Error("claim_failed");
  return accessUrl;
}

/**
 * Pull accounts + transactions since `startDate` (a Date). The access URL's
 * credentials are split off into an Authorization header before the request
 * is built (see `splitCredentials`). Pending transactions are requested so
 * they show up before they post.
 */
export async function fetchAccounts(accessUrl: string, startDate: Date): Promise<SfResponse> {
  const start = Math.floor(startDate.getTime() / 1000);
  const { url: base, headers } = splitCredentials(accessUrl);
  const url = `${base.replace(/\/$/, "")}/accounts?start-date=${start}&pending=1`;
  const res = await withTimeout(url, { method: "GET", headers });
  if (res.status === 401 || res.status === 403) throw new Error("unauthorized");
  if (!res.ok) throw new Error("fetch_failed");
  const data = (await res.json()) as SfResponse;
  return { errors: data.errors ?? [], accounts: data.accounts ?? [] };
}
