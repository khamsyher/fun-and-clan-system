import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill, StatusBadge } from "@/components/badge";
import { requireRole } from "@/lib/dal";
import { query, queryOne } from "@/lib/db";
import { STAFF_ROLES, type Role, type UserStatus } from "@/lib/definitions";
import { formatDate, formatKip, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { ClanTypeSelect, type ClanTypeOption } from "../../forms";
import { ClanActiveButton, Stat } from "../../stat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Clan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  fund_mode: "A" | "B";
  contribution_amount: string;
  is_active: boolean;
  created_at: Date;
  clan_type_id: string | null;
  type_name: string | null;
};

function getClan(id: string) {
  if (!UUID.test(id)) return Promise.resolve(null);
  return queryOne<Clan>(
    `SELECT c.id, c.code, c.name, c.description, c.fund_mode, c.contribution_amount, c.is_active, c.created_at,
            c.clan_type_id, ct.name AS type_name
       FROM clans c LEFT JOIN clan_types ct ON ct.id = c.clan_type_id
      WHERE c.id = $1`,
    [id],
  );
}

export async function generateMetadata({ params }: PageProps<"/admin/clans/[id]">): Promise<Metadata> {
  const [{ id }, t] = await Promise.all([params, getT()]);
  const clan = await getClan(id);
  return { title: clan ? `${clan.name} · ${t.clansAdmin.title}` : t.clansAdmin.title };
}

/** One clan as the platform sees it: who runs it, who is in it, and its fund in totals only. */
export default async function AdminClanPage({ params }: PageProps<"/admin/clans/[id]">) {
  await requireRole(...STAFF_ROLES);
  const [{ id }, t, locale] = await Promise.all([params, getT(), getLocale()]);
  const clan = await getClan(id);
  if (!clan) notFound();
  const a = t.admin;
  const c = t.clansAdmin;

  const [fund, people, types] = await Promise.all([
    // Statistics only, as everywhere on the platform side: totals, never the clan's ledger lines.
    queryOne<{ balance: string; collected: string; paid_out: string; fees: string; unpaid: string; events: string; open_events: string }>(
      `SELECT (SELECT COALESCE(SUM(amount), 0) FROM fund_ledger WHERE clan_id = $1) AS balance,
              (SELECT COALESCE(SUM(amount), 0) FROM fund_ledger WHERE clan_id = $1 AND amount > 0) AS collected,
              (SELECT COALESCE(-SUM(amount), 0) FROM fund_ledger WHERE clan_id = $1 AND entry_type = 'payout') AS paid_out,
              (SELECT COALESCE(SUM(fee_amount), 0) FROM platform_fees WHERE clan_id = $1) AS fees,
              (SELECT COALESCE(SUM(amount), 0) FROM event_bills WHERE clan_id = $1 AND status IN ('unpaid', 'carried')) AS unpaid,
              (SELECT COUNT(*) FROM death_events WHERE clan_id = $1 AND status <> 'cancelled') AS events,
              (SELECT COUNT(*) FROM death_events WHERE clan_id = $1 AND status = 'collecting') AS open_events`,
      [clan.id],
    ),
    query<{ id: string; full_name: string; phone: string; role: Role; status: UserStatus; is_treasurer: boolean; created_at: Date }>(
      `SELECT id, full_name, phone, role, status, is_treasurer, created_at FROM users
        WHERE clan_id = $1
        ORDER BY (role = 'clan_admin') DESC, (status = 'pending') DESC, lower(full_name)`,
      [clan.id],
    ),
    query<ClanTypeOption>(`SELECT id, name, is_active FROM clan_types ORDER BY lower(name)`),
  ]);
  const leaders = people.filter((p) => p.role === "clan_admin");
  const members = people.filter((p) => p.role === "member");

  return (
    <>
      <Link href="/admin/clans" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {c.backToList}
      </Link>
      <div className="mt-3">
        <PageHeading
          title={clan.name}
          lede={
            <>
              <span className="font-semibold tracking-[0.06em] text-brand">{clan.code}</span> ·{" "}
              {fmt(a.since, { date: formatDate(clan.created_at, locale) })}
              {clan.type_name && <> · {clan.type_name}</>}
            </>
          }
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusBadge status={clan.is_active ? "enabled" : "off"} />
            {types.length > 0 && <ClanTypeSelect clanId={clan.id} current={clan.clan_type_id} types={types} />}
            <ClanActiveButton clanId={clan.id} active={clan.is_active} labels={a} />
          </div>
        </PageHeading>
      </div>
      {clan.description && <p className="mt-3 max-w-[65ch] text-sm text-ink-soft">{clan.description}</p>}

      <Section title={c.fundTitle} aside={c.fundAside}>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          <Stat label={c.balance} value={formatKip(fund?.balance ?? 0)} highlight />
          <Stat label={c.collected} value={formatKip(fund?.collected ?? 0)} />
          <Stat label={c.paidOut} value={formatKip(fund?.paid_out ?? 0)} />
          <Stat label={c.unpaid} value={formatKip(fund?.unpaid ?? 0)} />
          <Stat label={a.statEvents} value={formatNumber(fund?.events ?? 0)} note={fmt(a.statEventsNote, { n: formatNumber(fund?.open_events ?? 0) })} />
          <Stat label={c.fees} value={formatKip(fund?.fees ?? 0)} />
          <Stat label={a.colRate} value={formatKip(clan.contribution_amount)} note={fmt(a.mode, { m: clan.fund_mode })} />
          <Stat label={a.colMembers} value={formatNumber(members.filter((m) => m.status === "active").length)} note={fmt(a.waiting, { n: members.filter((m) => m.status === "pending").length })} />
        </dl>
      </Section>

      <Section title={c.leaders}>
        {leaders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-warn/40 bg-warn-wash px-5 py-4 text-sm text-warn">{c.noLeaderBody}</p>
        ) : (
          <PeopleList people={leaders} t={t} locale={locale} />
        )}
      </Section>

      <Section title={c.members} aside={fmt(a.total, { n: members.length })}>
        {members.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{c.noMembers}</p>
        ) : (
          <PeopleList people={members} t={t} locale={locale} />
        )}
      </Section>
    </>
  );
}

function PeopleList({
  people,
  t,
  locale,
}: {
  people: { id: string; full_name: string; phone: string; status: UserStatus; is_treasurer: boolean; created_at: Date }[];
  t: Awaited<ReturnType<typeof getT>>;
  locale: Awaited<ReturnType<typeof getLocale>>;
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
      {people.map((p) => (
        <li key={p.id}>
          <Link href={`/admin/users/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-sunken/60">
            <span className="min-w-0">
              <span className="font-medium text-ink">{p.full_name}</span>
              <span className="block text-xs text-muted">
                {p.phone} · {formatDate(p.created_at, locale)}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {p.is_treasurer && <Pill tone="info">{t.treasurer.badge}</Pill>}
              <StatusBadge status={p.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
