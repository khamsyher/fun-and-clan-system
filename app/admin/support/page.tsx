import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { InboxLive, SupportChat } from "@/components/support-chat";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES } from "@/lib/definitions";
import { formatDate } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { conversation, inbox } from "@/lib/support";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).support.inboxTitle };
}

/** Every person's conversation with the platform team; open one to answer. Live over the socket. */
export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/support">) {
  await requireRole(...STAFF_ROLES);
  const [t, locale, sp] = await Promise.all([getT(), getLocale(), searchParams]);
  const s = t.support;
  const filter = sp.status === "closed" || sp.status === "all" ? sp.status : "open";
  const openId = typeof sp.t === "string" ? sp.t : "";
  const [threads, current] = await Promise.all([inbox(filter), openId ? conversation(openId) : null]);

  const href = (params: { status?: string; t?: string }) => {
    const q = new URLSearchParams();
    const st = params.status ?? filter;
    if (st !== "open") q.set("status", st);
    if (params.t) q.set("t", params.t);
    const qs = q.toString();
    return qs ? `/admin/support?${qs}` : "/admin/support";
  };

  return (
    <>
      <PageHeading title={s.inboxTitle} lede={s.inboxLede} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="mb-3 flex gap-1 text-sm">
            {(["open", "closed", "all"] as const).map((k) => (
              <Link
                key={k}
                href={href({ status: k, t: openId || undefined })}
                className={`rounded-md px-2.5 py-1 font-medium ${filter === k ? "bg-brand text-white" : "text-ink-soft hover:bg-sunken"}`}
              >
                {s.filter[k]}
              </Link>
            ))}
          </div>
          {threads.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong bg-surface px-4 py-8 text-center text-sm text-ink-soft">{s.noThreads}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {threads.map((th) => {
                const unread = Number(th.unread);
                const active = th.id === openId;
                return (
                  <li key={th.id}>
                    <Link href={href({ t: th.id })} className={`block px-4 py-3 ${active ? "bg-brand-wash" : "hover:bg-sunken/60"}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${unread ? "font-semibold text-ink" : "font-medium text-ink"}`}>{th.full_name}</span>
                        {unread > 0 && (
                          <span className="rounded-full bg-bad px-1.5 text-[0.7rem] font-semibold text-white tabular">{unread}</span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {th.last_from_staff ? `${s.you}: ` : ""}
                        {th.last_body ?? "—"}
                      </span>
                      <span className="mt-0.5 block text-[0.7rem] text-muted">
                        {th.clan_name ?? t.savings.noClan} · {formatDate(th.last_message_at, locale)}
                        {th.status === "closed" && <> · {s.closed}</>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {current ? (
            <>
              <p className="mb-3 text-sm text-ink-soft">
                <Link href={`/admin/users/${current.user_id}`} className="font-medium text-brand hover:text-brand-bright">
                  {current.full_name}
                </Link>{" "}
                · {current.phone}
              </p>
              {/* Keyed by conversation, so switching starts the chat fresh. */}
              <SupportChat
                key={current.id}
                threadId={current.id}
                initial={current.messages}
                status={current.status}
                staff
                otherName={current.full_name}
              />
            </>
          ) : (
            <>
              <InboxLive />
              <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-16 text-center text-sm text-ink-soft">{s.pick}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
