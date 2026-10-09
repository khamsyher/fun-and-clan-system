import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { StatusBadge } from "@/components/badge";
import { ArrowRightIcon, CheckIcon, UsersIcon, XIcon } from "@/components/icons";
import { ResetPasswordButton } from "@/components/reset-password";
import { requireRole } from "@/lib/dal";
import { query, queryOne } from "@/lib/db";
import { formatDate, formatKip, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { decideMember } from "@/app/actions/clan";
import { decideJoinRequest } from "@/app/actions/membership";
import { pendingJoinRequests } from "@/lib/membership";
import { setTreasurer } from "@/app/actions/fund";
import { Pill } from "@/components/badge";
import type { Relationship, UserStatus } from "@/lib/definitions";

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
  const [clan, people, family, joining] = await Promise.all([
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
    query<{ member_id: string; full_name: string; relationship: Relationship }>(
      `SELECT member_id, full_name, relationship FROM dependents WHERE clan_id = $1 AND is_active ORDER BY created_at`,
      [leader.clanId],
    ),
    pendingJoinRequests(leader.clanId!),
  ]);

  const familyOf = new Map<string, { full_name: string; relationship: Relationship }[]>();
  for (const d of family) familyOf.set(d.member_id, [...(familyOf.get(d.member_id) ?? []), d]);

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
                  <DecisionButton memberId={p.id} decision="approve" label={c.approve} primary />
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
                  <JoinButton requestId={j.id} decision="approve" label={c.approve} primary />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={c.members} aside={fmt(c.activeCount, { n: formatNumber(activeCount) })}>
        <p className={`mb-4 rounded-lg px-4 py-3 text-sm ${treasurers.length ? "bg-brand-wash text-ink" : "bg-warn-wash text-warn"}`}>
          {treasurers.length ? fmt(t.treasurer.list, { names: treasurers.map((x) => x.full_name).join(", ") }) : t.treasurer.none}
        </p>
        {members.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface px-5 py-10 text-center">
            <UsersIcon className="text-brand-bright" width={28} height={28} />
            <p className="mt-3 font-medium text-ink">{c.noMembers}</p>
            <p className="mt-1 text-sm text-ink-soft">{c.noMembersBody}</p>
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
                  <th className="px-4 py-3"><span className="sr-only">{c.colActions}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3.5">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        <Link href={`/clan/members/${m.id}`} className="text-brand hover:text-brand-bright">
                          {m.full_name}
                        </Link>
                        {m.is_treasurer && <Pill tone="info">{t.treasurer.badge}</Pill>}
                      </p>
                      {m.village && <p className="text-xs text-muted">{m.village}</p>}
                    </td>
                    <td className="tabular px-4 py-3.5 text-ink-soft">{m.phone}</td>
                    <td className="px-4 py-3.5">
                      <FamilyCell people={familyOf.get(m.id) ?? []} rel={t.family.rel} countLabel={t.family.count} />
                    </td>
                    <td className="px-4 py-3.5 text-ink-soft">{formatDate(m.approved_at ?? m.created_at, locale)}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={m.status} /></td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                      {m.status === "active" && (
                        <form action={setTreasurer}>
                          <input type="hidden" name="memberId" value={m.id} />
                          <input type="hidden" name="on" value={String(!m.is_treasurer)} />
                          <button type="submit" className="rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-brand hover:bg-brand-wash">
                            {m.is_treasurer ? t.treasurer.remove : t.treasurer.make}
                          </button>
                        </form>
                      )}
                      {m.status === "active" && <ResetPasswordButton userId={m.id} name={m.full_name} />}
                      {m.status === "active" && <DecisionButton memberId={m.id} decision="disable" label={c.disable} subtle />}
                      {m.status === "disabled" && <DecisionButton memberId={m.id} decision="enable" label={c.enable} subtle />}
                      {m.status === "rejected" && <DecisionButton memberId={m.id} decision="approve" label={c.approve} subtle />}
                      </div>
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

function DecisionButton({
  memberId,
  decision,
  label,
  primary,
  subtle,
}: {
  memberId: string;
  decision: "approve" | "reject" | "disable" | "enable";
  label: string;
  primary?: boolean;
  subtle?: boolean;
}) {
  const cls = subtle
    ? "rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-soft hover:bg-sunken hover:text-ink"
    : primary
      ? "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-soft hover:bg-brand-2 sm:flex-none"
      : "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-bad-wash hover:text-bad sm:flex-none";
  return (
    <form action={decideMember} className={subtle ? "inline" : "flex flex-1 sm:flex-none"}>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="decision" value={decision} />
      <button type="submit" className={cls}>
        {!subtle && (decision === "approve" ? <CheckIcon width={16} height={16} /> : <XIcon width={16} height={16} />)}
        {label}
      </button>
    </form>
  );
}

/** Approve or decline a general user who sent this clan's code. */
function JoinButton({
  requestId,
  decision,
  label,
  primary,
}: {
  requestId: string;
  decision: "approve" | "reject";
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={decideJoinRequest} className="flex flex-1 sm:flex-none">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="decision" value={decision} />
      <button
        type="submit"
        className={
          primary
            ? "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-soft hover:bg-brand-2 sm:flex-none"
            : "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-bad-wash hover:text-bad sm:flex-none"
        }
      >
        {decision === "approve" ? <CheckIcon width={16} height={16} /> : <XIcon width={16} height={16} />}
        {label}
      </button>
    </form>
  );
}

function FamilyCell({
  people,
  rel,
  countLabel,
}: {
  people: { full_name: string; relationship: Relationship }[];
  rel: Record<Relationship, string>;
  countLabel: string;
}) {
  if (people.length === 0) return <span className="text-muted">—</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm font-medium text-brand hover:text-brand-bright [&::-webkit-details-marker]:hidden">
        {fmt(countLabel, { n: people.length })}
        <span className="ml-1 inline-block transition-transform group-open:rotate-90" aria-hidden="true">›</span>
      </summary>
      <ul className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
        {people.map((p, i) => (
          <li key={i}>
            {p.full_name} <span className="text-muted">· {rel[p.relationship]}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
