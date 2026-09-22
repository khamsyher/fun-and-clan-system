import { FileIcon } from "./icons";
import { PayoutBadge } from "./badge";
import { formatDate, formatKip } from "@/lib/format";
import { fmt, type Dictionary, type Locale } from "@/lib/i18n/config";
import type { PayoutRow } from "@/lib/events";

/** Every payout attempt with who requested, who approved/rejected, and when it was paid. */
export function PayoutHistory({ payouts, t, locale }: { payouts: PayoutRow[]; t: Dictionary; locale: Locale }) {
  if (payouts.length === 0) return null;
  const e = t.events;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {payouts.map((p) => (
        <li key={p.id} className="p-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="tabular font-display text-2xl text-brand-deep">{formatKip(p.amount)}</p>
              <p className="text-sm text-ink-soft">
                {fmt(t.approvals.receiver, { name: p.receiver_name })}
                {p.receiver_phone && <span className="tabular"> · {p.receiver_phone}</span>}
              </p>
            </div>
            <PayoutBadge status={p.status} />
          </div>
          <ul className="mt-3 space-y-1 text-sm text-ink-soft">
            <li>{fmt(e.requestedBy, { name: p.requested_by_name, date: formatDate(p.requested_at, locale) })}</li>
            {p.status !== "requested" && p.status !== "rejected" && p.decided_by_name && (
              <li className="text-ok">{fmt(e.approvedBy, { name: p.decided_by_name, date: formatDate(p.decided_at, locale) })}</li>
            )}
            {p.status === "rejected" && (
              <li className="text-bad">{fmt(e.rejectedBy, { name: p.decided_by_name ?? "—", note: p.decision_note ?? "" })}</li>
            )}
            {p.status === "paid" && (
              <li className="text-ok">
                {fmt(e.paidOn, { date: formatDate(p.paid_at, locale), method: p.paid_method ? e.method[p.paid_method] : "—" })}
              </li>
            )}
            {p.note && <li className="text-muted">{p.note}</li>}
          </ul>
          {p.proof_file_id && (
            <a
              href={`/files/${p.proof_file_id}`}
              target="_blank"
              rel="noopener"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-bright"
            >
              <FileIcon width={16} height={16} />
              {e.viewProof}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
