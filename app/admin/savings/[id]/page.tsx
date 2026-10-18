import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES } from "@/lib/definitions";
import { formatDate, formatKip, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { getGroup, listMembers, listRounds } from "@/lib/savings";
import { potFor } from "@/lib/savings-rules";
import { Stat } from "../../stat";
import { GROUP_TONE, MEMBER_TONE, ROUND_TONE } from "../tones";

export async function generateMetadata({ params }: PageProps<"/admin/savings/[id]">): Promise<Metadata> {
  const [{ id }, t] = await Promise.all([params, getT()]);
  const group = await getGroup(id);
  return { title: group ? `${group.name} · ${t.savingsAdmin.title}` : t.savingsAdmin.title };
}

/**
 * One savings group as the platform sees it: its terms, everyone in it, and how far the rounds
 * have got. Members' bank details and QR codes stay between the members.
 */
export default async function AdminSavingsGroupPage({ params }: PageProps<"/admin/savings/[id]">) {
  await requireRole(...STAFF_ROLES);
  const [{ id }, t, locale] = await Promise.all([params, getT(), getLocale()]);
  const group = await getGroup(id);
  if (!group) notFound();
  const [members, rounds] = await Promise.all([listMembers(group.id), listRounds(group.id)]);
  const s = t.savingsAdmin;
  const approved = members.filter((m) => m.status === "approved");
  const pending = members.filter((m) => m.status === "pending");
  const done = rounds.filter((r) => r.status === "done").length;
  const pot = approved.length > 1 ? potFor(Number(group.amount), approved.length) : 0;

  return (
    <>
      <Link href="/admin/savings" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {s.backToList}
      </Link>
      <div className="mt-3">
        <PageHeading
          title={group.name}
          lede={
            <>
              <span className="font-semibold tracking-[0.06em] text-brand">{group.invite_code}</span> ·{" "}
              {fmt(t.savings.organizedBy, { name: group.organizer_name })} · {formatDate(group.created_at, locale)}
            </>
          }
        >
          <Pill tone={GROUP_TONE[group.status]}>{t.savings.groupStatus[group.status]}</Pill>
        </PageHeading>
      </div>
      {group.description && <p className="mt-3 max-w-[65ch] text-sm text-ink-soft">{group.description}</p>}

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        <Stat label={s.colAmount} value={formatKip(group.amount)} note={t.savings.periodLabel[group.period]} highlight />
        <Stat
          label={s.colMembers}
          value={formatNumber(approved.length)}
          note={pending.length ? fmt(t.admin.waiting, { n: pending.length }) : undefined}
        />
        <Stat label={s.pot} value={formatKip(pot)} note={s.potNote} />
        <Stat
          label={s.rounds}
          value={rounds.length ? `${done} / ${rounds.length}` : "—"}
          note={group.fee_percent ? fmt(s.feeNote, { fee: Number(group.fee_percent) }) : fmt(s.startsOn, { date: group.start_date })}
        />
      </dl>

      <Section title={s.membersTitle} aside={fmt(t.admin.total, { n: members.length })}>
        {members.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{s.noMembers}</p>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">{s.colTurn}</th>
                  <th className="px-4 py-3 font-medium">{s.colPerson}</th>
                  <th className="px-4 py-3 font-medium">{t.member.clan}</th>
                  <th className="px-4 py-3 font-medium">{s.colJoined}</th>
                  <th className="px-4 py-3 font-medium">{t.admin.colStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="tabular px-4 py-3 text-right text-ink-soft">{m.turn_no ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${m.user_id}`} className="font-medium text-ink hover:text-brand">
                        {m.full_name}
                      </Link>
                      {m.user_id === group.organizer_id && <span className="ml-2 text-xs font-medium text-gold-deep">{s.organizer}</span>}
                      <span className="block text-xs text-muted">{m.phone}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{m.clan_name ?? <span className="text-muted">{t.savings.noClan}</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-soft">{formatDate(m.joined_at, locale)}</td>
                    <td className="px-4 py-3">
                      <Pill tone={MEMBER_TONE[m.status]}>{s.memberStatus[m.status]}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={t.savings.scheduleTitle}>
        {rounds.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{s.noRounds}</p>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">{s.rounds}</th>
                  <th className="px-4 py-3 font-medium">{s.colReceiver}</th>
                  <th className="px-4 py-3 text-right font-medium">{s.colPaid}</th>
                  <th className="px-4 py-3 text-right font-medium">{s.pot}</th>
                  <th className="px-4 py-3 font-medium">{t.admin.colStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rounds.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink">{fmt(t.savings.roundNo, { n: r.round_no })}</span>
                      <span className="block text-xs text-muted">{fmt(t.savings.due, { date: r.due_date })}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${r.receiver_user_id}`} className="text-ink-soft hover:text-brand">
                        {r.receiver_name}
                      </Link>
                    </td>
                    <td className={`tabular px-4 py-3 text-right ${r.status === "collecting" && r.paid !== r.total ? "text-warn" : "text-ink-soft"}`}>
                      {r.paid} / {r.total}
                    </td>
                    <td className="tabular px-4 py-3 text-right text-ink-soft">{formatKip(r.pot)}</td>
                    <td className="px-4 py-3">
                      <Pill tone={ROUND_TONE[r.status]}>{t.savings.roundStatus[r.status]}</Pill>
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
