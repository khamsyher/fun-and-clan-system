import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { StatusBadge } from "@/components/badge";
import { ArrowRightIcon } from "@/components/icons";
import { requireRole } from "@/lib/dal";
import { query } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/definitions";
import { formatDate, formatKip, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { ClanTypeSelect, CreateClanForm, type ClanTypeOption, type LeaderCandidate } from "../forms";
import { ClanActiveButton } from "../stat";
import { ClanTabs } from "./clan-tabs";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).clansAdmin.title };
}

type ClanRow = {
  id: string;
  code: string;
  name: string;
  fund_mode: "A" | "B";
  clan_type_id: string | null;
  contribution_amount: string;
  is_active: boolean;
  created_at: Date;
  leader: string | null;
  leader_id: string | null;
  members: string;
  pending: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every clan, searchable and filterable, with the everyday actions on each row. */
export default async function AdminClansPage({ searchParams }: PageProps<"/admin/clans">) {
  await requireRole(...STAFF_ROLES);
  const [t, locale, sp] = await Promise.all([getT(), getLocale(), searchParams]);
  const a = t.admin;
  const c = t.clansAdmin;

  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const status = sp.status === "active" || sp.status === "disabled" ? sp.status : "all";
  const type = typeof sp.type === "string" && (sp.type === "none" || UUID.test(sp.type)) ? sp.type : "";

  const [clans, types, candidates] = await Promise.all([
    query<ClanRow>(
      `SELECT c.id, c.code, c.name, c.fund_mode, c.clan_type_id, c.contribution_amount, c.is_active, c.created_at,
              l.full_name AS leader, l.id AS leader_id,
              COUNT(u.id) FILTER (WHERE u.status = 'active') AS members,
              COUNT(u.id) FILTER (WHERE u.status = 'pending') AS pending
         FROM clans c
         LEFT JOIN LATERAL (
           SELECT id, full_name FROM users WHERE clan_id = c.id AND role = 'clan_admin' ORDER BY created_at LIMIT 1
         ) l ON TRUE
         LEFT JOIN users u ON u.clan_id = c.id AND u.role = 'member'
        WHERE ($1 = '' OR c.name ILIKE '%' || $1 || '%' OR c.code ILIKE '%' || $1 || '%')
          AND ($2 = 'all' OR c.is_active = ($2 = 'active'))
          AND ($3 = '' OR ($3 = 'none' AND c.clan_type_id IS NULL) OR c.clan_type_id::text = $3)
        GROUP BY c.id, l.id, l.full_name
        ORDER BY c.is_active DESC, c.created_at DESC`,
      [q, status, type],
    ),
    query<ClanTypeOption>(`SELECT id, name, is_active FROM clan_types ORDER BY lower(name)`),
    // Who can lead a new clan: general users with no clan whose identity the platform approved.
    query<LeaderCandidate>(
      `SELECT u.id, u.full_name, u.phone FROM users u
        WHERE u.role = 'user' AND u.clan_id IS NULL AND u.status = 'active'
          AND EXISTS (SELECT 1 FROM user_documents d WHERE d.user_id = u.id AND d.status = 'approved')
        ORDER BY lower(u.full_name)`,
    ),
  ]);
  const filtered = q !== "" || status !== "all" || type !== "";

  return (
    <>
      <PageHeading title={c.title} lede={c.lede} />
      <ClanTabs t={t} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {/* A plain GET form, so a filtered list can be bookmarked and shared. */}
          <form action="/admin/clans" className="mt-6 flex flex-wrap gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={c.searchPlaceholder}
              aria-label={c.search}
              className="h-11 min-w-0 flex-1 basis-56 rounded-lg border border-line-strong bg-surface px-3.5 text-base text-ink outline-none placeholder:text-muted/80 focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
            />
            <select name="status" defaultValue={status} aria-label={a.colStatus} className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm">
              <option value="all">{c.statusAll}</option>
              <option value="active">{c.statusActive}</option>
              <option value="disabled">{c.statusDisabled}</option>
            </select>
            {types.length > 0 && (
              <select name="type" defaultValue={type} aria-label={t.clanTypes.clanType} className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm">
                <option value="">{c.typeAll}</option>
                <option value="none">{t.clanTypes.none}</option>
                {types.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" className="h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-2">
              {c.search}
            </button>
            {filtered && (
              <Link href="/admin/clans" className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-sunken">
                {c.clear}
              </Link>
            )}
          </form>

          <Section title={a.clans} aside={fmt(a.total, { n: clans.length })}>
            {clans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
                <p className="font-medium text-ink">{filtered ? c.noMatch : a.noClans}</p>
                {!filtered && <p className="mt-1 text-sm text-ink-soft">{a.noClansBody}</p>}
              </div>
            ) : (
              <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                    <tr>
                      <th className="px-4 py-3 font-medium">{a.colClan}</th>
                      <th className="px-4 py-3 font-medium">{a.colLeader}</th>
                      <th className="px-4 py-3 text-right font-medium">{a.colMembers}</th>
                      <th className="px-4 py-3 font-medium">{a.colRate}</th>
                      <th className="px-4 py-3 font-medium">{a.colStatus}</th>
                      <th className="px-4 py-3">
                        <span className="sr-only">{a.colActions}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {clans.map((row) => (
                      <tr key={row.id} className="align-middle">
                        <td className="px-4 py-3.5">
                          <Link href={`/admin/clans/${row.id}`} className="font-medium text-ink hover:text-brand">
                            {row.name}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted">
                            <span className="font-semibold tracking-[0.06em] text-brand">{row.code}</span> ·{" "}
                            {fmt(a.since, { date: formatDate(row.created_at, locale) })}
                          </p>
                          {types.length > 0 && (
                            <div className="mt-1.5">
                              <ClanTypeSelect clanId={row.id} current={row.clan_type_id} types={types} />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-ink-soft">
                          {row.leader_id ? (
                            <Link href={`/admin/users/${row.leader_id}`} className="hover:text-brand">
                              {row.leader}
                            </Link>
                          ) : (
                            <span className="text-warn">{c.noLeader}</span>
                          )}
                        </td>
                        <td className="tabular px-4 py-3.5 text-right">
                          {formatNumber(row.members)}
                          {Number(row.pending) > 0 && <span className="block text-xs text-warn">{fmt(a.waiting, { n: row.pending })}</span>}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-ink-soft">
                          <span className="tabular">{formatKip(row.contribution_amount)}</span>
                          <span className="block text-xs text-muted">{fmt(a.mode, { m: row.fund_mode })}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={row.is_active ? "enabled" : "off"} />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <ClanActiveButton clanId={row.id} active={row.is_active} labels={a} />
                            <Link
                              href={`/admin/clans/${row.id}`}
                              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-brand hover:bg-brand-wash"
                            >
                              <ArrowRightIcon width={16} height={16} />
                              {t.users.viewDetails}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title={a.newClan}>
            <div className="rounded-xl border border-line bg-surface p-5">
              <CreateClanForm types={types} candidates={candidates} />
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
