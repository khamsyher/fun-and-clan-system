import type { ReactNode } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { getT } from "@/lib/i18n/server";
import type { CurrentUser } from "@/lib/dal";
import { BrandName } from "./brand";
import { LogoutIcon } from "./icons";
import { LanguageSwitcher } from "./language-switcher";
import { NavTabs, type NavItem } from "./nav-tabs";
import type { Dictionary } from "@/lib/i18n/config";
function navFor(user: CurrentUser, t: Dictionary): NavItem[] {
  const account = { href: "/account", label: t.nav.account };
  if (user.role === "super_admin")
    return [{ href: "/admin", label: t.nav.overview }, { href: "/admin/reports", label: t.nav.reports }, account];
  if (user.role === "clan_admin")
    return [
      { href: "/clan", label: t.nav.overview },
      { href: "/clan/events", label: t.nav.events },
      { href: "/clan/slips", label: t.nav.slips },
      ...(user.clanFundMode === "A" ? [{ href: "/clan/contributions", label: t.nav.contributions }] : []),
      { href: "/clan/fund", label: t.nav.fund },
      { href: "/clan/reports", label: t.nav.reports },
      { href: "/clan/settings", label: t.nav.settings },
      account,
    ];
  return [
    { href: "/member", label: t.nav.overview },
    { href: "/member/events", label: t.nav.events },
    { href: "/member/payments", label: t.nav.payments },
    { href: "/member/family", label: t.nav.family },
    ...(user.isTreasurer ? [{ href: "/member/approvals", label: t.nav.approvals }] : []),
    account,
  ];
}

export async function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const t = await getT();
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
            <div className="hidden text-right leading-tight lg:block">
              <p className="text-sm font-medium text-ink">{user.fullName}</p>
              <p className="text-xs text-muted">{t.roles[user.role]}</p>
            </div>
            <Link
              href="/account"
              aria-label={t.nav.account}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white ring-2 ring-gold/40 ring-offset-2 ring-offset-paper transition-transform hover:scale-105"
            >
              {initials}
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
          <NavTabs items={navFor(user, t)} />
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
