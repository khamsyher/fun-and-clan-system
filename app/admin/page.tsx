import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { ArrowRightIcon } from "@/components/icons";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES } from "@/lib/definitions";
import { queryOne } from "@/lib/db";
import { formatKip, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { MonthlyColumns, RankedBars } from "@/components/charts";
import { membersByClan, moneyInByMonth, newAccountsByMonth } from "@/lib/dashboard-charts";
import { countPeople } from "@/lib/users";
import { PeopleCard } from "./people-card";
import { Stat } from "./stat";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).admin.metaTitle };
}

/** The platform at a glance. Clans, the fund and users each have their own page for the work itself. */
export default async function AdminPage() {
  await requireRole(...STAFF_ROLES);
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  // The trends below: last 12 months, and the largest clans.
  const [moneyIn, accounts, clanSizes] = await Promise.all([moneyInByMonth(locale), newAccountsByMonth(locale), membersByClan()]);
  const a = t.admin;

  const [totals, settings, money, counts, savings] = await Promise.all([
    queryOne<{ clans: string; active_clans: string; no_leader: string; members: string; pending: string; leader_requests: string }>(
      `SELECT (SELECT COUNT(*) FROM clans) AS clans,
              (SELECT COUNT(*) FROM clan_leader_requests WHERE status = 'pending') AS leader_requests,
              (SELECT COUNT(*) FROM clans WHERE is_active) AS active_clans,
              (SELECT COUNT(*) FROM clans c WHERE c.is_active AND NOT EXISTS (
                 SELECT 1 FROM users u WHERE u.clan_id = c.id AND u.role = 'clan_admin' AND u.status = 'active')) AS no_leader,
              (SELECT COUNT(*) FROM users WHERE role = 'member' AND status = 'active') AS members,
              (SELECT COUNT(*) FROM users WHERE role = 'member' AND status = 'pending') AS pending`,
    ),
    queryOne<{ platform_fee_percent: string }>(`SELECT platform_fee_percent FROM platform_settings WHERE id = 1`),
    // Statistics only: totals across clans, no access to any clan's fund operations.
    queryOne<{ events: string; collecting: string; collected: string; owed: string; received: string; owed_count: string }>(
      `SELECT (SELECT COUNT(*) FROM death_events WHERE status <> 'cancelled') AS events,
              (SELECT COUNT(*) FROM death_events WHERE status = 'collecting') AS collecting,
              (SELECT COALESCE(SUM(amount), 0) FROM fund_ledger WHERE entry_type IN ('collection', 'debt_collection', 'contribution', 'deposit', 'adjustment')) AS collected,
              (SELECT COALESCE(SUM(fee_amount), 0) FROM platform_fees WHERE status = 'owed') AS owed,
              (SELECT COALESCE(SUM(fee_amount), 0) FROM platform_fees WHERE status = 'received') AS received,
              (SELECT COUNT(*) FROM platform_fees WHERE status = 'owed') AS owed_count`,
    ),
    countPeople(),
    queryOne<{ groups: string; active: string; people: string }>(
      `SELECT (SELECT COUNT(*) FROM savings_groups) AS groups,
              (SELECT COUNT(*) FROM savings_groups WHERE status IN ('forming', 'active')) AS active,
              (SELECT COUNT(DISTINCT user_id) FROM savings_members WHERE status = 'approved') AS people`,
    ),
  ]);

  const fee = settings?.platform_fee_percent ?? "1.50";

  return (
    <>
      <PageHeading title={a.title} lede={a.lede} />

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-soft sm:grid-cols-4">
        <Stat label={a.statClans} value={formatNumber(totals?.clans ?? 0)} note={fmt(a.statClansNote, { n: formatNumber(totals?.active_clans ?? 0) })} />
        <Stat label={a.statMembers} value={formatNumber(totals?.members ?? 0)} note={a.statMembersNote} />
        <Stat label={a.statPending} value={formatNumber(totals?.pending ?? 0)} note={a.statPendingNote} />
        <Stat label={a.statFee} value={`${Number(fee)}%`} note={a.statFeeNote} highlight />
      </dl>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        <Stat label={a.statEvents} value={formatNumber(money?.events ?? 0)} note={fmt(a.statEventsNote, { n: formatNumber(money?.collecting ?? 0) })} />
        <Stat label={a.statCollected} value={formatKip(money?.collected ?? 0)} note={a.statCollectedNote} />
        <Stat label={a.feesOwed} value={formatKip(money?.owed ?? 0)} note={a.feesTitle} />
        <Stat label={a.feesReceived} value={formatKip(money?.received ?? 0)} note={a.feesTitle} />
      </dl>

      <Section title={t.charts.title} aside={t.charts.aside}>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title={t.charts.moneyTitle} note={t.charts.moneyNote}>
            <MonthlyColumns points={moneyIn} kind="kip" caption={t.charts.moneyTitle} />
          </ChartCard>
          <ChartCard title={t.charts.accountsTitle} note={t.charts.accountsNote}>
            <MonthlyColumns points={accounts} kind="count" caption={t.charts.accountsTitle} />
          </ChartCard>
          <div className="lg:col-span-2">
            <ChartCard title={t.charts.clansTitle} note={t.charts.clansNote}>
              <RankedBars rows={clanSizes} hrefBase="/admin/clans/" empty={t.admin.noClans} />
            </ChartCard>
          </div>
        </div>
      </Section>

      {/* Where the work is: each card opens the page for it, with what needs attention. */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AreaCard
          href="/admin/clans"
          title={t.clansAdmin.title}
          body={t.clansAdmin.cardBody}
          alert={
            Number(totals?.leader_requests ?? 0) > 0
              ? fmt(t.leaderRequests.cardWaiting, { n: totals?.leader_requests ?? 0 })
              : Number(totals?.no_leader ?? 0) > 0
                ? fmt(t.clansAdmin.cardNoLeader, { n: totals?.no_leader ?? 0 })
                : null
          }
        />
        <AreaCard
          href="/admin/fund"
          title={t.fundAdmin.title}
          body={t.fundAdmin.cardBody}
          alert={Number(money?.owed_count ?? 0) > 0 ? fmt(t.fundAdmin.cardOwed, { n: money?.owed_count ?? 0 }) : null}
        />
        <AreaCard
          href="/admin/savings"
          title={t.savingsAdmin.title}
          body={fmt(t.savingsAdmin.cardBody, { groups: savings?.groups ?? 0, active: savings?.active ?? 0, people: savings?.people ?? 0 })}
          alert={null}
        />
      </div>

      <Section
        title={a.usersTitle}
        aside={
          <Link href="/admin/users" className="inline-flex items-center gap-1.5 font-semibold text-brand hover:text-brand-bright">
            {a.manageUsers}
            <ArrowRightIcon width={16} height={16} />
          </Link>
        }
      >
        {/* One card per kind of account; each opens that part of the user list. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <PeopleCard label={a.filterAll} value={counts?.everyone ?? 0} href="/admin/users" />
          <PeopleCard label={a.filterLeaders} value={counts?.leaders ?? 0} href="/admin/users?people=leaders" />
          <PeopleCard label={a.filterMembers} value={counts?.members ?? 0} href="/admin/users?people=members" />
          <PeopleCard label={a.filterGeneral} value={counts?.general ?? 0} href="/admin/users?people=general" />
          <PeopleCard label={a.filterWaiting} value={counts?.waiting ?? 0} href="/admin/users?people=waiting" tone="warn" />
        </div>
      </Section>
    </>
  );
}

function AreaCard({ href, title, body, alert }: { href: string; title: string; body: string; alert: string | null }) {
  return (
    <Link href={href} className="group flex items-start justify-between gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-brand-bright">
      <span>
        <span className="block font-display text-xl text-brand-deep">{title}</span>
        <span className="mt-1 block text-sm text-ink-soft">{body}</span>
        {alert && <span className="mt-2 inline-block rounded-full bg-warn-wash px-2.5 py-0.5 text-xs font-medium text-warn">{alert}</span>}
      </span>
      <ArrowRightIcon width={18} height={18} className="mt-1 shrink-0 text-brand transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** One chart with its title (which names the single series, so no legend is needed). */
function ChartCard({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-0.5 mb-4 text-xs text-muted">{note}</p>
      {children}
    </div>
  );
}
