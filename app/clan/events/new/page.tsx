import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { query, queryOne } from "@/lib/db";
import { formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { Relationship } from "@/lib/definitions";
import { ReportDeathForm, type PersonOption } from "./report-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).events.newMetaTitle };
}

export default async function NewEventPage() {
  const leader = await requireRole("clan_admin");
  const t = await getT();

  // Only living, active people in this clan who haven't been reported already.
  const [clan, members, dependents] = await Promise.all([
    queryOne<{ fund_mode: "A" | "B"; contribution_amount: string }>(
      `SELECT fund_mode, contribution_amount FROM clans WHERE id = $1`,
      [leader.clanId],
    ),
    query<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM users
        WHERE clan_id = $1 AND role = 'member' AND status = 'active' AND deceased_at IS NULL
        ORDER BY full_name`,
      [leader.clanId],
    ),
    query<{ id: string; full_name: string; relationship: Relationship; member_name: string }>(
      `SELECT d.id, d.full_name, d.relationship, u.full_name AS member_name
         FROM dependents d JOIN users u ON u.id = d.member_id
        WHERE d.clan_id = $1 AND d.is_active AND d.deceased_at IS NULL AND u.status = 'active'
        ORDER BY u.full_name, d.full_name`,
      [leader.clanId],
    ),
  ]);

  const people: { members: PersonOption[]; family: PersonOption[] } = {
    members: members.map((m) => ({ value: `m:${m.id}`, label: m.full_name })),
    family: dependents.map((d) => ({
      value: `d:${d.id}`,
      label: `${d.full_name} — ${fmt(t.events.relOf, { rel: t.family.rel[d.relationship], member: d.member_name })}`,
    })),
  };

  return (
    <>
      <Link href="/clan/events" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {t.events.back}
      </Link>
      <div className="mt-3">
        <PageHeading
          title={t.events.newTitle}
          lede={
            clan?.fund_mode === "A"
              ? t.events.newLedeA
              : fmt(t.events.newLedeB, { amount: formatKip(clan?.contribution_amount ?? 0) })
          }
        />
      </div>
      <div className="mt-8 max-w-xl rounded-xl border border-line bg-surface p-5 sm:p-6">
        <ReportDeathForm people={people} mode={clan?.fund_mode ?? "B"} />
      </div>
    </>
  );
}
