import Link from "next/link";
import { CollectionProgress } from "./collection-progress";
import { EventBadge } from "./badge";
import { formatDate, formatKip } from "@/lib/format";
import { fmt, type Dictionary, type Locale } from "@/lib/i18n/config";
import type { EventRow } from "@/lib/events";

/** Shared by the leader's and the members' event lists. */
export function EventList({ events, hrefBase, t, locale }: { events: EventRow[]; hrefBase: string; t: Dictionary; locale: Locale }) {
  return (
    <ul className="space-y-3">
      {events.map((e) => (
        <li key={e.id}>
          <Link
            href={`${hrefBase}/${e.id}`}
            className="block rounded-xl border border-line bg-surface p-5 transition-[border-color,box-shadow] hover:border-brand-bright/40 hover:shadow-soft"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-brand">{fmt(t.events.eventNo, { n: e.event_no })}</p>
                <p className="mt-0.5 font-display text-xl text-brand-deep">{e.deceased_name}</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {deceasedLine(e, t)} · {t.events.dateOfDeath}: {formatDate(e.date_of_death, locale)}
                </p>
              </div>
              <EventBadge status={e.status} />
            </div>
            {e.fund_mode === "B" && e.status !== "cancelled" ? (
              <div className="mt-4">
                <CollectionProgress
                  paid={Number(e.bills_paid)}
                  total={Number(e.bills_total)}
                  raised={Number(e.raised)}
                  expected={Number(e.expected)}
                  t={t.events}
                  size="sm"
                />
              </div>
            ) : (
              e.fund_mode === "A" && (
                <p className="mt-3 text-sm text-ink-soft">
                  {t.events.modeAEvent} · {formatKip(e.rate_amount)}
                </p>
              )
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function deceasedLine(e: Pick<EventRow, "deceased_relationship" | "family_name">, t: Dictionary) {
  return e.deceased_relationship
    ? fmt(t.events.relOf, { rel: t.family.rel[e.deceased_relationship], member: e.family_name })
    : t.events.self;
}
