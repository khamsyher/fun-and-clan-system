import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { ArrowRightIcon } from "@/components/icons";
import { requireRole } from "@/lib/dal";
import { query, queryOne } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/definitions";
import { formatDate, formatKip, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import type { GroupStatus, SavingsPeriod } from "@/lib/savings";
import { Stat } from "../stat";
import { GROUP_TONE } from "./tones";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).savingsAdmin.title };
}

const STATUSES: GroupStatus[] = ["forming", "active", "completed", "cancelled"];

type GroupItem = {
  id: string;
  name: string;
  invite_code: string;
  organizer_id: string;
  organizer_name: string;
  amount: string;
  period: SavingsPeriod;
  status: GroupStatus;
  created_at: Date;
  members: string;
  pending: string;
  rounds_done: string;
  rounds: string;
};

/** Every savings group on the platform: how many there are, and who runs and belongs to each. */
export default async function AdminSavingsPage({ searchParams }: PageProps<"/admin/savings">) {
  await requireRole(...STAFF_ROLES);
  const [t, locale, sp] = await Promise.all([getT(), getLocale(), searchParams]);
  const s = t.savingsAdmin;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const status = typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status) ? sp.status : "";

  const [totals, groups] = await Promise.all([
    queryOne<{ groups: string; forming: string; active: string; completed: string; cancelled: string; people: string; pending: string }>(
      `SELECT (SELECT COUNT(*) FROM savings_groups) AS groups,
              (SELECT COUNT(*) FROM savings_groups WHERE status = 'forming') AS forming,
              (SELECT COUNT(*) FROM savings_groups WHERE status = 'active') AS active,
              (SELECT COUNT(*) FROM savings_groups WHERE status = 'completed') AS completed,
              (SELECT COUNT(*) FROM savings_groups WHERE status = 'cancelled') AS cancelled,
              (SELECT COUNT(DISTINCT user_id) FROM savings_members WHERE status = 'approved') AS people,
              (SELECT COUNT(*) FROM savings_members WHERE status = 'pending') AS pending`,
    ),
    query<GroupItem>(
      `SELECT g.id, g.name, g.invite_code, g.organizer_id, o.full_name AS organizer_name, g.amount, g.period, g.status, g.created_at,
              COUNT(m.id) FILTER (WHERE m.status = 'approved') AS members,
              COUNT(m.id) FILTER (WHERE m.status = 'pending') AS pending,
              (SELECT COUNT(*) FROM savings_rounds r WHERE r.group_id = g.id AND r.status = 'done') AS rounds_done,
              (SELECT COUNT(*) FROM savings_rounds r WHERE r.group_id = g.id) AS rounds
         FROM savings_groups g
         JOIN users o ON o.id = g.organizer_id
         LEFT JOIN savings_members m ON m.group_id = g.id
        WHERE ($1 = '' OR g.name ILIKE '%' || $1 || '%' OR g.invite_code ILIKE '%' || $1 || '%' OR o.full_name ILIKE '%' || $1 || '%')
          AND ($2 = '' OR g.status::text = $2)
        GROUP BY g.id, o.full_name
        ORDER BY (g.status IN ('forming', 'active')) DESC, g.created_at DESC
        LIMIT 300`,
      [q, status],
    ),
  ]);
  const filtered = q !== "" || status !== "";

  return (
    <>
      <PageHeading title={s.title} lede={s.lede} />

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-soft sm:grid-cols-4">
        <Stat label={s.statGroups} value={formatNumber(totals?.groups ?? 0)} note={fmt(s.statGroupsNote, { n: formatNumber(totals?.active ?? 0) })} highlight />
        <Stat label={t.savings.groupStatus.forming} value={formatNumber(totals?.forming ?? 0)} note={s.statFormingNote} />
        <Stat label={s.statPeople} value={formatNumber(totals?.people ?? 0)} note={s.statPeopleNote} />
        <Stat label={s.statPending} value={formatNumber(totals?.pending ?? 0)} note={s.statPendingNote} />
      </dl>

      {/* A plain GET form, so a filtered list can be bookmarked and shared. */}
      <form action="/admin/savings" className="mt-6 flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={s.searchPlaceholder}
          aria-label={t.clansAdmin.search}
          className="h-11 min-w-0 flex-1 basis-56 rounded-lg border border-line-strong bg-surface px-3.5 text-base text-ink outline-none placeholder:text-muted/80 focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
        />
        <select name="status" defaultValue={status} aria-label={t.admin.colStatus} className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm">
          <option value="">{t.clansAdmin.statusAll}</option>
          {STATUSES.map((x) => (
            <option key={x} value={x}>
              {t.savings.groupStatus[x]} ({formatNumber(totals?.[x] ?? 0)})
            </option>
          ))}
        </select>
        <button type="submit" className="h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-2">
          {t.clansAdmin.search}
        </button>
        {filtered && (
          <Link href="/admin/savings" className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-sunken">
            {t.clansAdmin.clear}
          </Link>
        )}
      </form>

      <Section title={s.groups} aside={fmt(t.admin.total, { n: groups.length })}>
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-10 text-center text-sm text-ink-soft">
            {filtered ? s.noMatch : s.empty}
          </p>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">{t.admin.colGroup}</th>
                  <th className="px-4 py-3 font-medium">{s.colOrganizer}</th>
                  <th className="px-4 py-3 text-right font-medium">{s.colMembers}</th>
                  <th className="px-4 py-3 font-medium">{s.colAmount}</th>
                  <th className="px-4 py-3 font-medium">{t.admin.colStatus}</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">{t.users.viewDetails}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {groups.map((g) => (
                  <tr key={g.id} className="align-middle">
                    <td className="px-4 py-3.5">
                      <Link href={`/admin/savings/${g.id}`} className="font-medium text-ink hover:text-brand">
                        {g.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        <span className="font-semibold tracking-[0.06em] text-brand">{g.invite_code}</span> · {formatDate(g.created_at, locale)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-ink-soft">
                      <Link href={`/admin/users/${g.organizer_id}`} className="hover:text-brand">
                        {g.organizer_name}
                      </Link>
                    </td>
                    <td className="tabular px-4 py-3.5 text-right">
                      {formatNumber(g.members)}
                      {Number(g.pending) > 0 && <span className="block text-xs text-warn">{fmt(t.admin.waiting, { n: g.pending })}</span>}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink-soft">
                      <span className="tabular">{formatKip(g.amount)}</span>
                      <span className="block text-xs text-muted">{t.savings.periodLabel[g.period]}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Pill tone={GROUP_TONE[g.status]}>{t.savings.groupStatus[g.status]}</Pill>
                      {Number(g.rounds) > 0 && (
                        <span className="mt-0.5 block text-xs text-muted">{fmt(s.roundsDone, { done: g.rounds_done, total: g.rounds })}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/admin/savings/${g.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-brand hover:bg-brand-wash"
                      >
                        <ArrowRightIcon width={16} height={16} />
                        {t.users.viewDetails}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
