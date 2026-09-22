import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { query } from "@/lib/db";
import { clanBalance } from "@/lib/events";
import { formatDate, formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { DepositForm, SettleDebtButton } from "./fund-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).fund.metaTitle };
}

type LedgerRow = {
  id: string;
  entry_type: "deposit" | "collection" | "debt_collection" | "platform_fee" | "payout" | "adjustment" | "contribution";
  amount: string;
  note: string | null;
  created_at: Date;
  created_by_name: string | null;
  event_id: string | null;
  event_no: number | null;
  deceased_name: string | null;
  member_name: string | null;
  period_label: string | null;
};

export default async function FundPage() {
  const leader = await requireRole("clan_admin");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const f = t.fund;

  const [funds, debts, ledger] = await Promise.all([
    clanBalance(leader.clanId!),
    query<{ member_id: string; full_name: string; total: string; events: string }>(
      `SELECT u.id AS member_id, u.full_name, SUM(b.amount) AS total, COUNT(*) AS events
         FROM event_bills b JOIN users u ON u.id = b.member_id
        WHERE b.clan_id = $1 AND b.status = 'carried'
        GROUP BY u.id, u.full_name
        ORDER BY SUM(b.amount) DESC, u.full_name`,
      [leader.clanId],
    ),
    query<LedgerRow>(
      `SELECT l.id, l.entry_type, l.amount, l.note, l.created_at, c.full_name AS created_by_name,
              l.event_id, e.event_no, e.deceased_name, COALESCE(m.full_name, dm.full_name) AS member_name,
              cp.label AS period_label
         FROM fund_ledger l
         LEFT JOIN users c ON c.id = l.created_by
         LEFT JOIN death_events e ON e.id = l.event_id
         LEFT JOIN event_bills b ON b.id = l.bill_id
         LEFT JOIN users m ON m.id = b.member_id
         LEFT JOIN contribution_dues cd ON cd.id = l.due_id
         LEFT JOIN contribution_periods cp ON cp.id = cd.period_id
         LEFT JOIN users dm ON dm.id = cd.member_id
        WHERE l.clan_id = $1
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 200`,
      [leader.clanId],
    ),
  ]);

  return (
    <>
      <PageHeading title={f.title} lede={f.lede} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="panel-brand h-fit rounded-xl p-5 text-white shadow-soft sm:p-6">
          <p className="text-sm text-white/75">{f.balance}</p>
          <p className="tabular mt-1 font-display text-4xl">{formatKip(funds.balance)}</p>
          {funds.promised > 0 && <p className="mt-2 text-sm text-white/75">{fmt(f.promised, { amount: formatKip(funds.promised) })}</p>}
        </div>
        <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-ink">{f.depositTitle}</h2>
          <div className="mt-4">
            <DepositForm />
          </div>
        </section>
      </div>

      <Section title={f.debtsTitle}>
        {debts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{f.noDebts}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {debts.map((d) => (
              <li key={d.member_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <p className="font-medium text-ink">{d.full_name}</p>
                  <p className="text-sm text-ink-soft">
                    <span className="tabular font-semibold text-bad">{formatKip(d.total)}</span> · {fmt(f.debtEvents, { n: d.events })}
                  </p>
                </div>
                <SettleDebtButton memberId={d.member_id} name={d.full_name} amount={formatKip(d.total)} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={f.ledgerTitle}>
        {ledger.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{f.noLedger}</p>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">{f.colDate}</th>
                  <th className="px-4 py-3 font-medium">{f.colType}</th>
                  <th className="px-4 py-3 font-medium">{f.colDetail}</th>
                  <th className="px-4 py-3 text-right font-medium">{f.colAmount}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ledger.map((l) => {
                  const amount = Number(l.amount);
                  return (
                    <tr key={l.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-soft">{formatDate(l.created_at, locale)}</td>
                      <td className="px-4 py-3 font-medium text-ink">{f.type[l.entry_type]}</td>
                      <td className="px-4 py-3 text-ink-soft">
                        {l.event_id && (
                          <Link href={`/clan/events/${l.event_id}`} className="text-brand hover:text-brand-bright">
                            {fmt(t.events.eventNo, { n: l.event_no ?? "" })} · {l.deceased_name}
                          </Link>
                        )}
                        {l.period_label && <span className="block">{fmt(t.slips.forDue, { label: l.period_label })}</span>}
                        {l.member_name && <span className="block text-xs">{l.member_name}</span>}
                        {l.entry_type === "deposit" && l.note && <span className="block">{l.note}</span>}
                        {l.created_by_name && <span className="block text-xs text-muted">{l.created_by_name}</span>}
                      </td>
                      <td className={`tabular px-4 py-3 text-right font-semibold whitespace-nowrap ${amount < 0 ? "text-bad" : "text-ok"}`}>
                        {amount < 0 ? "−" : "+"} {formatKip(Math.abs(amount))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
