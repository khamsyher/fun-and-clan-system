import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { ReportRange } from "@/components/report-range";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES } from "@/lib/definitions";
import { formatDate, formatKip, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { getPlatformReport, parseRange } from "@/lib/reports";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.adminTitle };
}

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireRole(...STAFF_ROLES);
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const rt = t.reports;
  const range = parseRange(await searchParams);
  const r = await getPlatformReport(range.valid ? range : { from: range.to, to: range.to });
  const peak = Math.max(1, ...r.months.map((m) => Number(m.fees)));
  const sv = r.savings;

  return (
    <>
      <PageHeading title={rt.adminTitle} lede={rt.adminLede} />
      <ReportRange base="/admin/reports" from={range.from} to={range.to} t={t} valid={range.valid} />

      <p className="mt-6 text-sm font-medium text-ink-soft">
        {fmt(rt.period, { from: formatDate(r.from, locale), to: formatDate(r.to, locale) })}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-soft sm:grid-cols-4">
        <Cell label={rt.colEvents} value={formatNumber(r.totals.events)} />
        <Cell label={rt.colCollected} value={formatKip(r.totals.collected)} />
        <Cell label={rt.colFeesOwed} value={formatKip(r.totals.feesOwed)} />
        <Cell label={rt.colFeesReceived} value={formatKip(r.totals.feesReceived)} strong />
      </dl>

      <Section title={rt.clans}>
        <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[54rem] text-left text-sm">
            <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">{rt.colClan}</th>
                <th className="px-4 py-3 font-medium">{rt.colMode}</th>
                <th className="px-4 py-3 text-right font-medium">{rt.colMembersNow}</th>
                <th className="px-4 py-3 text-right font-medium">{rt.colEvents}</th>
                <th className="px-4 py-3 text-right font-medium">{rt.colUnpaid}</th>
                <th className="px-4 py-3 text-right font-medium">{rt.colCollected}</th>
                <th className="px-4 py-3 text-right font-medium">{rt.colPayout}</th>
                <th className="px-4 py-3 text-right font-medium">{rt.colFeesOwed}</th>
                <th className="px-4 py-3 text-right font-medium">{rt.colFeesReceived}</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-line">
              {r.clans.map((c) => (
                <tr key={c.code}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-xs font-semibold tracking-wide text-brand">{c.code}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{c.fund_mode}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(c.members)}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(c.events)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {c.unpaid > 0 ? (
                      <a href={`#unpaid-${c.code}`} className="font-semibold text-bad underline-offset-2 hover:underline">
                        {formatKip(c.unpaid)}
                      </a>
                    ) : (
                      <span className="text-muted">{formatKip(0)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatKip(c.collected)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatKip(c.paid_out)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-warn">{formatKip(c.fees_owed)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-ok">{formatKip(c.fees_received)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular border-t-2 border-line-strong font-semibold">
              <tr>
                <td className="px-4 py-3">{rt.totals}</td>
                <td />
                <td className="px-4 py-3 text-right">{formatNumber(r.totals.members)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(r.totals.events)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatKip(r.totals.unpaid)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatKip(r.totals.collected)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatKip(r.totals.paidOut)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatKip(r.totals.feesOwed)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatKip(r.totals.feesReceived)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      {/* Who still owes on which event — for following up with each clan's leader. */}
      <Section title={rt.unpaidTitle} aside={r.unpaid.length ? fmt(rt.unpaidAside, { n: r.unpaid.length, total: formatKip(r.totals.unpaid) }) : undefined}>
        <p className="-mt-2 mb-4 max-w-[65ch] text-sm text-ink-soft">{rt.unpaidLede}</p>
        {r.unpaid.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{rt.unpaidNone}</p>
        ) : (
          <div className="space-y-3">
            {r.unpaid.map((clan) => (
              <details key={clan.code} id={`unpaid-${clan.code}`} className="group scroll-mt-24 rounded-xl border border-line bg-surface" open={r.unpaid.length <= 3}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{clan.name}</span>{" "}
                    <span className="text-xs font-semibold tracking-wide text-brand">{clan.code}</span>
                    <span className="block text-xs text-muted">{fmt(rt.unpaidClanLine, { households: clan.households, events: clan.events.length })}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular font-semibold text-bad">{formatKip(clan.total)}</span>
                    <span className="text-ink-soft transition-transform group-open:rotate-90" aria-hidden="true">›</span>
                  </span>
                </summary>
                <div className="space-y-4 border-t border-line px-5 py-4">
                  {clan.events.map((ev) => (
                    <div key={ev.id}>
                      <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium text-ink">
                          {fmt(t.events.eventNo, { n: ev.no })} · {ev.deceased}
                        </span>
                        <span className="text-xs text-muted">
                          {fmt(rt.unpaidEventLine, { n: ev.people.length, total: ev.bills, date: formatDate(ev.reportedAt, locale) })} ·{" "}
                          <span className="tabular font-semibold text-ink">{formatKip(ev.total)}</span>
                        </span>
                      </p>
                      <div className="mt-2 overflow-x-auto rounded-lg border border-line">
                        <table className="w-full min-w-[30rem] text-left text-sm">
                          <thead className="bg-sunken/60 text-xs text-ink-soft">
                            <tr>
                              <th className="px-3 py-2 font-medium">{rt.colMember}</th>
                              <th className="px-3 py-2 font-medium">{rt.colPhone}</th>
                              <th className="px-3 py-2 font-medium">{t.admin.colStatus}</th>
                              <th className="px-3 py-2 text-right font-medium">{rt.colOwes}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {ev.people.map((p) => (
                              <tr key={p.id}>
                                <td className="px-3 py-2">
                                  <Link href={`/admin/users/${p.id}`} className="font-medium text-ink hover:text-brand">
                                    {p.name}
                                  </Link>
                                </td>
                                <td className="tabular px-3 py-2 text-ink-soft">{p.phone}</td>
                                <td className="px-3 py-2">
                                  <span className={`text-xs font-medium ${p.status === "carried" ? "text-bad" : "text-warn"}`}>
                                    {p.status === "carried" ? rt.billCarried : rt.billUnpaid}
                                  </span>
                                </td>
                                <td className="tabular px-3 py-2 text-right whitespace-nowrap text-ink">{formatKip(p.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </Section>

      <Section title={rt.feesByMonth}>
        {r.months.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{t.admin.noFees}</p>
        ) : (
          <ul className="space-y-3 rounded-xl border border-line bg-surface p-5">
            {r.months.map((m) => {
              const fees = Number(m.fees);
              const received = Number(m.received);
              return (
                <li key={m.month} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                  <span className="tabular font-medium text-ink">{m.month}</span>
                  {/* Bar: full length = the month's fees; the darker part is what has been received. */}
                  <span className="relative h-3 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-gold/60" style={{ width: `${(fees / peak) * 100}%` }} />
                    <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${(received / peak) * 100}%` }} />
                  </span>
                  <span className="tabular text-right whitespace-nowrap text-ink">
                    {formatKip(fees)}
                    <span className="block text-xs text-ok">{formatKip(received)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Savings groups: members pay each other directly; the platform's share is the fee. */}
      <Section title={rt.savingsTitle} aside={fmt(rt.savingsAside, { n: sv.totals.groups, fresh: sv.totals.newGroups })}>
        <p className="-mt-2 mb-4 max-w-[65ch] text-sm text-ink-soft">{rt.savingsLede}</p>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          <Cell label={rt.colRoundsDone} value={formatNumber(sv.totals.roundsDone)} />
          <Cell label={rt.colPaidBetween} value={formatKip(sv.totals.paid)} />
          <Cell label={rt.colFeesOwed} value={formatKip(sv.totals.feesOwed)} />
          <Cell label={rt.colFeesReceived} value={formatKip(sv.totals.feesReceived)} strong />
        </dl>

        {sv.groups.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{rt.noSavings}</p>
        ) : (
          <div className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">{t.admin.colGroup}</th>
                  <th className="px-4 py-3 font-medium">{t.savingsAdmin.colOrganizer}</th>
                  <th className="px-4 py-3 font-medium">{t.admin.colStatus}</th>
                  <th className="px-4 py-3 text-right font-medium">{t.savingsAdmin.colMembers}</th>
                  <th className="px-4 py-3 text-right font-medium">{rt.colRoundsDone}</th>
                  <th className="px-4 py-3 text-right font-medium">{rt.colPaidBetween}</th>
                  <th className="px-4 py-3 text-right font-medium">{rt.colFeesOwed}</th>
                  <th className="px-4 py-3 text-right font-medium">{rt.colFeesReceived}</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {sv.groups.map((g) => (
                  <tr key={g.code}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">
                        {g.name}
                        {g.is_new && <span className="ml-2 text-xs font-medium text-gold-deep">{rt.newInPeriod}</span>}
                      </p>
                      <p className="text-xs text-muted">
                        <span className="font-semibold tracking-wide text-brand">{g.code}</span> · {formatKip(g.amount)} {t.savings.period[g.period]}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{g.organizer}</td>
                    <td className={`px-4 py-3 font-medium ${GROUP_TONE[g.status]}`}>{t.savings.groupStatus[g.status]}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(g.members)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatNumber(g.rounds_done)}
                      {Number(g.rounds) > 0 && <span className="text-xs text-muted"> / {g.rounds}</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatKip(g.paid)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-warn">{formatKip(g.fees_owed)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-ok">{formatKip(g.fees_received)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="tabular border-t-2 border-line-strong font-semibold">
                <tr>
                  <td className="px-4 py-3">{rt.totals}</td>
                  <td />
                  <td />
                  <td className="px-4 py-3 text-right">{formatNumber(sv.totals.members)}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(sv.totals.roundsDone)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatKip(sv.totals.paid)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatKip(sv.totals.feesOwed)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatKip(sv.totals.feesReceived)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

const GROUP_TONE = { forming: "text-brand", active: "text-ok", completed: "text-muted", cancelled: "text-bad" } as const;

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`p-4 sm:p-5 ${strong ? "panel-brand text-white" : "bg-surface"}`}>
      <dt className={`text-sm ${strong ? "text-white/75" : "text-ink-soft"}`}>{label}</dt>
      <dd className={`tabular mt-1 font-display text-2xl sm:text-3xl ${strong ? "text-white" : "text-brand-deep"}`}>{value}</dd>
    </div>
  );
}
