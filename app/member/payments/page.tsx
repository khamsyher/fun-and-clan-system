import type { Metadata } from "next";
import { PageHeading, Section } from "@/components/app-shell";
import { ClockIcon, FileIcon } from "@/components/icons";
import { SlipStatus, slipTarget } from "@/components/slip-parts";
import { requireRole } from "@/lib/dal";
import { memberDebt } from "@/lib/events";
import { formatDate, formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { memberHistory, memberOpenItems, memberSlips } from "@/lib/payments";
import { SlipUpload } from "./slip-form";
import { Notice } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).payments.metaTitle };
}

export default async function PaymentsPage({ searchParams }: PageProps<"/member/payments">) {
  const me = await requireRole("member");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const p = t.payments;

  const [items, slips, history, debt] = await Promise.all([
    memberOpenItems(me.clanId!, me.id),
    memberSlips(me.clanId!, me.id),
    memberHistory(me.clanId!, me.id),
    memberDebt(me.clanId!, me.id),
  ]);
  const sent = (await searchParams).sent === "1";
  const totalPaid = history.reduce((sum, h) => sum + Number(h.amount), 0);

  return (
    <>
      <PageHeading title={p.title} lede={p.lede} />
      {sent && (
        <div className="mt-6">
          <Notice tone="success">{t.slips.uploaded}</Notice>
        </div>
      )}

      <Section title={p.toPay} aside={items.length ? formatKip(debt.open + debt.carried) : undefined}>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center text-ink-soft">{p.nothing}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {items.map((item) => (
              <li key={item.id} id={item.id} className="flex flex-col gap-3 p-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{slipTarget(item, t)}</p>
                    <p className="tabular font-display text-2xl text-brand-deep">{formatKip(item.amount)}</p>
                    {item.last_rejection && !item.pending_slip && (
                      <p className="mt-1 text-sm text-bad">{fmt(t.slips.rejectedNote, { note: item.last_rejection })}</p>
                    )}
                  </div>
                  {item.pending_slip ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-wash px-3 py-1 text-sm text-warn">
                      <ClockIcon width={16} height={16} />
                      {p.waiting}
                    </span>
                  ) : (
                    <SlipUpload
                      target={`${item.kind === "due" ? "d" : "b"}:${item.id}`}
                      amount={Number(item.amount)}
                      // Earlier debt can ride along on a current event's bill (the debt items themselves excluded).
                      debt={item.kind === "bill" ? debt.carried : 0}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={p.slips}>
        {slips.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{p.noSlips}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {slips.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 p-4 sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{slipTarget(s, t)}</p>
                  <p className="tabular text-sm text-ink-soft">
                    {fmt(t.slips.claimed, { amount: formatKip(s.amount_claimed), date: formatDate(s.transfer_date, locale) })}
                  </p>
                  {s.review_note && s.status === "rejected" && <p className="mt-1 text-sm text-bad">{s.review_note}</p>}
                  <a
                    href={`/files/${s.file_id}`}
                    target="_blank"
                    rel="noopener"
                    className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-bright"
                  >
                    <FileIcon width={16} height={16} />
                    {t.slips.viewSlip}
                  </a>
                </div>
                <SlipStatus status={s.status} t={t} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={p.history} aside={history.length ? fmt(p.totalPaid, { amount: formatKip(totalPaid) }) : undefined}>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{p.noHistory}</p>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">{p.colDate}</th>
                  <th className="px-4 py-3 font-medium">{p.colItem}</th>
                  <th className="px-4 py-3 text-right font-medium">{p.colAmount}</th>
                  <th className="px-4 py-3 font-medium">{p.colMethod}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.map((h, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-soft">{formatDate(h.paid_at, locale)}</td>
                    <td className="px-4 py-3 text-ink">{slipTarget(h, t)}</td>
                    <td className="tabular px-4 py-3 text-right font-semibold text-ok">{formatKip(h.amount)}</td>
                    <td className="px-4 py-3 text-ink-soft">{h.via_slip ? p.viaSlip : h.method ? t.events.method[h.method] : "—"}</td>
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
