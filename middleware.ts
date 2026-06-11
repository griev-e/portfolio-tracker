import { NextRequest, NextResponse } from "next/server";

/**
 * PIN gate. Enabled by setting ACCESS_PIN (e.g. in Vercel project env vars);
 * when unset the app is open — so local dev and first deploys never lock you
 * out. The auth cookie stores a SHA-256 of the salted PIN, never the PIN.
 */
const COOKIE = "sanctum_auth";

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const pin = process.env.ACCESS_PIN;
  if (!pin) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const expected = await sha256Hex(`sanctum:${pin}`);
  const authed = req.cookies.get(COOKIE)?.value === expected;

  if (pathname === "/lock") {
    return authed
      ? NextResponse.redirect(new URL("/", req.url))
      : NextResponse.next();
  }
  if (authed) return NextResponse.next();

  // APIs answer 401 instead of redirecting so client fetches fail cleanly.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/lock", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
