import type { Metadata } from "next";
import { PageHeading, Section } from "@/components/app-shell";
import { EventBadge } from "@/components/badge";
import { ReportRange } from "@/components/report-range";
import { requireRole } from "@/lib/dal";
import { formatDate, formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { ledgerDetail, summaryRows } from "@/lib/report-text";
import { getClanReport, parseRange } from "@/lib/reports";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.metaTitle };
}

const LEDGER_ON_PAGE = 100;

export default async function ReportsPage({ searchParams }: PageProps<"/clan/reports">) {
  const leader = await requireRole("clan_admin");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const rt = t.reports;
  const range = parseRange(await searchParams);
  const r = await getClanReport(leader.clanId!, range.valid ? range : { from: range.to, to: range.to });
  const { income, expenses } = summaryRows(r, t);
  const recent = r.ledger.slice(-LEDGER_ON_PAGE).reverse();

  return (
    <>
      <PageHeading title={rt.title} lede={rt.lede} />
      <ReportRange base="/clan/reports" from={range.from} to={range.to} t={t} valid={range.valid} />

      <p className="mt-6 text-sm font-medium text-ink-soft">
        {fmt(rt.period, { from: formatDate(r.from, locale), to: formatDate(r.to, locale) })}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-soft sm:grid-cols-4">
        <Cell label={rt.opening} value={formatKip(r.openingBalance)} />
        <Cell label={rt.totalIncome} value={formatKip(r.income)} tone="ok" />
        <Cell label={rt.totalExpenses} value={formatKip(r.expenses)} tone="bad" />
        <Cell label={rt.closing} value={formatKip(r.closingBalance)} strong />
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Breakdown title={rt.income} rows={income} total={{ label: rt.totalIncome, amount: r.income }} />
        <Breakdown
          title={rt.expenses}
          rows={expenses}
          total={{ label: rt.totalExpenses, amount: r.expenses }}
          after={r.corrections ? { label: rt.corrections, amount: r.corrections } : undefined}
        />
      </div>

      <p
        className={`mt-4 rounded-lg px-4 py-3 text-sm ${r.outstanding.total ? "bg-warn-wash text-warn" : "bg-ok-wash text-ok"}`}
      >
        <strong className="font-semibold">{rt.outstanding}: </strong>
        {r.outstanding.total
          ? fmt(rt.outstandingBody, { amount: formatKip(r.outstanding.total), n: r.outstanding.members })
          : rt.nothingOwed}
      </p>

      <Section title={rt.events}>
        {r.events.length === 0 ? (
          <Empty text={rt.noEvents} />
        ) : (
          <Table
            head={[rt.colEvent, rt.colDeceased, rt.colDate, rt.colStatus, rt.colPaid, rt.colCollected, rt.colFee, rt.colPayout]}
            right={[4, 5, 6, 7]}
            rows={r.events.map((e) => [
              `#${e.event_no}`,
              e.deceased_name,
              formatDate(e.date_of_death, locale),
              <EventBadge key="s" status={e.status} />,
              e.fund_mode === "B" ? `${e.bills_paid} / ${e.bills_total}` : "—",
              formatKip(e.collected),
              formatKip(e.fee),
              formatKip(e.payout),
            ])}
          />
        )}
      </Section>

      {r.contributions.length > 0 && (
        <Section title={rt.contributions}>
          <Table
            head={[rt.colPeriod, rt.colMembers, rt.colPaidCount, rt.colCollected, t.events.raised]}
            right={[1, 2, 3, 4]}
            rows={r.contributions.map((c) => [c.label, c.members, c.paid, formatKip(c.collected), formatKip(c.expected)])}
          />
        </Section>
      )}

      <Section title={rt.ledger} aside={r.ledger.length > LEDGER_ON_PAGE ? fmt(rt.ledgerNote, { n: LEDGER_ON_PAGE }) : undefined}>
        {recent.length === 0 ? (
          <Empty text={rt.noEntries} />
        ) : (
          <Table
            head={[rt.colDateTime, rt.colType, rt.colDetail, rt.colAmount]}
            right={[3]}
            rows={recent.map((l) => {
              const n = Number(l.amount);
              return [
                formatDate(l.created_at, locale),
                t.fund.type[l.entry_type],
                ledgerDetail(l, t),
                <span key="a" className={`font-semibold ${n < 0 ? "text-bad" : "text-ok"}`}>
                  {n < 0 ? "−" : "+"} {formatKip(Math.abs(n))}
                </span>,
              ];
            })}
          />
        )}
      </Section>
    </>
  );
}

function Cell({ label, value, tone, strong }: { label: string; value: string; tone?: "ok" | "bad"; strong?: boolean }) {
  return (
    <div className={`p-4 sm:p-5 ${strong ? "panel-brand text-white" : "bg-surface"}`}>
      <dt className={`text-sm ${strong ? "text-white/75" : "text-ink-soft"}`}>{label}</dt>
      <dd
        className={`tabular mt-1 font-display text-2xl sm:text-3xl ${
          strong ? "text-white" : tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-brand-deep"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

type Line = { label: string; amount: number };

/** Corrections (reversals like an undone payment) are shown after the total, not counted as expenses. */
function Breakdown({ title, rows, total, after }: { title: string; rows: Line[]; total: Line; after?: Line }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-semibold text-ink">{title}</h2>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4">
            <dt className="text-ink-soft">{r.label}</dt>
            <dd className="tabular text-ink">{formatKip(r.amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-line pt-2 font-semibold">
          <dt className="text-ink">{total.label}</dt>
          <dd className="tabular text-ink">{formatKip(total.amount)}</dd>
        </div>
        {after && (
          <div className="flex justify-between gap-4 pt-1 text-ink-soft">
            <dt>{after.label}</dt>
            <dd className="tabular">{formatKip(after.amount)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{text}</p>;
}

function Table({ head, rows, right }: { head: string[]; rows: React.ReactNode[][]; right: number[] }) {
  return (
    <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-3 font-medium ${right.includes(i) ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={`tabular px-4 py-3 ${right.includes(j) ? "text-right whitespace-nowrap" : ""} ${j === 0 ? "whitespace-nowrap text-ink-soft" : "text-ink"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
