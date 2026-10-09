import { Pill } from "@/components/badge";
import { FileIcon } from "@/components/icons";
import { KycReview } from "@/components/kyc-review";
import { KycMark } from "@/components/kyc-status";
import { formatDate } from "@/lib/format";
import { maskNumber, type UserDocument } from "@/lib/profile";
import { fmt, type Dictionary, type Locale } from "@/lib/i18n/config";

/**
 * Identity documents. Nobody deletes one: a document that has been sent in is evidence,
 * so it stays and is turned down instead. The person and their clan leader read them,
 * and the platform owner decides on them.
 */
export function DocumentList({
  docs,
  t,
  locale,
  canOpenFile = false,
  canReview = false,
  maskNumbers = false,
  emptyText,
}: {
  docs: UserDocument[];
  t: Dictionary;
  locale: Locale;
  canOpenFile?: boolean;
  canReview?: boolean;
  maskNumbers?: boolean;
  emptyText: string;
}) {
  const f = t.profile;
  if (docs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center text-sm text-ink-soft">
        {emptyText}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {docs.map((d) => (
        <li key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div className="flex min-w-0 gap-3.5">
            <KycMark status={d.status} />
            <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
              {f.docTypes[d.doc_type]}
              <StatusPill status={d.status} t={t} />
            </p>
            <p className="tabular mt-0.5 text-sm text-ink-soft">{maskNumbers ? maskNumber(d.doc_number) : d.doc_number}</p>
            <p className="mt-0.5 text-xs text-muted">
              {d.issued_on && <>{fmt(f.issuedOnDate, { date: formatDate(d.issued_on, locale) })}</>}
              {d.issued_on && d.expires_on && " · "}
              {d.expires_on && <>{fmt(f.expiresOnDate, { date: formatDate(d.expires_on, locale) })}</>}
              {d.status !== "pending" && d.verified_at && d.verified_by_name && (
                <>
                  {(d.issued_on || d.expires_on) && " · "}
                  {fmt(d.status === "approved" ? t.kyc.approvedBy : t.kyc.rejectedBy, {
                    name: d.verified_by_name,
                    date: formatDate(d.verified_at, locale),
                  })}
                </>
              )}
            </p>
            {d.note && <p className="mt-1 text-sm text-ink-soft">{d.note}</p>}
            {d.status === "rejected" && d.review_note && (
              <p className="mt-1.5 rounded-md bg-bad-wash px-2.5 py-1.5 text-sm text-bad">{d.review_note}</p>
            )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {canOpenFile && d.file_id && (
                <a
                  href={`/files/${d.file_id}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-brand hover:bg-brand-wash"
                >
                  <FileIcon width={16} height={16} />
                  {f.viewDocument}
                </a>
              )}
            </div>
            {canReview && <KycReview documentId={d.id} decided={d.status !== "pending"} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StatusPill({ status, t }: { status: UserDocument["status"]; t: Dictionary }) {
  if (status === "approved") return <Pill tone="ok">{t.kyc.statusApproved}</Pill>;
  if (status === "rejected") return <Pill tone="bad">{t.kyc.statusRejected}</Pill>;
  return <Pill tone="warn">{t.kyc.statusPending}</Pill>;
}
