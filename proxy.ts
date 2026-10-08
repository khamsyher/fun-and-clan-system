import { NextResponse, type NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/session";
import { ROLE_HOME, type Role } from "@/lib/definitions";

// Optimistic checks from the cookie only (no DB). Pages re-check against the
// database through lib/dal.ts, which is the real security boundary.
const ROLE_AREAS: { prefix: string; role: Role }[] = [
  { prefix: "/admin", role: "super_admin" },
  { prefix: "/clan", role: "clan_admin" },
  { prefix: "/member", role: "member" },
];
const SIGNED_IN = ["/account", "/files", "/donations", "/notifications"];
const GUEST_ONLY = ["/login", "/register"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value);

  const area = ROLE_AREAS.find((a) => path === a.prefix || path.startsWith(`${a.prefix}/`));
  if (area) {
    if (!session) return NextResponse.redirect(new URL("/login", req.nextUrl));
    if (session.role !== area.role) {
      return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.nextUrl));
    }
  }

  if (!session && SIGNED_IN.some((p) => path === p || path.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (session && (path === "/" || GUEST_ONLY.includes(path))) {
    // Already signed in and following a shared link: go where the link pointed.
    const next = req.nextUrl.searchParams.get("next") ?? "";
    const safe = next.startsWith("/") && !next.startsWith("//");
    return NextResponse.redirect(new URL(safe ? next : ROLE_HOME[session.role], req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
