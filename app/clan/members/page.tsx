import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { Pill, StatusBadge } from "@/components/badge";
import { UsersIcon } from "@/components/icons";
import { ResetPasswordButton } from "@/components/reset-password";
import { setTreasurer } from "@/app/actions/fund";
import { requireRole } from "@/lib/dal";
import { query } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import type { Relationship, UserStatus } from "@/lib/definitions";
import { clanRoom } from "@/lib/member-limit";
import { DecisionButton, FamilyCell } from "../member-controls";
import { MemberLimitForm } from "./limit-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).nav.members };
}

type MemberRow = {
  id: string;
  full_name: string;
  phone: string;
  village: string | null;
  status: UserStatus;
  created_at: Date;
  approved_at: Date | null;
  is_treasurer: boolean;
  deceased_at: string | null;
};

const FILTERS = ["active", "disabled", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Everyone in the leader's clan: search, filter by status, and the everyday actions — treasurer,
 * password reset, disable / enable. New registrations are approved on the Overview.
 * Every query is scoped to the leader's own clan_id.
 */
export default async function ClanMembersPage({ searchParams }: PageProps<"/clan/members">) {
  const leader = await requireRole("clan_admin");
  const [t, locale, sp] = await Promise.all([getT(), getLocale(), searchParams]);
  const c = t.clan;
  const m = t.clanMembers;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const filter: Filter = FILTERS.includes(sp.status as Filter) ? (sp.status as Filter) : "active";

  const [people, family, counts, room] = await Promise.all([
    query<MemberRow>(
      `SELECT id, full_name, phone, village, status, created_at, approved_at, is_treasurer, to_char(deceased_at, 'YYYY-MM-DD') AS deceased_at
         FROM users
        WHERE clan_id = $1 AND role = 'member' AND status <> 'pending'
          AND ($2 = 'all' OR status::text = $2)
          AND ($3 = '' OR full_name ILIKE '%' || $3 || '%' OR phone LIKE '%' || $3 || '%' OR village ILIKE '%' || $3 || '%')
        ORDER BY is_treasurer DESC, lower(full_name)`,
      [leader.clanId, filter, q],
    ),
    query<{ member_id: string; full_name: string; relationship: Relationship }>(
      `SELECT d.member_id, d.full_name, d.relationship
         FROM dependents d JOIN users u ON u.id = d.member_id
        WHERE u.clan_id = $1 AND u.role = 'member' AND d.is_active
        ORDER BY d.created_at`,
      [leader.clanId],
    ),
    query<{ status: string; n: string }>(
      `SELECT status::text AS status, COUNT(*) AS n FROM users WHERE clan_id = $1 AND role = 'member' GROUP BY status`,
      [leader.clanId],
    ),
    clanRoom(leader.clanId!),
  ]);
  // Re-enabling or re-approving someone needs a free place.
  const fullNote = room.full ? fmt(m.limitFullShort, { limit: room.limit ?? 0 }) : undefined;

  const count = (s: string) => Number(counts.find((x) => x.status === s)?.n ?? 0);
  const total = { active: count("active"), disabled: count("disabled"), rejected: count("rejected"), all: count("active") + count("disabled") + count("rejected") };
  const waiting = count("pending");
  const familyOf = new Map<string, { full_name: string; relationship: Relationship }[]>();
  for (const d of family) familyOf.set(d.member_id, [...(familyOf.get(d.member_id) ?? []), d]);
  const treasurers = people.filter((p) => p.is_treasurer && p.status === "active");
  const href = (status: Filter) => {
    const params = new URLSearchParams();
    if (status !== "active") params.set("status", status);
    if (q) params.set("q", q);
    const s = params.toString();
    return s ? `/clan/members?${s}` : "/clan/members";
  };

  return (
    <>
      <PageHeading title={t.nav.members} lede={m.lede} />

      {/* Registrations are decided on the Overview; say so here so nobody is left waiting. */}
      {waiting > 0 && (
        <Link
          href="/clan"
          className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-wash px-5 py-3 text-sm font-medium text-warn hover:border-warn/60"
        >
          {fmt(m.waitingNote, { n: waiting })}
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <div className="mt-6">
        <MemberLimitForm limit={room.limit} active={room.active} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {/* A plain GET form, so a search can be bookmarked and shared. */}
        <form action="/clan/members" className="flex min-w-0 flex-1 basis-64 gap-2">
          {filter !== "active" && <input type="hidden" name="status" value={filter} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={m.searchPlaceholder}
            aria-label={m.search}
            className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 text-base text-ink outline-none placeholder:text-muted/80 focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
          />
          <button type="submit" className="h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-2">
            {m.search}
          </button>
          {q && (
            <Link href={filter === "active" ? "/clan/members" : `/clan/members?status=${filter}`} className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-sunken">
              {m.clear}
            </Link>
          )}
        </form>
        <div className="flex gap-1 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={href(f)}
              className={`rounded-md px-2.5 py-1.5 font-medium whitespace-nowrap ${filter === f ? "bg-brand text-white" : "text-ink-soft hover:bg-sunken"}`}
            >
              {m.filter[f]} <span className={`tabular ${filter === f ? "text-white/75" : "text-muted"}`}>{formatNumber(total[f])}</span>
            </Link>
          ))}
        </div>
      </div>

      {filter === "active" && !q && (
        <p className={`mt-4 rounded-lg px-4 py-3 text-sm ${treasurers.length ? "bg-brand-wash text-ink" : "bg-warn-wash text-warn"}`}>
          {treasurers.length ? fmt(t.treasurer.list, { names: treasurers.map((x) => x.full_name).join(", ") }) : t.treasurer.none}
        </p>
      )}

      <div className="mt-4">
        {people.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface px-5 py-10 text-center">
            <UsersIcon className="text-brand-bright" width={28} height={28} />
            <p className="mt-3 font-medium text-ink">{q || filter !== "active" ? m.noMatch : c.noMembers}</p>
            {!q && filter === "active" && <p className="mt-1 text-sm text-ink-soft">{c.noMembersBody}</p>}
          </div>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">{c.colName}</th>
                  <th className="px-4 py-3 font-medium">{c.colPhone}</th>
                  <th className="px-4 py-3 font-medium">{c.colFamily}</th>
                  <th className="px-4 py-3 font-medium">{c.colSince}</th>
                  <th className="px-4 py-3 font-medium">{c.colStatus}</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">{c.colActions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3.5">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        <Link href={`/clan/members/${p.id}`} className="text-brand hover:text-brand-bright">
                          {p.full_name}
                        </Link>
                        {p.is_treasurer && <Pill tone="info">{t.treasurer.badge}</Pill>}
                        {p.deceased_at && <Pill tone="mute">{m.deceased}</Pill>}
                      </p>
                      {p.village && <p className="text-xs text-muted">{p.village}</p>}
                    </td>
                    <td className="tabular px-4 py-3.5 text-ink-soft">{p.phone}</td>
                    <td className="px-4 py-3.5">
                      <FamilyCell people={familyOf.get(p.id) ?? []} rel={t.family.rel} countLabel={t.family.count} />
                    </td>
                    <td className="px-4 py-3.5 text-ink-soft">{formatDate(p.approved_at ?? p.created_at, locale)}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {p.status === "active" && (
                          <form action={setTreasurer}>
                            <input type="hidden" name="memberId" value={p.id} />
                            <input type="hidden" name="on" value={String(!p.is_treasurer)} />
                            <button type="submit" className="rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-brand hover:bg-brand-wash">
                              {p.is_treasurer ? t.treasurer.remove : t.treasurer.make}
                            </button>
                          </form>
                        )}
                        {p.status === "active" && <ResetPasswordButton userId={p.id} name={p.full_name} />}
                        {p.status === "active" && <DecisionButton memberId={p.id} decision="disable" label={c.disable} subtle />}
                        {p.status === "disabled" && <DecisionButton memberId={p.id} decision="enable" label={c.enable} subtle disabled={fullNote} />}
                        {p.status === "rejected" && <DecisionButton memberId={p.id} decision="approve" label={c.approve} subtle disabled={fullNote} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
