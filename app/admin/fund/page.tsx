import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { markFeeReceived } from "@/app/actions/admin";
import { requireRole } from "@/lib/dal";
import { query, queryOne } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/definitions";
import { formatDate, formatKip, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { PlatformFeeForm } from "../forms";
import { Stat } from "../stat";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).fundAdmin.title };
}

type ClanFund = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  fund_mode: "A" | "B";
  balance: string;
  collected: string;
  paid_out: string;
  unpaid: string;
  fees_owed: string;
  open_events: string;
};

type Fee = {
  id: string;
  clan_id: string;
  clan_name: string;
  event_no: number;
  percent: string;
  base_amount: string;
  fee_amount: string;
  status: "owed" | "received";
  created_at: Date;
  received_at: Date | null;
};

/**
 * Money across the platform, in totals only: each clan's fund at a glance, and the
 * platform fees the clans owe, with the fees marked off as they arrive.
 */
export default async function AdminFundPage({ searchParams }: PageProps<"/admin/fund">) {
  await requireRole(...STAFF_ROLES);
  const [t, locale, sp] = await Promise.all([getT(), getLocale(), searchParams]);
  const a = t.admin;
  const f = t.fundAdmin;
  const feeFilter = sp.fees === "received" || sp.fees === "all" ? sp.fees : "owed";

  const [settings, totals, clans, fees] = await Promise.all([
    queryOne<{ platform_fee_percent: string }>(`SELECT platform_fee_percent FROM platform_settings WHERE id = 1`),
    queryOne<{ balance: string; collected: string; paid_out: string; unpaid: string; owed: string; received: string; collecting: string }>(
      `SELECT (SELECT COALESCE(SUM(amount), 0) FROM fund_ledger) AS balance,
              (SELECT COALESCE(SUM(amount), 0) FROM fund_ledger WHERE amount > 0) AS collected,
              (SELECT COALESCE(-SUM(amount), 0) FROM fund_ledger WHERE entry_type = 'payout') AS paid_out,
              (SELECT COALESCE(SUM(amount), 0) FROM event_bills WHERE status IN ('unpaid', 'carried')) AS unpaid,
              (SELECT COALESCE(SUM(fee_amount), 0) FROM platform_fees WHERE status = 'owed') AS owed,
              (SELECT COALESCE(SUM(fee_amount), 0) FROM platform_fees WHERE status = 'received') AS received,
              (SELECT COUNT(*) FROM death_events WHERE status = 'collecting') AS collecting`,
    ),
    query<ClanFund>(
      `SELECT c.id, c.name, c.code, c.is_active, c.fund_mode,
              COALESCE(l.balance, 0) AS balance, COALESCE(l.collected, 0) AS collected, COALESCE(l.paid_out, 0) AS paid_out,
              COALESCE(b.unpaid, 0) AS unpaid, COALESCE(pf.owed, 0) AS fees_owed, COALESCE(e.open_events, 0) AS open_events
         FROM clans c
         LEFT JOIN (
           SELECT clan_id, SUM(amount) AS balance,
                  SUM(amount) FILTER (WHERE amount > 0) AS collected,
                  -SUM(amount) FILTER (WHERE entry_type = 'payout') AS paid_out
             FROM fund_ledger GROUP BY clan_id
         ) l ON l.clan_id = c.id
         LEFT JOIN (SELECT clan_id, SUM(amount) AS unpaid FROM event_bills WHERE status IN ('unpaid', 'carried') GROUP BY clan_id) b ON b.clan_id = c.id
         LEFT JOIN (SELECT clan_id, SUM(fee_amount) AS owed FROM platform_fees WHERE status = 'owed' GROUP BY clan_id) pf ON pf.clan_id = c.id
         LEFT JOIN (SELECT clan_id, COUNT(*) AS open_events FROM death_events WHERE status = 'collecting' GROUP BY clan_id) e ON e.clan_id = c.id
        ORDER BY c.is_active DESC, COALESCE(pf.owed, 0) DESC, lower(c.name)`,
    ),
    query<Fee>(
      `SELECT f.id, f.clan_id, c.name AS clan_name, e.event_no, f.percent, f.base_amount, f.fee_amount, f.status, f.created_at, f.received_at
         FROM platform_fees f JOIN clans c ON c.id = f.clan_id JOIN death_events e ON e.id = f.event_id
        WHERE $1 = 'all' OR f.status::text = $1
        ORDER BY (f.status = 'owed') DESC, f.created_at DESC
        LIMIT 200`,
      [feeFilter],
    ),
  ]);

  return (
    <>
      <PageHeading title={f.title} lede={f.lede} />

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-soft sm:grid-cols-4">
        <Stat label={f.balance} value={formatKip(totals?.balance ?? 0)} note={f.balanceNote} highlight />
        <Stat label={f.collected} value={formatKip(totals?.collected ?? 0)} note={f.collectedNote} />
        <Stat label={f.paidOut} value={formatKip(totals?.paid_out ?? 0)} note={f.paidOutNote} />
        <Stat label={f.unpaid} value={formatKip(totals?.unpaid ?? 0)} note={fmt(f.unpaidNote, { n: formatNumber(totals?.collecting ?? 0) })} />
      </dl>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
        <Stat label={a.feesOwed} value={formatKip(totals?.owed ?? 0)} note={a.feesTitle} />
        <Stat label={a.feesReceived} value={formatKip(totals?.received ?? 0)} note={a.feesTitle} />
      </dl>

      {/* The fee rule sits beside the fees it produces. */}
      <div id="platform-fee" className="scroll-mt-32">
        <Section title={a.feeTitle}>
          <div className="grid gap-4 rounded-xl border border-line bg-surface p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
            <p className="max-w-[60ch] text-sm text-ink-soft">{t.branding.fundLede}</p>
            <PlatformFeeForm current={settings?.platform_fee_percent ?? "1.50"} />
          </div>
        </Section>
      </div>

      <Section title={f.byClan} aside={f.byClanAside}>
        {clans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{a.noClans}</p>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">{a.colClan}</th>
                  <th className="px-4 py-3 text-right font-medium">{f.balance}</th>
                  <th className="px-4 py-3 text-right font-medium">{f.collected}</th>
                  <th className="px-4 py-3 text-right font-medium">{f.paidOut}</th>
                  <th className="px-4 py-3 text-right font-medium">{f.unpaid}</th>
                  <th className="px-4 py-3 text-right font-medium">{a.feesOwed}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {clans.map((c) => (
                  <tr key={c.id} className={c.is_active ? "" : "text-muted"}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/clans/${c.id}`} className="font-medium text-ink hover:text-brand">
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted">
                        <span className="font-semibold tracking-[0.06em] text-brand">{c.code}</span> · {fmt(a.mode, { m: c.fund_mode })}
                        {Number(c.open_events) > 0 && <> · <span className="text-warn">{fmt(f.openEvents, { n: c.open_events })}</span></>}
                      </p>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-semibold text-ink">{formatKip(c.balance)}</td>
                    <td className="tabular px-4 py-3 text-right text-ink-soft">{formatKip(c.collected)}</td>
                    <td className="tabular px-4 py-3 text-right text-ink-soft">{formatKip(c.paid_out)}</td>
                    <td className={`tabular px-4 py-3 text-right ${Number(c.unpaid) > 0 ? "text-warn" : "text-ink-soft"}`}>{formatKip(c.unpaid)}</td>
                    <td className={`tabular px-4 py-3 text-right ${Number(c.fees_owed) > 0 ? "font-semibold text-warn" : "text-ink-soft"}`}>
                      {formatKip(c.fees_owed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title={a.feesTitle}
        aside={
          <span className="flex gap-1">
            {(["owed", "received", "all"] as const).map((k) => (
              <Link
                key={k}
                href={k === "owed" ? "/admin/fund" : `/admin/fund?fees=${k}`}
                className={`rounded-md px-2.5 py-1 font-medium ${feeFilter === k ? "bg-brand text-white" : "text-ink-soft hover:bg-sunken"}`}
              >
                {f.feeFilter[k]}
              </Link>
            ))}
          </span>
        }
      >
        {fees.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{a.noFees}</p>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">{a.colEvent}</th>
                  <th className="px-4 py-3 text-right font-medium">{a.colBase}</th>
                  <th className="px-4 py-3 text-right font-medium">{a.colFee}</th>
                  <th className="px-4 py-3 font-medium">{a.colStatus}</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">{a.markReceived}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {fees.map((fee) => (
                  <tr key={fee.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/clans/${fee.clan_id}`} className="font-medium text-ink hover:text-brand">
                        {fee.clan_name}
                      </Link>
                      <p className="text-xs text-muted">
                        {fmt(t.events.eventNo, { n: fee.event_no })} · {formatDate(fee.created_at, locale)}
                      </p>
                    </td>
                    <td className="tabular px-4 py-3 text-right text-ink-soft">{formatKip(fee.base_amount)}</td>
                    <td className="tabular px-4 py-3 text-right font-semibold text-ink">
                      {formatKip(fee.fee_amount)}
                      <span className="block text-xs font-normal text-muted">{Number(fee.percent)}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={fee.status === "owed" ? "warn" : "ok"}>{a.feeStatus[fee.status]}</Pill>
                      {fee.received_at && <span className="mt-0.5 block text-xs text-muted">{formatDate(fee.received_at, locale)}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {fee.status === "owed" && (
                        <form action={markFeeReceived}>
                          <input type="hidden" name="feeId" value={fee.id} />
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
    </>
  );
}
