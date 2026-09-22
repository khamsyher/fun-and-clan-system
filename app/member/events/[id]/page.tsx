import type { Metadata } from "next";
import Link from "next/link";
import { UploadIcon } from "@/components/icons";
import { notFound } from "next/navigation";
import { Section } from "@/components/app-shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { BillBadge, EventBadge } from "@/components/badge";
import { CollectionProgress } from "@/components/collection-progress";
import { deceasedLine } from "@/components/event-list";
import { PayoutHistory } from "@/components/payout-history";
import { requireRole } from "@/lib/dal";
import { queryOne } from "@/lib/db";
import { getEvent, listPayouts, type BillStatus } from "@/lib/events";
import { formatDate, formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/member/events/[id]">): Promise<Metadata> {
  const t = await getT();
  const me = await requireRole("member");
  const e = await getEvent(me.clanId!, (await params).id);
  return { title: e ? e.deceased_name : t.events.metaTitle };
}

export default async function MemberEventPage({ params }: PageProps<"/member/events/[id]">) {
  const me = await requireRole("member");
  const { id } = await params;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const ev = t.events;

  const event = await getEvent(me.clanId!, id);
  if (!event || event.status === "cancelled") notFound();

  const [bill, payouts] = await Promise.all([
    queryOne<{ amount: string; carried_in: string; status: BillStatus }>(
      `SELECT amount, carried_in, status FROM event_bills WHERE event_id = $1 AND member_id = $2 AND clan_id = $3`,
      [event.id, me.id, me.clanId],
    ),
    listPayouts(me.clanId!, event.id),
  ]);
  const isB = event.fund_mode === "B";

  return (
    <>
      <Link href="/member/events" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {ev.back}
      </Link>
      <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-wide text-brand">{fmt(ev.eventNo, { n: event.event_no })}</p>
          <h1 className="mt-1 font-display text-3xl tracking-[-0.02em] text-brand-deep sm:text-4xl">{event.deceased_name}</h1>
          <p className="mt-1 text-ink-soft">
            {deceasedLine(event, t)} · {ev.dateOfDeath}: {formatDate(event.date_of_death, locale)}
          </p>
        </div>
        <EventBadge status={event.status} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          {isB ? (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">{ev.raised}</h2>
                {event.status === "collecting" && <AutoRefresh />}
              </div>
              <CollectionProgress
                paid={Number(event.bills_paid)}
                total={Number(event.bills_total)}
                raised={Number(event.raised)}
                expected={Number(event.expected)}
                t={ev}
              />
            </>
          ) : (
            <p className="text-ink-soft">{ev.modeAEvent}</p>
          )}
        </div>

        <div className="panel-brand rounded-xl p-5 text-white shadow-soft sm:p-6">
          <h2 className="text-sm text-white/75">{ev.yourBill}</h2>
          {bill ? (
            <>
              <p className="tabular mt-1 font-display text-3xl">{formatKip(bill.amount)}</p>
              <div className="mt-2 [&_span]:bg-white/15 [&_span]:text-white">
                <BillBadge status={bill.status} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/80">
                {bill.status === "paid" || bill.status === "settled"
                  ? ev.yourBillPaid
                  : bill.status === "carried"
                    ? ev.yourBillCarried
                    : fmt(ev.yourBillUnpaid, { amount: formatKip(Number(bill.amount) + Number(bill.carried_in)) })}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-white/80">{ev.noBill}</p>
          )}
          {bill && (bill.status === "carried" || (bill.status === "unpaid" && event.status === "collecting")) && (
            <Link
              href="/member/payments"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-brand hover:bg-brand-wash"
            >
              <UploadIcon width={16} height={16} />
              {t.member.payWithSlip}
            </Link>
          )}
        </div>
      </div>

      {isB && event.closed_at && (
        <Section title={ev.summary}>
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
            <Cell label={ev.gross} value={formatKip(event.gross_collected ?? 0)} />
            <Cell label={fmt(ev.fee, { pct: Number(event.platform_fee_percent) })} value={`− ${formatKip(event.fee_amount ?? 0)}`} />
            <Cell label={ev.net} value={formatKip(Number(event.gross_collected ?? 0) - Number(event.fee_amount ?? 0))} />
          </dl>
        </Section>
      )}

      {payouts.length > 0 && (
        <Section title={ev.payoutTitle}>
          <PayoutHistory payouts={payouts} t={t} locale={locale} />
        </Section>
      )}
    </>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface p-4 sm:p-5">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="tabular mt-1 font-display text-2xl text-brand-deep">{value}</dd>
    </div>
  );
}
