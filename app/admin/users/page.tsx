import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { Pill, StatusBadge } from "@/components/badge";
import { ArrowRightIcon } from "@/components/icons";
import { Notice } from "@/components/ui";
import { requireRole } from "@/lib/dal";
import { formatDate, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { countPeople, listUsers, USER_LIST_LIMIT } from "@/lib/users";
import { PeopleCard } from "../people-card";
import { BlockButton, DeleteButton } from "./user-actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).users.metaTitle };
}

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireRole("super_admin");
  const [t, locale, sp] = await Promise.all([getT(), getLocale(), searchParams]);
  const u = t.users;
  const people = typeof sp.people === "string" ? sp.people : "all";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const [counts, users] = await Promise.all([countPeople(), listUsers({ people, q })]);

  // Keeps the search while switching card, and the card while searching.
  const cardHref = (filter: string) => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("people", filter);
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `/admin/users?${query}` : "/admin/users";
  };

  return (
    <>
      <PageHeading title={u.title} lede={u.lede} />

      {sp.done === "deleted" && (
        <div className="mt-4">
          <Notice tone="success">{u.deleted}</Notice>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <PeopleCard label={t.admin.filterAll} value={counts?.everyone ?? 0} href={cardHref("all")} active={people === "all"} />
        <PeopleCard label={t.admin.filterLeaders} value={counts?.leaders ?? 0} href={cardHref("leaders")} active={people === "leaders"} />
        <PeopleCard label={t.admin.filterMembers} value={counts?.members ?? 0} href={cardHref("members")} active={people === "members"} />
        <PeopleCard label={t.admin.filterGeneral} value={counts?.general ?? 0} href={cardHref("general")} active={people === "general"} />
        <PeopleCard
          label={t.admin.filterWaiting}
          value={counts?.waiting ?? 0}
          href={cardHref("waiting")}
          active={people === "waiting"}
          tone="warn"
        />
      </div>

      {/* A plain GET form, so a search can be bookmarked and shared. */}
      <form className="mt-4 flex flex-wrap gap-2" action="/admin/users">
        {people !== "all" && <input type="hidden" name="people" value={people} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={u.searchPlaceholder}
          aria-label={u.search}
          className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-muted/80 outline-none focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
        />
        <button type="submit" className="h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-2">
          {u.search}
        </button>
        {q && (
          <Link
            href={people === "all" ? "/admin/users" : `/admin/users?people=${people}`}
            className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-sunken"
          >
            {u.clearSearch}
          </Link>
        )}
      </form>

      <p className="mt-4 text-sm text-muted">
        {q ? fmt(u.found, { n: formatNumber(users.length), q }) : fmt(t.admin.usersCount, { n: formatNumber(counts?.everyone ?? 0) })}
      </p>

      {users.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-line-strong bg-surface px-5 py-10 text-center text-sm text-ink-soft">
          {t.admin.noUsers}
        </p>
      ) : (
        <div className="relative mt-3 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">{t.admin.colPerson}</th>
                <th className="px-4 py-3 font-medium">{t.clan.colPhone}</th>
                <th className="px-4 py-3 font-medium">{t.admin.colRole}</th>
                <th className="px-4 py-3 font-medium">{t.member.clan}</th>
                <th className="px-4 py-3 font-medium">{t.admin.colStatus}</th>
                <th className="px-4 py-3 font-medium">{u.lastSignIn}</th>
                <th className="px-4 py-3">
                  <span className="sr-only">{t.admin.colActions}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Link href={`/admin/users/${p.id}`} className="font-medium text-brand hover:text-brand-bright">
                      {p.full_name}
                    </Link>
                    {p.is_treasurer && (
                      <span className="ml-2 align-middle">
                        <Pill tone="info">{t.treasurer.badge}</Pill>
                      </span>
                    )}
                    {p.email && <p className="text-xs text-muted">{p.email}</p>}
                  </td>
                  <td className="tabular px-4 py-3.5 whitespace-nowrap text-ink-soft">{p.phone}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink-soft">{t.roles[p.role]}</td>
                  <td className="px-4 py-3.5">
                    {p.clan_name ? (
                      <>
                        <span className="whitespace-nowrap text-ink-soft">{p.clan_name}</span>
                        <span className="block text-xs font-semibold tracking-[0.06em] text-brand">{p.clan_code}</span>
                      </>
                    ) : (
                      <span className="text-muted">{t.donations.noClan}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink-soft">
                    {p.last_login_at ? formatDate(p.last_login_at, locale) : <span className="text-muted">{u.never}</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {p.role === "super_admin" ? (
                        <span className="px-2 text-xs text-muted">{u.protected}</span>
                      ) : (
                        <>
                          {/* Only an account that can sign in is worth blocking, or unblocking. */}
                          {(p.status === "active" || p.status === "disabled") && (
                            <BlockButton userId={p.id} name={p.full_name} blocked={p.status === "disabled"} />
                          )}
                          <DeleteButton userId={p.id} name={p.full_name} />
                        </>
                      )}
                      {/* Everything about one person, and the rest of the actions, live on their page. */}
                      <Link
                        href={`/admin/users/${p.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-brand hover:bg-brand-wash"
                      >
                        <ArrowRightIcon width={16} height={16} />
                        {u.viewDetails}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {users.length === USER_LIST_LIMIT && (
        <p className="mt-3 text-xs text-muted">
          {fmt(t.admin.usersLimited, { shown: formatNumber(users.length), n: formatNumber(counts?.everyone ?? 0) })}
        </p>
      )}
    </>
  );
}
