import type { ReactNode } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { getT } from "@/lib/i18n/server";
import type { CurrentUser } from "@/lib/dal";
import { ROLE_HOME, isStaffRole } from "@/lib/definitions";
import { BrandName } from "./brand";
import { ChatIcon, LogoutIcon } from "./icons";
import { LanguageSwitcher } from "./language-switcher";
import { NotificationBell } from "./notification-bell";
import { getLocale } from "@/lib/i18n/server";
import { renderNotification } from "@/lib/notification-text";
import { listNotifications, unreadCount } from "@/lib/notify";
import { countPendingKyc, myKycState } from "@/lib/kyc";
import { needsIdentityCheck } from "@/lib/access";
import { countPendingLeaderRequests } from "@/lib/leader-requests";
import { countPendingPolicies } from "@/lib/policies";
import { unreadForUser, unreadThreadsForStaff } from "@/lib/support";
import { MobileNav, SideNav } from "./side-nav";
import { areasFor } from "@/lib/navigation";
export async function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const staff = isStaffRole(user.role);
  const [t, locale, recent, unread, kycWaiting, leaderRequests, policiesWaiting, supportUnread] = await Promise.all([
    getT(),
    getLocale(),
    listNotifications(user.id, 8),
    unreadCount(user.id),
    isStaffRole(user.role) ? countPendingKyc() : 0,
    isStaffRole(user.role) ? countPendingLeaderRequests() : 0,
    isStaffRole(user.role) ? countPendingPolicies() : 0,
    // Staff: conversations waiting on them. Everyone else: replies they haven't read.
    staff ? unreadThreadsForStaff() : unreadForUser(user.id),
  ]);
  // Not verified yet: a warning beside their name until they are (staff are never asked).
  const identity = needsIdentityCheck(user) && !user.kycApproved ? await myKycState(user.id) : "approved";
  const identityLine =
    identity === "none" ? t.kyc.headerAction : identity === "rejected" ? t.kyc.headerRejected : identity === "pending" ? t.kyc.headerWaiting : null;
  const initials = user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const areas = areasFor(user, t, { kycWaiting, leaderRequests: leaderRequests + policiesWaiting, supportUnread });

  const controls = (
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="sm:hidden">
              <LanguageSwitcher tone="compact" />
            </div>
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <Link
              href={staff ? "/admin/support" : "/support"}
              aria-label={supportUnread ? `${t.support.title} (${supportUnread})` : t.support.title}
              title={t.support.title}
              className="relative flex size-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
            >
              <ChatIcon width={20} height={20} />
              {supportUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[0.65rem] font-semibold text-white tabular">
                  {supportUnread > 9 ? "9+" : supportUnread}
                </span>
              )}
            </Link>
            <NotificationBell items={recent.map((n) => renderNotification(n, t, locale))} unread={unread} />
            {/* Account left the tabs when they became feature areas, so the whole name block leads there. */}
            <Link
              href={identityLine ? "/account#identity" : "/account"}
              aria-label={identityLine ? `${t.nav.account} — ${identityLine}` : t.nav.account}
              title={identityLine ?? undefined}
              className="group flex items-center gap-3 rounded-full"
            >
              <span className="hidden text-right leading-tight lg:block">
                <span className="block text-sm font-medium text-ink">{user.fullName}</span>
                {identityLine ? (
                  <span className={`block text-xs font-medium ${identity === "pending" ? "text-brand" : "text-warn"} group-hover:underline`}>
                    {identityLine}
                  </span>
                ) : (
                  <span className="block text-xs text-muted group-hover:text-brand">{t.nav.account}</span>
                )}
              </span>
              <span className="relative shrink-0">
              <span
                className={`flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold ring-2 ring-gold/40 ring-offset-2 ring-offset-paper transition-transform group-hover:scale-105 ${
                  user.photoFileId ? "bg-sunken" : "bg-brand text-white"
                }`}
              >
                {user.photoFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private upload, served with an auth check
                  <img src={`/files/${user.photoFileId}`} alt="" className="size-full object-cover" />
                ) : (
                  initials
                )}
              </span>
              {/* The badge stays visible on phones, where the line under the name is hidden. */}
              {identityLine && (
                <span
                  aria-hidden="true"
                  className={`absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[0.65rem] leading-none font-bold text-white ring-2 ring-paper ${
                    identity === "pending" ? "bg-brand-bright" : "bg-warn"
                  }`}
                >
                  {identity === "pending" ? "…" : "!"}
                </span>
              )}
              </span>
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
              >
                <LogoutIcon width={18} height={18} />
                <span className="sr-only lg:not-sr-only">{t.common.signOut}</span>
              </button>
            </form>
          </div>
  );

  // Everyone's menu is a sidebar: each area a titled group of its pages (or one link when it has
  // a single page). Fixed on large screens; a slide-in drawer behind a menu button on small ones.
  const home = ROLE_HOME[user.role];
  const clanLine = user.clanName && (
    <p className="mt-0.5 truncate text-xs text-ink-soft" title={user.clanName}>
      {user.clanName}
    </p>
  );
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex min-h-16 shrink-0 flex-col justify-center border-b border-line px-5 py-3">
          <Link href={home}>
            <BrandName />
          </Link>
          {clanLine}
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <SideNav areas={areas} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {/* Solid, not blurred: a backdrop filter would trap the drawer (position: fixed) inside the header. */}
        <header className="sticky top-0 z-20 border-b border-line bg-paper">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <MobileNav
                areas={areas}
                brand={
                  <div className="min-w-0">
                    <BrandName />
                    {clanLine}
                  </div>
                }
              />
              <Link href={home} className="min-w-0">
                <BrandName />
              </Link>
            </div>
            <div className="hidden lg:block" />
            {controls}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      </div>
    </div>
  );
}

export function PageHeading({ title, lede, children }: { title: string; lede?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl tracking-[-0.02em] text-brand-deep sm:text-4xl">{title}</h1>
        {lede && <p className="mt-2 max-w-[65ch] text-ink-soft">{lede}</p>}
      </div>
      {children}
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-12 min-w-0">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {aside && <div className="text-sm text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
