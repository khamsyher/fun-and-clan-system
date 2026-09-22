import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { StatusBadge } from "@/components/badge";
import { ArrowRightIcon, UsersIcon } from "@/components/icons";
import { requireRole } from "@/lib/dal";
import { query, queryOne } from "@/lib/db";
import type { Relationship } from "@/lib/definitions";
import { formatDate, formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { listEvents, memberDebt } from "@/lib/events";
import { EventList } from "@/components/event-list";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).member.metaTitle };
}

export default async function MemberPage() {
  const me = await requireRole("member");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const m = t.member;

  const [detail, family, debt, events] = await Promise.all([
    queryOne<{
      village: string | null;
      approved_at: Date | null;
      contribution_amount: string;
      contribution_period: "monthly" | "yearly" | null;
      fund_mode: "A" | "B";
    }>(
      `SELECT u.village, u.approved_at, c.contribution_amount, c.contribution_period, c.fund_mode
         FROM users u JOIN clans c ON c.id = u.clan_id
        WHERE u.id = $1 AND u.clan_id = $2`,
      [me.id, me.clanId],
    ),
    query<{ full_name: string; relationship: Relationship }>(
      `SELECT full_name, relationship FROM dependents
        WHERE member_id = $1 AND clan_id = $2 AND is_active
        ORDER BY created_at`,
      [me.id, me.clanId],
    ),
    memberDebt(me.clanId!, me.id),
    listEvents(me.clanId!),
  ]);
  const owed = debt.open + debt.carried;
  const open = events.filter((e) => e.status === "collecting");

  const firstName = me.fullName.split(/\s+/)[0];
  const isA = detail?.fund_mode === "A";
  const [before, after] = (isA ? m.upToDateA : m.upToDate).split("{amount}");
  const periodLabel = detail?.contribution_period === "monthly" ? t.clan.perMonth : t.clan.perYear;

  return (
    <>
      <PageHeading title={fmt(m.greeting, { name: firstName })} lede={fmt(m.lede, { clan: me.clanName ?? "" })} />

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-ink">{m.membership}</h2>
            <StatusBadge status="active" />
          </div>
          <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <Row label={m.name} value={me.fullName} />
            <Row label={m.phone} value={me.phone} />
            <Row label={m.clan} value={`${me.clanName} (${me.clanCode})`} />
            <Row label={m.village} value={detail?.village ?? "—"} />
            <Row label={m.since} value={formatDate(detail?.approved_at ?? null, locale)} />
            <Row label={m.email} value={me.email ?? "—"} />
          </dl>
        </div>

        <div className="panel-brand relative overflow-hidden rounded-xl p-5 text-white shadow-soft sm:p-6">
          <h2 className="text-sm text-white/75">{m.debt}</h2>
          <p className="tabular mt-1 font-display text-4xl">{formatKip(owed)}</p>
          {owed > 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-white/80">
              {fmt(m.owesBody, { open: formatKip(debt.open), debt: formatKip(debt.carried) })}
            </p>
          ) : (
          <p className="mt-3 text-sm leading-relaxed text-white/75">
            {before}
            <strong className="font-semibold text-gold-wash">
              {formatKip(detail?.contribution_amount ?? 0)}
              {isA && ` ${periodLabel}`}
            </strong>
            {after}
            {!isA && m.modeBSuffix}
          </p>
          )}
          {owed > 0 && (
            <Link
              href="/member/payments"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-brand hover:bg-brand-wash"
            >
              {m.payWithSlip}
              <ArrowRightIcon width={16} height={16} />
            </Link>
          )}
        </div>
      </div>

      <Section title={m.openCollections}>
        {open.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{m.noOpen}</p>
        ) : (
          <EventList events={open} hrefBase="/member/events" t={t} locale={locale} />
        )}
      </Section>

      <Section title={m.familyCardTitle} aside={family.length ? fmt(m.familyCount, { n: family.length }) : undefined}>
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          {family.length === 0 ? (
            <p className="flex items-center gap-3 text-sm text-ink-soft">
              <UsersIcon className="shrink-0 text-brand-bright" />
              {m.familyNone}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {family.map((f, i) => (
                <li key={i} className="rounded-full bg-brand-wash px-3 py-1 text-sm text-ink">
                  {f.full_name} <span className="text-ink-soft">· {t.family.rel[f.relationship]}</span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/member/family"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-bright"
          >
            {m.familyManage}
            <ArrowRightIcon width={16} height={16} />
          </Link>
        </div>
      </Section>

    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium break-words text-ink">{value}</dd>
    </div>
  );
}
