import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill, StatusBadge } from "@/components/badge";
import { ResetPasswordButton } from "@/components/reset-password";
import { requireRole } from "@/lib/dal";
import { formatDate, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { getUser, userHistory } from "@/lib/users";
import { BlockButton, DeleteButton } from "../user-actions";

export async function generateMetadata({ params }: PageProps<"/admin/users/[id]">): Promise<Metadata> {
  const [{ id }, t] = await Promise.all([params, getT()]);
  const person = await getUser(id);
  return { title: person ? `${person.full_name} · ${t.users.metaTitle}` : t.users.metaTitle };
}

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  await requireRole("super_admin");
  const [{ id }, t, locale] = await Promise.all([params, getT(), getLocale()]);
  const u = t.users;
  const person = await getUser(id);
  if (!person) notFound();
  const history = await userHistory(person.id);
  const protectedAccount = person.role === "super_admin";

  return (
    <>
      <Link href="/admin/users" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {u.backToList}
      </Link>

      <div className="mt-3">
        <PageHeading title={person.full_name} lede={fmt(u.profileLede, { role: t.roles[person.role] })}>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusBadge status={person.status} />
            {person.is_treasurer && <Pill tone="info">{t.treasurer.badge}</Pill>}
          </div>
        </PageHeading>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-6">
          <dl className="grid gap-x-8 gap-y-4 rounded-xl border border-line bg-surface p-5 text-sm sm:grid-cols-2 sm:p-6">
            <Fact label={t.clan.colPhone} value={person.phone} tabular />
            <Fact label={t.register.email} value={person.email} />
            <Fact label={t.register.village} value={person.village} />
            <Fact label={t.admin.colRole} value={t.roles[person.role]} />
            <Fact
              label={t.member.clan}
              value={person.clan_name ? `${person.clan_name} (${person.clan_code})` : t.donations.noClan}
            />
            <Fact label={t.admin.colJoined} value={formatDate(person.created_at, locale)} />
            <Fact
              label={u.approved}
              value={
                person.approved_at
                  ? `${formatDate(person.approved_at, locale)}${person.approved_by_name ? ` · ${person.approved_by_name}` : ""}`
                  : null
              }
            />
            <Fact label={u.lastSignIn} value={person.last_login_at ? formatDate(person.last_login_at, locale) : u.never} />
            <Fact
              label={u.passwordChanged}
              value={person.password_changed_at ? formatDate(person.password_changed_at, locale) : u.never}
            />
            {person.deceased_at && <Fact label={u.deceased} value={formatDate(person.deceased_at, locale)} />}
          </dl>

          <Section title={u.activity}>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-5">
              <Count label={t.nav.family} value={person.family} />
              <Count label={u.countRequests} value={person.requests} />
              <Count label={u.countDonations} value={person.donations} />
              <Count label={u.countOpenBills} value={person.open_bills} tone={Number(person.open_bills) > 0 ? "warn" : undefined} />
              <Count label={t.nav.slips} value={person.slips} />
            </dl>
          </Section>

          <Section title={u.history}>
            {history.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center text-sm text-ink-soft">
                {u.noHistory}
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="font-mono text-xs text-ink">{h.action}</span>
                    <span className="text-xs text-muted">
                      {h.actor_name ? `${h.actor_name} · ` : ""}
                      {formatDate(h.created_at, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="h-fit rounded-xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-xl text-brand-deep">{u.manage}</h2>
          {protectedAccount ? (
            <p className="mt-2 text-sm text-ink-soft">{u.protectedBody}</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-soft">{u.manageBody}</p>
              <div className="mt-4 flex flex-col items-start gap-3">
                {(person.status === "active" || person.status === "disabled") && (
                  <BlockButton userId={person.id} name={person.full_name} blocked={person.status === "disabled"} />
                )}
                <ResetPasswordButton userId={person.id} name={person.full_name} />
                <DeleteButton userId={person.id} name={person.full_name} />
              </div>
              <p className="mt-4 border-t border-line pt-4 text-xs text-muted">{u.deleteNote}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Fact({ label, value, tabular }: { label: string; value: string | null; tabular?: boolean }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={`mt-0.5 font-medium text-ink ${tabular ? "tabular" : ""}`}>{value ?? <span className="text-muted">—</span>}</dd>
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="bg-surface p-4">
      <dd className={`tabular font-display text-2xl ${tone === "warn" ? "text-warn" : "text-brand-deep"}`}>{formatNumber(value)}</dd>
      <dt className="mt-0.5 text-xs text-ink-soft">{label}</dt>
    </div>
  );
}
