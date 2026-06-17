import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COOKIE = "grieve_auth";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** POST /api/auth { pin } — validates against ACCESS_PIN and sets the cookie. */
export async function POST(req: NextRequest) {
  const pin = process.env.ACCESS_PIN;
  if (!pin) return NextResponse.json({ ok: true }); // gate disabled

  let attempt = "";
  try {
    const body = (await req.json()) as { pin?: unknown };
    attempt = String(body.pin ?? "");
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Flat delay keeps brute-forcing a 4-digit space impractically slow.
  await new Promise((r) => setTimeout(r, 400));

  if (attempt !== pin) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const token = createHash("sha256").update(`grieve:${pin}`).digest("hex");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: THIRTY_DAYS,
    path: "/",
  });
  return res;
}
