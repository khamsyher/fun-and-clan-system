import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/app-shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { BillBadge, EventBadge } from "@/components/badge";
import { CollectionProgress } from "@/components/collection-progress";
import { deceasedLine } from "@/components/event-list";
import { PayoutHistory } from "@/components/payout-history";
import { Notice } from "@/components/ui";
import { requireRole } from "@/lib/dal";
import { query, queryOne } from "@/lib/db";
import { clanBalance, getEvent, listPayouts, type BillStatus } from "@/lib/events";
import { formatDate, formatKip } from "@/lib/format";
import { feeFor } from "@/lib/funds";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { BillControls, ConfirmEventAction, MarkPaidForm, PayoutRequestForm } from "./controls";

export async function generateMetadata({ params }: PageProps<"/clan/events/[id]">): Promise<Metadata> {
  const t = await getT();
  const { id } = await params;
  const leader = await requireRole("clan_admin");
  const e = await getEvent(leader.clanId!, id);
  return { title: e ? `${fmt(t.events.eventNo, { n: e.event_no })} · ${e.deceased_name}` : t.events.metaTitle };
}

type BillRow = {
  id: string;
  full_name: string;
  phone: string;
  amount: string;
  carried_in: string;
  status: BillStatus;
  paid_method: "cash" | "transfer" | null;
  pending_slip: boolean;
  via_slip: boolean;
};

