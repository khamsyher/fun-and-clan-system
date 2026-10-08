import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { StatusBadge } from "@/components/badge";
import { ArrowRightIcon } from "@/components/icons";
import { ResetPasswordButton } from "@/components/reset-password";
import { requireRole } from "@/lib/dal";
import { query, queryOne } from "@/lib/db";
import { formatDate, formatKip, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { markFeeReceived, setClanActive } from "@/app/actions/admin";
import { Pill } from "@/components/badge";
import { CreateClanForm, PlatformFeeForm } from "./forms";
import { countPeople } from "@/lib/users";
import { PeopleCard } from "./people-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).admin.metaTitle };
}

type ClanRow = {
  id: string;
  code: string;
  name: string;
  fund_mode: "A" | "B";
  contribution_amount: string;
  is_active: boolean;
  created_at: Date;
  leader: string | null;
  leader_id: string | null;
  members: string;
  pending: string;
};

export default async function AdminPage() {
  await requireRole("super_admin");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const a = t.admin;

  const [clans, totals, settings, money, fees, counts] = await Promise.all([
    query<ClanRow>(
      `SELECT c.id, c.code, c.name, c.fund_mode, c.contribution_amount, c.is_active, c.created_at,
              l.full_name AS leader, l.id AS leader_id,
              COUNT(u.id) FILTER (WHERE u.status = 'active') AS members,
              COUNT(u.id) FILTER (WHERE u.status = 'pending') AS pending
         FROM clans c
         LEFT JOIN LATERAL (
           SELECT id, full_name FROM users WHERE clan_id = c.id AND role = 'clan_admin' ORDER BY created_at LIMIT 1
         ) l ON TRUE
         LEFT JOIN users u ON u.clan_id = c.id AND u.role = 'member'
        GROUP BY c.id, l.id, l.full_name
        ORDER BY c.created_at DESC`,
    ),
    queryOne<{ clans: string; active_clans: string; members: string; pending: string }>(
      `SELECT (SELECT COUNT(*) FROM clans) AS clans,
              (SELECT COUNT(*) FROM clans WHERE is_active) AS active_clans,
              (SELECT COUNT(*) FROM users WHERE role = 'member' AND status = 'active') AS members,
              (SELECT COUNT(*) FROM users WHERE role = 'member' AND status = 'pending') AS pending`,
    ),
    queryOne<{ platform_fee_percent: string }>(`SELECT platform_fee_percent FROM platform_settings WHERE id = 1`),
    // Statistics only: totals across clans, no access to any clan's fund operations.
    queryOne<{ events: string; collecting: string; collected: string; owed: string; received: string }>(
      `SELECT (SELECT COUNT(*) FROM death_events WHERE status <> 'cancelled') AS events,
              (SELECT COUNT(*) FROM death_events WHERE status = 'collecting') AS collecting,
              (SELECT COALESCE(SUM(amount), 0) FROM fund_ledger WHERE entry_type IN ('collection', 'debt_collection', 'contribution', 'deposit', 'adjustment')) AS collected,
              (SELECT COALESCE(SUM(fee_amount), 0) FROM platform_fees WHERE status = 'owed') AS owed,
              (SELECT COALESCE(SUM(fee_amount), 0) FROM platform_fees WHERE status = 'received') AS received`,
    ),
    query<{ id: string; clan_name: string; event_no: number; percent: string; base_amount: string; fee_amount: string; status: "owed" | "received"; created_at: Date }>(
      `SELECT f.id, c.name AS clan_name, e.event_no, f.percent, f.base_amount, f.fee_amount, f.status, f.created_at
         FROM platform_fees f JOIN clans c ON c.id = f.clan_id JOIN death_events e ON e.id = f.event_id
        ORDER BY (f.status = 'owed') DESC, f.created_at DESC
        LIMIT 50`,
    ),
    countPeople(),
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

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
        <Section title={a.clans} aside={fmt(a.total, { n: clans.length })}>
          {clans.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
              <p className="font-medium text-ink">{a.noClans}</p>
              <p className="mt-1 text-sm text-ink-soft">{a.noClansBody}</p>
            </div>
          ) : (
            <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                  <tr>
                    <th className="px-4 py-3 font-medium">{a.colClan}</th>
                    <th className="px-4 py-3 font-medium">{a.colLeader}</th>
                    <th className="px-4 py-3 text-right font-medium">{a.colMembers}</th>
                    <th className="px-4 py-3 font-medium">{a.colRate}</th>
                    <th className="px-4 py-3 font-medium">{a.colStatus}</th>
                    <th className="px-4 py-3"><span className="sr-only">{a.colActions}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {clans.map((c) => (
                    <tr key={c.id} className="align-middle">
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-ink">{c.name}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          <span className="font-semibold tracking-[0.06em] text-brand">{c.code}</span> ·{" "}
                          {fmt(a.since, { date: formatDate(c.created_at, locale) })}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-ink-soft">
                        {c.leader ?? "—"}
                        {c.leader_id && c.leader && (
                          <div className="-ml-2.5 mt-1">
                            <ResetPasswordButton userId={c.leader_id} name={c.leader} />
                          </div>
                        )}
                      </td>
                      <td className="tabular px-4 py-3.5 text-right">
                        {formatNumber(c.members)}
                        {Number(c.pending) > 0 && <span className="block text-xs text-warn">{fmt(a.waiting, { n: c.pending })}</span>}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-ink-soft">
                        <span className="tabular">{formatKip(c.contribution_amount)}</span>
                        <span className="block text-xs text-muted">{fmt(a.mode, { m: c.fund_mode })}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={c.is_active ? "enabled" : "off"} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <form action={setClanActive}>
                          <input type="hidden" name="clanId" value={c.id} />
                          <input type="hidden" name="active" value={String(!c.is_active)} />
                          <button
                            type="submit"
                            className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                              c.is_active ? "text-bad hover:bg-bad-wash" : "text-ok hover:bg-ok-wash"
                            }`}
                          >
                            {c.is_active ? a.disable : a.enable}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

          <Section title={a.feesTitle}>
            {fees.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{a.noFees}</p>
            ) : (
              <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                    <tr>
                      <th className="px-4 py-3 font-medium">{a.colEvent}</th>
                      <th className="px-4 py-3 text-right font-medium">{a.colBase}</th>
                      <th className="px-4 py-3 text-right font-medium">{a.colFee}</th>
                      <th className="px-4 py-3 font-medium">{a.colStatus}</th>
                      <th className="px-4 py-3"><span className="sr-only">{a.markReceived}</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {fees.map((f) => (
                      <tr key={f.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{f.clan_name}</p>
                          <p className="text-xs text-muted">{fmt(t.events.eventNo, { n: f.event_no })} · {formatDate(f.created_at, locale)}</p>
                        </td>
                        <td className="tabular px-4 py-3 text-right text-ink-soft">{formatKip(f.base_amount)}</td>
                        <td className="tabular px-4 py-3 text-right font-semibold text-ink">
                          {formatKip(f.fee_amount)}
                          <span className="block text-xs font-normal text-muted">{Number(f.percent)}%</span>
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={f.status === "owed" ? "warn" : "ok"}>{a.feeStatus[f.status]}</Pill>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {f.status === "owed" && (
                            <form action={markFeeReceived}>
                              <input type="hidden" name="feeId" value={f.id} />
                              <button type="submit" className="rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-ok hover:bg-ok-wash">
                                {a.markReceived}
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title={a.newClan}>
            <div className="rounded-xl border border-line bg-surface p-5">
              <CreateClanForm />
            </div>
          </Section>
          <Section title={a.feeTitle}>
            <div className="rounded-xl border border-line bg-surface p-5">
              <PlatformFeeForm current={fee} />
            </div>
          </Section>
        </div>
      </div>

    </>
  );
}

function Stat({ label, value, note, highlight }: { label: string; value: string; note: string; highlight?: boolean }) {
  return (
    <div className={`p-4 sm:p-5 ${highlight ? "panel-brand text-white" : "bg-surface"}`}>
      <dt className={`text-sm ${highlight ? "text-white/75" : "text-ink-soft"}`}>{label}</dt>
      <dd className={`tabular mt-1 font-display text-3xl ${highlight ? "text-white" : "text-brand-deep"}`}>{value}</dd>
      <dd className={`mt-0.5 text-xs ${highlight ? "text-white/65" : "text-muted"}`}>{note}</dd>
    </div>
  );
}
