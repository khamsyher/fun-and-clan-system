import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { DonationProgress } from "@/components/donation-progress";
import { FileIcon } from "@/components/icons";
import { Notice } from "@/components/ui";
import { requireRole } from "@/lib/dal";
import { getRequest, listDonations } from "@/lib/donations";
import { formatDate, formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { CloseRequestButton, DonateForm, ReviewDonationForm } from "./controls";
import { ShareButtons } from "@/components/share-buttons";
import { shareUrl } from "@/lib/site-url";
import { PencilIcon } from "@/components/icons";

export async function generateMetadata({ params }: PageProps<"/donations/[id]">): Promise<Metadata> {
  const r = await getRequest((await params).id);
  return { title: r ? r.title : (await getT()).donations.metaTitle };
}

export default async function DonationRequestPage({ params, searchParams }: PageProps<"/donations/[id]">) {
  const me = await requireRole();
  const [{ id }, sp, t, locale] = await Promise.all([params, searchParams, getT(), getLocale()]);
  const d = t.donations;

  const request = await getRequest(id);
  if (!request || request.status === "cancelled") notFound();
  const publicUrl = await shareUrl(request.id);

  const isOwner = request.created_by === me.id;
  const donations = await listDonations(request.id, me.id, isOwner);
  const pending = donations.filter((x) => x.status === "pending");
  const confirmed = donations.filter((x) => x.status === "confirmed");
  const myPending = pending.filter((x) => x.donor_id === me.id);
  const canGive = !isOwner && request.status === "open" && me.role !== "super_admin";

  return (
    <>
      <Link href="/donations" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {d.back}
      </Link>

      {sp.sent === "1" && (
        <div className="mt-4">
          <Notice tone="success">{fmt(d.sent, { name: request.creator_name })}</Notice>
        </div>
      )}
      {sp.saved === "1" && (
        <div className="mt-4">
          <Notice tone="success">{d.saved}</Notice>
        </div>
      )}

      <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-[-0.02em] text-brand-deep sm:text-4xl">{request.title}</h1>
          <p className="mt-1 text-ink-soft">
            {fmt(d.byFrom, {
              name: request.creator_name,
              clan: request.clan_name ? `${request.clan_name} (${request.clan_code})` : d.noClan,
            })}{" · "}
            {formatDate(request.created_at, locale)}
            {request.updated_at > request.created_at && (
              <span className="text-muted"> · {fmt(d.updatedOn, { date: formatDate(request.updated_at, locale) })}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isOwner && (
            <Link
              href={`/donations/${request.id}/edit`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-sunken"
            >
              <PencilIcon width={16} height={16} />
              {d.edit}
            </Link>
          )}
          <Pill tone={request.status === "open" ? "ok" : "mute"}>{request.status === "open" ? d.open : d.closed}</Pill>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {request.photo_file_id && (
            // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked upload
            <img src={`/files/${request.photo_file_id}`} alt="" className="max-h-96 w-full rounded-xl border border-line object-cover" />
          )}
          <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-semibold text-ink">{d.story}</h2>
            <p className="mt-2 leading-relaxed whitespace-pre-wrap text-ink-soft">{request.story}</p>
            {request.deadline && (
              <p className="mt-3 text-sm text-muted">{fmt(d.deadline, { date: formatDate(request.deadline, locale) })}</p>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <DonationProgress
              raised={Number(request.raised)}
              target={request.target_amount ? Number(request.target_amount) : null}
              donors={Number(request.donors)}
              t={t}
              size="lg"
            />
            {request.status !== "open" && <p className="mt-3 text-sm text-ink-soft">{d.closedNote}</p>}
            {myPending.length > 0 && <p className="mt-3 text-sm text-warn">{d.waiting}</p>}
            {canGive && (
              <div className="mt-5 border-t border-line pt-5">
                <DonateForm requestId={request.id} />
              </div>
            )}
            {isOwner && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                <p className="text-sm text-ink-soft">{d.closeBody}</p>
                <CloseRequestButton requestId={request.id} isOpen={request.status === "open"} />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-semibold text-ink">{d.howToGive}</h2>
            {request.account_number || request.qr_file_id ? (
              <>
                <dl className="mt-3 space-y-2 text-sm">
                  {request.bank_name && <Row label={d.fBank} value={request.bank_name} />}
                  {request.account_name && <Row label={d.fAccountName} value={request.account_name} />}
                  {request.account_number && <Row label={d.fAccountNumber} value={request.account_number} tabular />}
                </dl>
                {request.qr_file_id && (
                  // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked upload
                  <img src={`/files/${request.qr_file_id}`} alt={d.fQr} className="mt-4 w-48 rounded-lg border border-line" />
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">{d.noPayment}</p>
            )}
          </section>

          <ShareButtons url={publicUrl} title={request.title} />
        </div>
      </div>

      {isOwner && pending.length > 0 && (
        <Section title={d.pendingForYou} aside={pending.length}>
          <p className="mb-3 text-sm text-ink-soft">{d.pendingBody}</p>
          <ul className="space-y-4">
            {pending.map((x) => (
              <li key={x.id} className="rounded-xl border border-brand-bright/40 bg-surface p-5 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{x.donor_name}</p>
                    <p className="text-sm text-muted">{x.donor_clan ?? d.noClan}</p>
                  </div>
                  <p className="tabular font-display text-2xl text-brand-deep">{formatKip(x.amount)}</p>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{formatDate(x.transfer_date, locale)}</p>
                {x.message && <p className="mt-2 text-sm text-ink-soft">“{x.message}”</p>}
                <a
                  href={`/files/${x.slip_file_id}`}
                  target="_blank"
                  rel="noopener"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-bright"
                >
                  <FileIcon width={16} height={16} />
                  {d.viewSlip}
                </a>
                <ReviewDonationForm donationId={x.id} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={d.donorsTitle} aside={confirmed.length ? formatKip(request.raised) : undefined}>
        {confirmed.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center text-sm text-ink-soft">{d.noDonors}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {confirmed.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {/* A donor can hide their name; the person who asked still sees it. */}
                    {x.anonymous && !isOwner ? d.anonymous : x.donor_name}
                    {(!x.anonymous || isOwner) && <span className="ml-2 text-sm font-normal text-muted">{x.donor_clan ?? d.noClan}</span>}
                  </p>
                  {x.message && <p className="text-sm text-ink-soft">“{x.message}”</p>}
                </div>
                <p className="tabular font-semibold text-ok">{formatKip(x.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function Row({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-medium text-ink ${tabular ? "tabular" : ""}`}>{value}</dd>
    </div>
  );
}
