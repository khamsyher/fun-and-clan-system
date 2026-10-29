import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { ArrowRightIcon, UsersIcon } from "@/components/icons";
import { requireRole } from "@/lib/dal";
import { query, queryOne } from "@/lib/db";
import { formatDate, formatKip, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { pendingJoinRequests } from "@/lib/membership";
import type { UserStatus } from "@/lib/definitions";
import { clanRoom } from "@/lib/member-limit";
import { DecisionButton, JoinButton } from "./member-controls";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).clan.metaTitle };
}

type MemberRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  village: string | null;
  status: UserStatus;
  created_at: Date;
  approved_at: Date | null;
  is_treasurer: boolean;
};

export default async function ClanPage() {
  const leader = await requireRole("clan_admin");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const c = t.clan;

  // Every query here is scoped to the leader's own clan_id.
  const [clan, people, joining, room] = await Promise.all([
    queryOne<{ code: string; name: string; fund_mode: "A" | "B"; contribution_amount: string; contribution_period: "monthly" | "yearly" | null }>(
      `SELECT code, name, fund_mode, contribution_amount, contribution_period FROM clans WHERE id = $1`,
      [leader.clanId],
    ),
    query<MemberRow>(
      `SELECT id, full_name, phone, email, village, status, created_at, approved_at, is_treasurer
         FROM users
        WHERE clan_id = $1 AND role = 'member'
        ORDER BY created_at DESC`,
      [leader.clanId],
    ),
    pendingJoinRequests(leader.clanId!),
    clanRoom(leader.clanId!),
  ]);
  const fullNote = room.full ? fmt(t.clanMembers.limitFullShort, { limit: room.limit ?? 0 }) : undefined;

  const pending = people.filter((p) => p.status === "pending");
  const members = people.filter((p) => p.status !== "pending");
  const activeCount = members.filter((m) => m.status === "active").length;
  const treasurers = members.filter((m) => m.is_treasurer && m.status === "active");
  const fundMode = clan?.fund_mode ?? "B";
  const mode = fundMode === "A" ? { name: c.modeAName, body: c.modeABody } : { name: c.modeBName, body: c.modeBBody };

  return (
    <>
      <PageHeading title={clan?.name ?? c.fallbackTitle} lede={c.lede} />

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="panel-brand relative overflow-hidden rounded-xl p-5 text-white shadow-soft">
          <p className="text-sm text-white/75">{c.clanCode}</p>
          <p className="mt-1 font-display text-3xl tracking-[0.08em]">{clan?.code}</p>
          <p className="mt-2 text-sm text-white/75">{c.clanCodeNote}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-soft">{fundMode === "A" ? c.contributionA : c.contribution}</p>
          <p className="tabular mt-1 font-display text-3xl text-brand-deep">
            {formatKip(clan?.contribution_amount ?? 0)}
            {fundMode === "A" && (
              <span className="ml-1.5 font-sans text-sm text-ink-soft">{clan?.contribution_period === "monthly" ? c.perMonth : c.perYear}</span>
            )}
          </p>
          <p className="mt-2 text-sm text-muted">{c.contributionNote}</p>
          <Link href="/clan/settings" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-bright">
            {c.changeSettings}
            <ArrowRightIcon width={16} height={16} />
          </Link>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-soft">{c.fundMode}</p>
          <p className="mt-1 font-display text-2xl text-brand-deep">
            {fmt(c.mode, { m: fundMode })} · {mode.name}
          </p>
          <p className="mt-2 text-sm text-muted">{mode.body}</p>
        </div>
      </div>

      {/* Full: approvals are paused until the limit goes up or someone leaves. */}
      {room.full && (pending.length > 0 || joining.length > 0) && (
        <Link
          href="/clan/members"
          className="mt-8 flex items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-wash px-5 py-3 text-sm font-medium text-warn hover:border-warn/60"
        >
          {fmt(t.clanMembers.limitFullBanner, { n: room.active, limit: room.limit ?? 0 })}
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <Section
        title={c.waitingTitle}
        aside={pending.length ? (pending.length === 1 ? c.onePerson : fmt(c.people, { n: pending.length })) : undefined}
      >
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center text-sm text-ink-soft">
            {fmt(c.noneWaiting, { code: clan?.code ?? "" })}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{p.full_name}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    <span className="tabular">{p.phone}</span>
                    {p.village && <> · {p.village}</>}
                    {p.email && <> · {p.email}</>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{fmt(c.registeredOn, { date: formatDate(p.created_at, locale) })}</p>
                </div>
                <div className="flex gap-2">
                  <DecisionButton memberId={p.id} decision="reject" label={c.decline} />
                  <DecisionButton memberId={p.id} decision="approve" label={c.approve} primary disabled={fullNote} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={c.joinTitle} aside={joining.length ? fmt(c.people, { n: joining.length }) : undefined}>
        {joining.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center text-sm text-ink-soft">
            {fmt(c.noneJoining, { code: clan?.code ?? "" })}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {joining.map((j) => (
              <li key={j.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{j.full_name}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    <span className="tabular">{j.phone}</span>
                    {j.village && <> · {j.village}</>}
                    {j.email && <> · {j.email}</>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{fmt(c.askedOn, { date: formatDate(j.created_at, locale) })}</p>
                </div>
                <div className="flex gap-2">
                  <JoinButton requestId={j.id} decision="reject" label={c.decline} />
                  <JoinButton requestId={j.id} decision="approve" label={c.approve} primary disabled={fullNote} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={c.members} aside={fmt(c.activeCount, { n: formatNumber(activeCount) })}>
        <Link
          href="/clan/members"
          className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-brand-bright sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-center gap-3">
            <UsersIcon className="shrink-0 text-brand-bright" width={24} height={24} />
            <span>
              <span className="block font-medium text-ink">{fmt(t.clanMembers.summary, { n: formatNumber(activeCount) })}</span>
              <span className={`block text-sm ${treasurers.length ? "text-ink-soft" : "text-warn"}`}>
                {treasurers.length ? fmt(t.treasurer.list, { names: treasurers.map((x) => x.full_name).join(", ") }) : t.treasurer.none}
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand group-hover:text-brand-bright">
            {t.clanMembers.manage}
            <ArrowRightIcon width={16} height={16} />
          </span>
        </Link>
      </Section>
    </>
  );
}
