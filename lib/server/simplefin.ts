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
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { SfResponse } from "@/lib/theta/simplefin";

const TIMEOUT_MS = 12_000;

/**
 * SSRF guard. A SimpleFIN setup token decodes to a bridge URL and the claim
 * returns an access URL — both are attacker-influenceable (a self-hosted bridge
 * is legitimate under the protocol), so before fetching either we require https
 * AND that the host does not resolve to a private / loopback / link-local range.
 * Without this, an authenticated user could point the server at internal
 * services (metadata endpoints, VPC APIs) and read the mapped response via sync.
 *
 * Residual: this resolves-then-connects, so a DNS-rebind between the check and
 * fetch could still slip through — accepted here, but it closes the direct
 * internal-target hole. `fetch` in Node does not expose a resolved-IP pin.
 */
function isBlockedIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast / reserved
  );
}

function isBlockedIPv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fe80") || s.startsWith("fc") || s.startsWith("fd")) return true; // link-local / ULA
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}

const isBlockedAddress = (ip: string): boolean =>
  isIP(ip) === 6 ? isBlockedIPv6(ip) : isBlockedIPv4(ip);

async function assertPublicHttps(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("blocked_url");
  }
  if (u.protocol !== "https:") throw new Error("blocked_url");
  const host = u.hostname;
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new Error("blocked_url");
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error("blocked_url");
  }
  if (addrs.length === 0 || addrs.some((a) => isBlockedAddress(a.address))) {
    throw new Error("blocked_url");
  }
}

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
  await assertPublicHttps(url);
  const res = await withTimeout(url, { method: "POST", headers: { ...headers, "Content-Length": "0" } });
  if (!res.ok) throw new Error(res.status === 403 ? "token_spent" : "claim_failed");
  const accessUrl = (await res.text()).trim();
  if (!/^https:\/\/\S+$/i.test(accessUrl)) throw new Error("claim_failed");
  // The access URL is what we persist and later fetch — vet its host too.
  await assertPublicHttps(splitCredentials(accessUrl).url);
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
  await assertPublicHttps(base);
  const url = `${base.replace(/\/$/, "")}/accounts?start-date=${start}&pending=1`;
  const res = await withTimeout(url, { method: "GET", headers });
  if (res.status === 401 || res.status === 403) throw new Error("unauthorized");
  if (!res.ok) throw new Error("fetch_failed");
  const data = (await res.json()) as SfResponse;
  return { errors: data.errors ?? [], accounts: data.accounts ?? [] };
}
