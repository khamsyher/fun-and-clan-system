import type { ReactNode } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { getT } from "@/lib/i18n/server";
import type { CurrentUser } from "@/lib/dal";
import { BrandName } from "./brand";
import { LogoutIcon } from "./icons";
import { LanguageSwitcher } from "./language-switcher";
import { NotificationBell } from "./notification-bell";
import { getLocale } from "@/lib/i18n/server";
import { renderNotification } from "@/lib/notification-text";
import { listNotifications, unreadCount } from "@/lib/notify";
import { countPendingKyc } from "@/lib/kyc";
import { AreaNav } from "./area-nav";
import { areasFor } from "@/lib/navigation";
export async function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const [t, locale, recent, unread, kycWaiting] = await Promise.all([
    getT(),
    getLocale(),
    listNotifications(user.id, 8),
    unreadCount(user.id),
    user.role === "super_admin" ? countPendingKyc() : 0,
  ]);
  const initials = user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <BrandName />
            {user.clanName && (
              <span className="hidden min-w-0 truncate border-l border-line-strong pl-4 text-sm text-ink-soft md:block">
                {user.clanName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="sm:hidden">
              <LanguageSwitcher tone="compact" />
            </div>
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <NotificationBell items={recent.map((n) => renderNotification(n, t, locale))} unread={unread} />
            {/* Account left the tabs when they became feature areas, so the whole name block leads there. */}
            <Link href="/account" aria-label={t.nav.account} className="group flex items-center gap-3 rounded-full">
              <span className="hidden text-right leading-tight lg:block">
                <span className="block text-sm font-medium text-ink">{user.fullName}</span>
                <span className="block text-xs text-muted group-hover:text-brand">{t.nav.account}</span>
              </span>
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
        </div>
        <div className="mx-auto max-w-6xl px-2 sm:px-4">
          <AreaNav areas={areasFor(user, t, { kycWaiting })} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
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
