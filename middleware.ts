import NextAuth from "next-auth";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import { authConfig } from "@/auth.config";

/**
 * Auth gate. Real username/password sessions (NextAuth) replace the old PIN.
 *
 * Gated only when accounts are fully configured (AUTH_SECRET + DATABASE_URL).
 * When either is unset the app is fully open (single-user, localStorage),
 * exactly as before — so local dev and first deploys never lock anyone out,
 * honoring the app's graceful-degradation rule.
 * We short-circuit to `next()` *before* touching NextAuth, which would throw
 * without a secret.
 *
 * Uses the edge-safe `auth.config.ts` (no bcrypt / DB) so it stays edge-fast;
 * the session is a JWT decoded here with AUTH_SECRET.
 */
const { auth } = NextAuth(authConfig);

// `auth(handler)` is callable as Next middleware at runtime; its public type is
// the route-handler overload, so we narrow it to the middleware signature.
const gate = auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = !!req.auth?.user;

  // NextAuth's own endpoints and the portal are always reachable.
  if (pathname.startsWith("/api/auth") || pathname === "/lock") {
    if (isAuthed && pathname === "/lock") {
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (isAuthed) return NextResponse.next();

  // APIs answer 401 so client fetches fail cleanly; pages go to the portal.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/lock", req.nextUrl));
}) as unknown as (
  req: NextRequest,
  ev: NextFetchEvent
) => Promise<Response> | Response;

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  // Open mode unless accounts are fully configured (a half-configured deploy
  // would gate the app but be unable to authenticate anyone).
  if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL) {
    return NextResponse.next();
  }
  return gate(req, ev);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
