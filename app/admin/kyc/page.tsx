import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { StatusPill } from "@/components/document-list";
import { KycMark } from "@/components/kyc-status";
import { KycReview } from "@/components/kyc-review";
import { FileIcon } from "@/components/icons";
import { requireRole } from "@/lib/dal";
import { formatDate, formatNumber } from "@/lib/format";
import { countForReview, listForReview } from "@/lib/kyc";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { PeopleCard } from "../people-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).kyc.metaTitle };
}

export default async function AdminKycPage({ searchParams }: PageProps<"/admin/kyc">) {
  await requireRole("super_admin");
  const [t, locale, sp] = await Promise.all([getT(), getLocale(), searchParams]);
  const k = t.kyc;
  const filter = typeof sp.show === "string" ? sp.show : "pending";
  const [counts, docs] = await Promise.all([countForReview(), listForReview(filter)]);

  return (
    <>
      <PageHeading title={k.title} lede={k.lede} />

      <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PeopleCard label={k.statusPending} value={counts?.pending ?? 0} href="/admin/kyc" active={filter === "pending"} tone="warn" />
        <PeopleCard
          label={k.statusApproved}
          value={counts?.approved ?? 0}
          href="/admin/kyc?show=approved"
          active={filter === "approved"}
        />
        <PeopleCard
          label={k.statusRejected}
          value={counts?.rejected ?? 0}
          href="/admin/kyc?show=rejected"
          active={filter === "rejected"}
        />
        <PeopleCard label={t.admin.filterAll} value={counts?.everyone ?? 0} href="/admin/kyc?show=all" active={filter === "all"} />
      </div>

      {docs.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface px-5 py-12 text-center text-sm text-ink-soft">
          {filter === "pending" ? k.queueEmpty : k.noneHere}
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {docs.map((d) => (
            <li key={d.id} className="rounded-xl border border-line bg-surface p-5 shadow-soft sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-3.5">
                  <KycMark status={d.status} />
                  <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/users/${d.user_id}`} className="font-medium text-brand hover:text-brand-bright">
                      {d.full_name}
                    </Link>
                    <StatusPill status={d.status} t={t} />
                  </div>
                  <p className="tabular mt-0.5 text-sm text-ink-soft">
                    {d.phone}
                    {d.clan_code ? ` · ${d.clan_name} (${d.clan_code})` : ` · ${t.donations.noClan}`}
                  </p>

                  <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">{t.profile.docType}</dt>
                      <dd className="font-medium text-ink">{t.profile.docTypes[d.doc_type]}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t.profile.docNumber}</dt>
                      <dd className="tabular font-medium text-ink">{d.doc_number}</dd>
                    </div>
                    {d.issued_on && (
                      <div>
                        <dt className="text-muted">{t.profile.issuedOn}</dt>
                        <dd className="font-medium text-ink">{formatDate(d.issued_on, locale)}</dd>
                      </div>
                    )}
                    {d.expires_on && (
                      <div>
                        <dt className="text-muted">{t.profile.expiresOn}</dt>
                        <dd className="font-medium text-ink">{formatDate(d.expires_on, locale)}</dd>
                      </div>
                    )}
                  </dl>

                  {d.note && <p className="mt-2 text-sm text-ink-soft">{d.note}</p>}
                  <p className="mt-2 text-xs text-muted">{fmt(k.sentOn, { date: formatDate(d.created_at, locale) })}</p>
                  {d.status !== "pending" && d.verified_at && d.verified_by_name && (
                    <p className="mt-0.5 text-xs text-muted">
                      {fmt(d.status === "approved" ? k.approvedBy : k.rejectedBy, {
                        name: d.verified_by_name,
                        date: formatDate(d.verified_at, locale),
                      })}
                    </p>
                  )}
                  {d.status === "rejected" && d.review_note && (
                    <p className="mt-1.5 rounded-md bg-bad-wash px-2.5 py-1.5 text-sm text-bad">{d.review_note}</p>
                  )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-3 lg:items-end">
                  {d.file_id ? (
                    <a
                      href={`/files/${d.file_id}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium whitespace-nowrap text-brand hover:bg-brand-wash"
                    >
                      <FileIcon width={16} height={16} />
                      {k.openScan}
                    </a>
                  ) : (
                    <p className="text-xs text-warn">{k.noScan}</p>
                  )}
                  <KycReview documentId={d.id} decided={d.status !== "pending"} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {docs.length === 200 && <p className="mt-3 text-xs text-muted">{fmt(k.limited, { n: formatNumber(200) })}</p>}
    </>
  );
}
