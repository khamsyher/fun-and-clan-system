import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeading, Section } from "@/components/app-shell";
import { PayoutBadge } from "@/components/badge";
import { requireRole } from "@/lib/dal";
import { query } from "@/lib/db";
import { clanBalance, type PayoutStatus } from "@/lib/events";
import { formatDate, formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { DecisionForm } from "./decision-form";
import { Notice } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).approvals.metaTitle };
}

type Row = {
  id: string;
  amount: string;
  receiver_name: string;
  receiver_phone: string | null;
  note: string | null;
  status: PayoutStatus;
  requested_at: Date;
  requested_by_name: string;
  decided_at: Date | null;
  decision_note: string | null;
  event_id: string;
  event_no: number;
  deceased_name: string;
  fund_mode: "A" | "B";
  gross_collected: string | null;
  fee_amount: string | null;
};

export default async function ApprovalsPage({ searchParams }: PageProps<"/member/approvals">) {
  const me = await requireRole("member");
  if (!me.isTreasurer) redirect("/member");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const a = t.approvals;

  const [rows, funds] = await Promise.all([
    query<Row>(
      `SELECT p.id, p.amount, p.receiver_name, p.receiver_phone, p.note, p.status, p.requested_at,
              r.full_name AS requested_by_name, p.decided_at, p.decision_note,
              e.id AS event_id, e.event_no, e.deceased_name, e.fund_mode, e.gross_collected, e.fee_amount
         FROM payouts p
         JOIN death_events e ON e.id = p.event_id
         JOIN users r ON r.id = p.requested_by
        WHERE p.clan_id = $1
        ORDER BY (p.status = 'requested') DESC, p.requested_at DESC
        LIMIT 50`,
      [me.clanId],
    ),
    clanBalance(me.clanId!),
  ]);
  const done = (await searchParams).done;
  const pending = rows.filter((r) => r.status === "requested");
  const decided = rows.filter((r) => r.status !== "requested").slice(0, 10);

  return (
    <>
      <PageHeading title={a.title} lede={a.lede} />
      {(done === "approved" || done === "rejected") && (
        <div className="mt-6">
          <Notice tone="success">{done === "approved" ? a.approved : a.rejected}</Notice>
        </div>
      )}

      <div className="mt-8 space-y-4">
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-10 text-center text-ink-soft">{a.empty}</p>
        ) : (
          pending.map((p) => (
            <article key={p.id} className="rounded-xl border border-brand-bright/40 bg-surface p-5 shadow-soft sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/member/events/${p.event_id}`} className="text-sm font-semibold text-brand hover:text-brand-bright">
                    {fmt(a.event, { n: p.event_no, name: p.deceased_name })}
                  </Link>
                  <p className="tabular mt-1 font-display text-3xl text-brand-deep">{formatKip(p.amount)}</p>
                  <p className="text-sm text-ink-soft">
                    {fmt(a.receiver, { name: p.receiver_name })}
                    {p.receiver_phone && <span className="tabular"> · {p.receiver_phone}</span>}
                  </p>
                </div>
                <PayoutBadge status={p.status} />
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                {p.fund_mode === "B" && (
                  <div>
                    <dt className="text-muted">{t.events.net}</dt>
                    <dd className="tabular font-medium text-ink">
                      {formatKip(Number(p.gross_collected ?? 0) - Number(p.fee_amount ?? 0))}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted">{t.events.balance}</dt>
                  <dd className="tabular font-medium text-ink">{formatKip(funds.balance)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{fmt(a.requested, { name: p.requested_by_name, date: formatDate(p.requested_at, locale) })}</dt>
                  {p.note && <dd className="text-ink-soft">{p.note}</dd>}
                </div>
              </dl>
              <div className="mt-5 border-t border-line pt-5">
                <DecisionForm payoutId={p.id} />
              </div>
            </article>
          ))
        )}
      </div>

      {decided.length > 0 && (
        <Section title={a.history}>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {decided.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
                <div>
                  <p className="text-sm font-medium text-ink">{fmt(a.event, { n: p.event_no, name: p.deceased_name })}</p>
                  <p className="tabular text-sm text-ink-soft">
                    {formatKip(p.amount)} · {formatDate(p.decided_at, locale)}
                    {p.decision_note && <> · {p.decision_note}</>}
                  </p>
                </div>
                <PayoutBadge status={p.status} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
