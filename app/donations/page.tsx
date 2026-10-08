import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { DonationProgress } from "@/components/donation-progress";
import { HeartIcon } from "@/components/icons";
import { buttonPrimary } from "@/components/button-styles";
import { requireRole } from "@/lib/dal";
import { listRequests, myDonations } from "@/lib/donations";
import { formatDate, formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).donations.metaTitle };
}

export default async function DonationsPage() {
  const me = await requireRole();
  const [t, locale, requests, mine] = await Promise.all([getT(), getLocale(), listRequests(), myDonations(me.id)]);
  const d = t.donations;

  return (
    <>
      <PageHeading title={d.title} lede={d.lede}>
        {me.role !== "super_admin" && (
          <Link href="/donations/new" className={`${buttonPrimary} shrink-0`}>
            <HeartIcon width={18} height={18} />
            {d.create}
          </Link>
        )}
      </PageHeading>

      <div className="mt-8">
        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <p className="font-medium text-ink">{d.empty}</p>
            <p className="mt-1 text-sm text-ink-soft">{d.emptyBody}</p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/donations/${r.id}`}
                  className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition-[border-color,box-shadow] hover:border-brand-bright/40 hover:shadow-soft"
                >
                  {r.photo_file_id && (
                    // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked upload
                    <img src={`/files/${r.photo_file_id}`} alt="" className="h-40 w-full object-cover" />
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-display text-xl text-brand-deep">{r.title}</h2>
                      {r.status === "open" ? (
                        r.created_by === me.id && <Pill tone="info">{d.mine}</Pill>
                      ) : (
                        <Pill tone="mute">{d.closed}</Pill>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">{fmt(d.byFrom, { name: r.creator_name, clan: r.clan_name ?? d.noClan })}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{r.story}</p>
                    <div className="mt-auto pt-4">
                      <DonationProgress raised={Number(r.raised)} target={r.target_amount ? Number(r.target_amount) : null} donors={Number(r.donors)} t={t} />
                      {r.deadline && <p className="mt-1 text-xs text-muted">{fmt(d.deadline, { date: formatDate(r.deadline, locale) })}</p>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mine.length > 0 && (
        <Section title={d.myDonations}>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {mine.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
                <div className="min-w-0">
                  <Link href={`/donations/${x.request_id}`} className="font-medium text-brand hover:text-brand-bright">
                    {x.request_title}
                  </Link>
                  <p className="tabular text-sm text-ink-soft">
                    {formatKip(x.amount)} · {formatDate(x.transfer_date, locale)}
                  </p>
                  {x.status === "rejected" && x.review_note && <p className="text-sm text-bad">{x.review_note}</p>}
                </div>
                <Pill tone={x.status === "confirmed" ? "ok" : x.status === "rejected" ? "bad" : "warn"}>{d.status[x.status]}</Pill>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
