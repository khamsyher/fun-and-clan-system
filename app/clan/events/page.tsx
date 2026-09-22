import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { EventList } from "@/components/event-list";
import { buttonPrimary } from "@/components/ui";
import { requireRole } from "@/lib/dal";
import { listEvents } from "@/lib/events";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).events.metaTitle };
}

export default async function EventsPage() {
  const leader = await requireRole("clan_admin");
  const [t, locale, events] = await Promise.all([getT(), getLocale(), listEvents(leader.clanId!)]);

  return (
    <>
      <PageHeading title={t.events.title} lede={t.events.lede}>
        <Link href="/clan/events/new" className={`${buttonPrimary} shrink-0`}>
          {t.events.report}
        </Link>
      </PageHeading>
      <div className="mt-8">
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <p className="font-medium text-ink">{t.events.empty}</p>
            <p className="mt-1 text-sm text-ink-soft">{t.events.emptyBody}</p>
          </div>
        ) : (
          <EventList events={events} hrefBase="/clan/events" t={t} locale={locale} />
        )}
      </div>
    </>
  );
}
