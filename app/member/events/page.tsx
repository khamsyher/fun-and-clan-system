import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { EventList } from "@/components/event-list";
import { buttonPrimary } from "@/components/button-styles";
import { requireRole } from "@/lib/dal";
import { listEvents } from "@/lib/events";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).events.metaTitle };
}

export default async function MemberEventsPage() {
  const me = await requireRole("member");
  const [t, locale, events] = await Promise.all([getT(), getLocale(), listEvents(me.clanId!)]);
  const visible = events.filter((e) => e.status !== "cancelled");

  return (
    <>
      <PageHeading title={t.events.title} lede={t.events.lede}>
        <Link href="/member/events/new" className={`${buttonPrimary} shrink-0`}>
          {t.events.report}
        </Link>
      </PageHeading>
      <div className="mt-8">
        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <p className="font-medium text-ink">{t.events.empty}</p>
          </div>
        ) : (
          <EventList events={visible} hrefBase="/member/events" t={t} locale={locale} />
        )}
      </div>
    </>
  );
}
