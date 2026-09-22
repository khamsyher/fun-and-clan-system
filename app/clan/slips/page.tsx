import type { Metadata } from "next";
import { PageHeading, Section } from "@/components/app-shell";
import { FileIcon } from "@/components/icons";
import { SlipStatus, slipTarget } from "@/components/slip-parts";
import { requireRole } from "@/lib/dal";
import { formatDate, formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { clanSlips } from "@/lib/payments";
import { ReviewSlipForm } from "./review-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).slips.metaTitle };
}

export default async function SlipsPage() {
  const leader = await requireRole("clan_admin");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const s = t.slips;
  const [pending, reviewed] = await Promise.all([clanSlips(leader.clanId!, "pending"), clanSlips(leader.clanId!, "reviewed")]);

  return (
    <>
      <PageHeading title={s.title} lede={s.lede} />

      <div className="mt-8 space-y-4">
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-10 text-center text-ink-soft">{s.empty}</p>
        ) : (
          pending.map((slip) => {
            const expected = Number(slip.expected) + Number(slip.debt);
            const claimed = Number(slip.amount_claimed);
            const isImage = slip.content_type.startsWith("image/");
            return (
              <article key={slip.id} className="grid gap-5 rounded-xl border border-line bg-surface p-5 shadow-soft sm:p-6 md:grid-cols-[14rem_minmax(0,1fr)]">
                <a
                  href={`/files/${slip.file_id}`}
                  target="_blank"
                  rel="noopener"
                  className="group relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border border-line bg-sunken"
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; not optimisable
                    <img src={`/files/${slip.file_id}`} alt={s.viewSlip} className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-brand">
                      <FileIcon width={32} height={32} />
                      <span className="text-sm font-medium">PDF</span>
                    </span>
                  )}
                </a>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{slip.member_name}</p>
                      <p className="tabular text-sm text-muted">{slip.member_phone}</p>
                    </div>
                    <SlipStatus status={slip.status} t={t} />
                  </div>
                  <p className="mt-3 text-sm font-medium text-brand">{slipTarget(slip, t)}</p>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-lg bg-paper p-3">
                      <dt className="text-muted">{fmt(s.expected, { amount: "" }).trim()}</dt>
                      <dd className="tabular font-display text-2xl text-brand-deep">{formatKip(expected)}</dd>
                      {slip.include_debt && Number(slip.debt) > 0 && (
                        <dd className="text-xs text-ink-soft">{fmt(s.withDebt, { amount: formatKip(slip.debt) })}</dd>
                      )}
                    </div>
                    <div className={`rounded-lg p-3 ${claimed === expected ? "bg-ok-wash" : "bg-warn-wash"}`}>
                      <dt className="text-muted">{s.amount}</dt>
                      <dd className={`tabular font-display text-2xl ${claimed === expected ? "text-ok" : "text-warn"}`}>{formatKip(claimed)}</dd>
                      <dd className="text-xs text-ink-soft">{formatDate(slip.transfer_date, locale)}</dd>
                    </div>
                  </dl>
                  {claimed !== expected && <p className="mt-2 text-sm text-warn">{s.mismatch}</p>}
                  {slip.note && <p className="mt-2 text-sm text-ink-soft">“{slip.note}”</p>}
                  <a
                    href={`/files/${slip.file_id}`}
                    target="_blank"
                    rel="noopener"
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-bright"
                  >
                    <FileIcon width={16} height={16} />
                    {s.viewSlip}
                  </a>
                  <div className="mt-4 border-t border-line pt-4">
                    <ReviewSlipForm slipId={slip.id} />
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {reviewed.length > 0 && (
        <Section title={s.recent}>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {reviewed.slice(0, 20).map((slip) => (
              <li key={slip.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {slip.member_name} · {slipTarget(slip, t)}
                  </p>
                  <p className="tabular text-sm text-ink-soft">
                    {formatKip(slip.amount_claimed)} · {formatDate(slip.reviewed_at, locale)}
                    {slip.review_note && <> · {slip.review_note}</>}
                  </p>
                </div>
                <SlipStatus status={slip.status} t={t} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
