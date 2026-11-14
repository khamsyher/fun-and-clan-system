import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { EventBadge } from "@/components/badge";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES } from "@/lib/definitions";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { listPlatformEvents } from "@/lib/events";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).events.metaTitle };
}

export default async function AdminEventsPage({ searchParams }: PageProps<"/admin/events">) {
  await requireRole(...STAFF_ROLES);
  const [t, locale, sp] = await Promise.all([getT(), getLocale(), searchParams]);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const statuses = ["collecting", "awaiting_payout", "completed", "cancelled"] as const;
  const status = statuses.includes(sp.status as (typeof statuses)[number]) ? sp.status as (typeof statuses)[number] : "all";
  const events = await listPlatformEvents({ q, status });
  const e = t.events;

  return (
    <>
      <PageHeading title={e.title} lede={e.lede} />
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/admin/events/new" className="inline-flex h-11 items-center justify-center rounded-lg bg-brand px-5 font-semibold text-white shadow-soft hover:bg-brand-2">
          {e.report}
        </Link>
        <Link href="/admin/events/slips" className="inline-flex h-11 items-center justify-center rounded-lg border border-line-strong bg-surface px-5 font-semibold text-brand hover:bg-brand-wash">
          {t.slips.title}
        </Link>
      </div>

      <form action="/admin/events" className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium text-ink">
          {e.search}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={e.adminSearchPlaceholder}
            className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-base outline-none focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          {t.admin.colStatus}
          <select
            name="status"
            defaultValue={status}
            className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-base outline-none focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
          >
            <option value="all">{e.allStatuses}</option>
            {statuses.map((value) => <option key={value} value={value}>{e.status[value]}</option>)}
          </select>
        </label>
        <button type="submit" className="inline-flex h-11 items-center justify-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-2">
          {t.reports.apply}
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-surface shadow-soft">
        {events.length === 0 ? (
          <p className="px-5 py-10 text-center text-ink-soft">{q || status !== "all" ? e.noSearchResults : e.empty}</p>
        ) : (
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">{t.reports.colEvent}</th>
                <th className="px-4 py-3 font-medium">{t.admin.colClan}</th>
                <th className="px-4 py-3 font-medium">{t.reports.colDeceased}</th>
                <th className="px-4 py-3 font-medium">{e.dateOfDeath}</th>
                <th className="px-4 py-3 font-medium">{t.admin.colStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/events/${event.id}`} className="font-semibold text-brand hover:text-brand-bright">
                      {fmt(e.eventNo, { n: event.event_no })}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{event.clan_name}</p>
                    <p className="text-xs font-semibold tracking-wide text-brand">{event.clan_code}</p>
                  </td>
                  <td className="px-4 py-3 text-ink">{event.deceased_name}</td>
                  <td className="px-4 py-3 text-ink-soft">{formatDate(event.date_of_death, locale)}</td>
                  <td className="px-4 py-3"><EventBadge status={event.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {events.length === 500 && <p className="mt-3 text-sm text-muted">{e.platformLimited}</p>}
    </>
  );
}
