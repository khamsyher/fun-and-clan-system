import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandName } from "@/components/brand";
import { DonationProgress } from "@/components/donation-progress";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Pill } from "@/components/badge";
import { ShareButtons } from "@/components/share-buttons";
import { buttonPrimary } from "@/components/button-styles";
import { getCurrentUser } from "@/lib/dal";
import { getRequest } from "@/lib/donations";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { shareUrl, siteUrl } from "@/lib/site-url";

/** Public preview for shared links: story and progress only — no bank details, no donor names. */
export async function generateMetadata({ params }: PageProps<"/d/[id]">): Promise<Metadata> {
  const { id } = await params;
  const request = await getRequest(id);
  if (!request) return { title: "Clan Fund" };
  const base = await siteUrl();
  return {
    title: request.title,
    description: request.story.slice(0, 200),
    openGraph: {
      title: request.title,
      description: request.story.slice(0, 200),
      url: `${base}/d/${id}`,
      type: "article",
      images: request.photo_file_id ? [{ url: `${base}/d/${id}/photo` }] : undefined,
    },
    twitter: { card: request.photo_file_id ? "summary_large_image" : "summary" },
    robots: { index: false }, // shareable, but not something to index
  };
}

export default async function PublicRequestPage({ params }: PageProps<"/d/[id]">) {
  const { id } = await params;
  const [t, locale, request, viewer] = await Promise.all([getT(), getLocale(), getRequest(id), getCurrentUser()]);
  if (!request || request.status === "cancelled") notFound();
  const d = t.donations;
  const url = await shareUrl(request.id);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <BrandName />
          <LanguageSwitcher tone="compact" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl tracking-[-0.02em] text-brand-deep sm:text-4xl">{request.title}</h1>
            <p className="mt-1 text-ink-soft">
              {fmt(d.byFrom, { name: request.creator_name, clan: request.clan_name ?? d.noClan })} · {formatDate(request.created_at, locale)}
            </p>
          </div>
          <Pill tone={request.status === "open" ? "ok" : "mute"}>{request.status === "open" ? d.open : d.closed}</Pill>
        </div>

        {request.photo_file_id && (
          // eslint-disable-next-line @next/next/no-img-element -- public cover photo served by its own route
          <img src={`/d/${request.id}/photo`} alt="" className="mt-6 max-h-96 w-full rounded-xl border border-line object-cover" />
        )}

        <section className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-6">
          <DonationProgress
            raised={Number(request.raised)}
            target={request.target_amount ? Number(request.target_amount) : null}
            donors={Number(request.donors)}
            t={t}
            size="lg"
          />
          {request.deadline && <p className="mt-2 text-sm text-muted">{fmt(d.deadline, { date: formatDate(request.deadline, locale) })}</p>}
          {request.status !== "open" && <p className="mt-3 text-sm text-ink-soft">{d.closedNote}</p>}
        </section>

        <section className="mt-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-semibold text-ink">{d.story}</h2>
          <p className="mt-2 leading-relaxed whitespace-pre-wrap text-ink-soft">{request.story}</p>
        </section>

        {/* Signed-in readers go straight to the full request; everyone else is invited to sign in. */}
        {request.status === "open" && (
          <section className="mt-4 rounded-xl border border-brand-bright/40 bg-surface p-5 text-center sm:p-6">
            {viewer ? (
              <Link href={`/donations/${request.id}`} className={`${buttonPrimary} w-full sm:w-auto`}>
                {d.openInApp}
              </Link>
            ) : (
              <>
                <p className="text-ink-soft">{d.publicNote}</p>
                <Link href={`/login?next=/donations/${request.id}`} className={`${buttonPrimary} mt-4 w-full sm:w-auto`}>
                  {d.publicSignIn}
                </Link>
              </>
            )}
          </section>
        )}

        <div className="mt-4">
          <ShareButtons url={url} title={request.title} />
        </div>

        <p className="mt-8 text-center text-sm text-muted">{d.publicFooter}</p>
      </main>
    </div>
  );
}
