import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Clears a session cookie that is still signed but no longer valid (password changed,
 * account or clan disabled). Without this, proxy.ts would keep bouncing between the
 * dashboard and /login because it only sees the cookie.
 */
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.nextUrl));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