export default async function EventPage({ params }: PageProps<"/clan/events/[id]">) {
  const leader = await requireRole("clan_admin");
  const { id } = await params;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const ev = t.events;

  const event = await getEvent(leader.clanId!, id);
  if (!event) notFound();

  const [bills, payouts, funds, hasMoney, treasurers] = await Promise.all([
    query<BillRow>(
      `SELECT b.id, u.full_name, u.phone, b.amount, b.carried_in, b.status, b.paid_method,
              EXISTS (SELECT 1 FROM payment_slips s WHERE s.bill_id = b.id AND s.status = 'pending') AS pending_slip,
              EXISTS (SELECT 1 FROM payment_slips s WHERE s.bill_id = b.id AND s.status = 'approved') AS via_slip
         FROM event_bills b JOIN users u ON u.id = b.member_id
        WHERE b.event_id = $1 AND b.clan_id = $2
        ORDER BY (b.status = 'unpaid') DESC, u.full_name`,
      [event.id, leader.clanId],
    ),
    listPayouts(leader.clanId!, event.id),
    clanBalance(leader.clanId!),
    queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM fund_ledger WHERE event_id = $1`, [event.id]),
    query<{ full_name: string }>(
      `SELECT full_name FROM users WHERE clan_id = $1 AND is_treasurer AND status = 'active' AND role = 'member' ORDER BY full_name`,
      [leader.clanId],
    ),
  ]);

  const isB = event.fund_mode === "B";
  const unpaid = bills.filter((b) => b.status === "unpaid").length;
  const live = payouts.find((p) => p.status !== "rejected");
  const gross = Number(event.gross_collected ?? 0);
  const fee = Number(event.fee_amount ?? 0);
  const net = gross - fee;
  // Mode B: what the collection raised for the family. Mode A: the leader enters the benefit.
  const suggested = isB ? Math.max(0, Math.min(net, funds.available)) : null;
  const canCancel = (event.status === "collecting" || event.status === "awaiting_payout") && !event.closed_at && Number(hasMoney?.n ?? 0) === 0 && !live;

  return (
    <>
      <Link href="/clan/events" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {ev.back}
      </Link>

      <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-wide text-brand">{fmt(ev.eventNo, { n: event.event_no })}</p>
          <h1 className="mt-1 font-display text-3xl tracking-[-0.02em] text-brand-deep sm:text-4xl">{event.deceased_name}</h1>
          <p className="mt-1 text-ink-soft">
            {deceasedLine(event, t)} · {ev.dateOfDeath}: {formatDate(event.date_of_death, locale)} ·{" "}
            {fmt(ev.reportedOn, { date: formatDate(event.reported_at, locale) })}
          </p>
          {event.note && <p className="mt-1 text-sm text-muted">{event.note}</p>}
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
            <>
              <h2 className="text-lg font-semibold text-ink">{ev.modeAEvent}</h2>
              <p className="tabular mt-2 font-display text-3xl text-brand-deep">{formatKip(funds.balance)}</p>
              <p className="text-sm text-ink-soft">{ev.balance}</p>
            </>
          )}
        </div>
        <div className="panel-brand rounded-xl p-5 text-white shadow-soft sm:p-6">
          <p className="text-sm text-white/75">{ev.lockedRate}</p>
          <p className="tabular mt-1 font-display text-3xl">{formatKip(event.rate_amount)}</p>
          <p className="mt-1 text-sm text-white/75">
            {isB ? fmt(ev.perHousehold, { amount: formatKip(event.rate_amount) }) : ev.modeAEvent}
          </p>
          <p className="mt-3 text-xs text-white/65">
            {fmt(t.clan.mode, { m: event.fund_mode })} · {fmt(t.settings.version, { n: event.rate_version })} ·{" "}
            {fmt(ev.fee, { pct: Number(event.platform_fee_percent) })}
          </p>
        </div>
      </div>

      {/* ---- Collection (Mode B) ---- */}
      {isB && event.status !== "cancelled" && (
        <Section title={ev.bills} aside={fmt(ev.paidCount, { paid: Number(event.bills_paid), total: Number(event.bills_total) })}>
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">{ev.colMember}</th>
                  <th className="px-4 py-3 text-right font-medium">{ev.colBill}</th>
                  <th className="px-4 py-3 text-right font-medium">{ev.colDebt}</th>
                  <th className="px-4 py-3 font-medium">{ev.colStatus}</th>
                  <th className="px-4 py-3"><span className="sr-only">{ev.recordPaid}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{b.full_name}</p>
                      <p className="tabular text-xs text-muted">{b.phone}</p>
                    </td>
                    <td className="tabular px-4 py-3 text-right">{formatKip(b.amount)}</td>
                    <td className="tabular px-4 py-3 text-right text-ink-soft">{Number(b.carried_in) > 0 ? formatKip(b.carried_in) : "—"}</td>
                    <td className="px-4 py-3">
                      <BillBadge status={b.status} />
                      {b.paid_method && b.status === "paid" && (
                        <span className="ml-1.5 text-xs text-muted">{b.via_slip ? t.payments.viaSlip : ev.method[b.paid_method]}</span>
                      )}
                      {b.pending_slip && (
                        <Link href="/clan/slips" className="ml-1.5 text-xs font-semibold text-brand hover:text-brand-bright">
                          {t.contributions.pendingSlip} →
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Keyed by status so the control starts closed after every change (e.g. after an undo). */}
                      {event.status === "collecting" && (
                        <BillControls key={b.status} billId={b.id} status={b.status} carriedIn={Number(b.carried_in)} viaSlip={b.via_slip} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {event.status === "collecting" && (
            <div className="mt-4 flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-[60ch]">
                <h3 className="font-semibold text-ink">{ev.closeTitle}</h3>
                <p className="mt-1 text-sm text-ink-soft">{fmt(ev.closeBody, { pct: Number(event.platform_fee_percent) })}</p>
              </div>
              <ConfirmEventAction kind="close" eventId={event.id} confirmText={fmt(ev.closeConfirm, { n: unpaid })} />
            </div>
          )}
        </Section>
      )}

      {/* ---- Summary after collection closes ---- */}
      {isB && event.closed_at && (
        <Section title={ev.summary}>
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
            <SummaryCell label={ev.gross} value={formatKip(gross)} />
            <SummaryCell label={fmt(ev.fee, { pct: Number(event.platform_fee_percent) })} value={`− ${formatKip(fee)}`} />
            <SummaryCell label={ev.net} value={formatKip(net)} strong />
          </dl>
        </Section>
      )}

      {/* ---- Payout ---- */}
      {(event.status === "awaiting_payout" || event.status === "completed") && (
        <Section title={ev.payoutTitle}>
          <div className="space-y-4">
            <PayoutHistory payouts={payouts} t={t} locale={locale} />

            {event.status === "awaiting_payout" && !live && (
              <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
                {treasurers.length === 0 ? (
                  <Notice tone="error">{ev.needsTreasurer}</Notice>
                ) : (
                  <>
                    <p className="mb-4 text-sm text-ink-soft">{fmt(t.treasurer.list, { names: treasurers.map((x) => x.full_name).join(", ") })}</p>
                    <PayoutRequestForm
                      eventId={event.id}
                      suggested={suggested}
                      available={isB ? funds.available : Math.floor(funds.available / (1 + Number(event.platform_fee_percent) / 100))}
                      feeNote={isB ? null : fmt(ev.feeOnPayout, { pct: Number(event.platform_fee_percent) })}
                      defaultReceiver={event.family_name}
                    />
                  </>
                )}
              </div>
            )}

            {live?.status === "approved" && (
              <div className="rounded-xl border border-brand-bright/40 bg-surface p-5 sm:p-6">
                <h3 className="mb-4 font-semibold text-ink">{ev.markPaid}</h3>
                {!isB && (
                  <p className="-mt-2 mb-4 text-sm text-muted">
                    {fmt(ev.fee, { pct: Number(event.platform_fee_percent) })}: {formatKip(feeFor(Number(live.amount), event.platform_fee_percent))}
                  </p>
                )}
                <MarkPaidForm payoutId={live.id} />
              </div>
            )}

            {event.status === "completed" && <Notice tone="success">{ev.completedNote}</Notice>}
          </div>
        </Section>
      )}

      {canCancel && (
        <Section title={ev.cancelTitle}>
          <div className="flex flex-col gap-4 rounded-xl border border-dashed border-line-strong bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-soft">{ev.cancelBody}</p>
            <ConfirmEventAction kind="cancel" eventId={event.id} confirmText={ev.cancelConfirm} />
          </div>
        </Section>
      )}
    </>
  );
}

function SummaryCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`p-4 sm:p-5 ${strong ? "panel-brand text-white" : "bg-surface"}`}>
      <dt className={`text-sm ${strong ? "text-white/75" : "text-ink-soft"}`}>{label}</dt>
      <dd className={`tabular mt-1 font-display text-2xl ${strong ? "text-white" : "text-brand-deep"}`}>{value}</dd>
    </div>
  );
}
