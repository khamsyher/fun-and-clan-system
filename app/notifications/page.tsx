import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { markAllRead } from "@/app/actions/notifications";
import { requireRole } from "@/lib/dal";
import { getLocale, getT } from "@/lib/i18n/server";
import { renderNotification } from "@/lib/notification-text";
import { listNotifications, unreadCount } from "@/lib/notify";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).notifications.metaTitle };
}

export default async function NotificationsPage() {
  const me = await requireRole();
  const [t, locale, rows, unread] = await Promise.all([getT(), getLocale(), listNotifications(me.id), unreadCount(me.id)]);
  const n = t.notifications;
  const items = rows.map((r) => renderNotification(r, t, locale));

  return (
    <>
      <PageHeading title={n.title} lede={n.lede}>
        {unread > 0 && (
          <form action={markAllRead}>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-sunken"
            >
              {n.markAll}
            </button>
          </form>
        )}
      </PageHeading>

      <div className="mt-8">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <p className="font-medium text-ink">{n.empty}</p>
            <p className="mt-1 text-sm text-ink-soft">{n.emptyBody}</p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {items.map((item) => {
              const body = (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={item.unread ? "font-medium text-ink" : "text-ink-soft"}>{item.text}</p>
                    <p className="mt-0.5 text-xs text-muted">{item.when}</p>
                  </div>
                  {item.unread && <Pill tone="info">{n.new}</Pill>}
                </div>
              );
              return (
                <li key={item.id} className={item.unread ? "bg-brand-wash/40" : ""}>
                  {item.link ? (
                    <Link href={item.link} className="block p-4 transition-colors hover:bg-sunken sm:px-5">
                      {body}
                    </Link>
                  ) : (
                    <div className="p-4 sm:px-5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
