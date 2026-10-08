import type { Metadata } from "next";
import { PageHeading } from "@/components/app-shell";
import { StatusBadge } from "@/components/badge";
import { withdrawJoinRequest } from "@/app/actions/membership";
import { requireRole } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import { latestJoinRequest } from "@/lib/membership";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { JoinClanForm } from "./join-clan-form";
import { ChangePasswordForm } from "./password-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).account.metaTitle };
}

export default async function AccountPage() {
  const user = await requireRole();
  // Only a general user can be waiting to join a clan.
  const [t, locale, join] = await Promise.all([
    getT(),
    getLocale(),
    user.role === "user" ? latestJoinRequest(user.id) : null,
  ]);
  const a = t.account;

  return (
    <>
      <PageHeading title={a.title} lede={a.lede} />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <ChangePasswordForm />
          </div>

          {user.role === "user" && (
            <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
              <h2 className="font-display text-xl text-brand-deep">{a.joinTitle}</h2>
              <p className="mt-1 text-sm text-ink-soft">{a.joinBody}</p>

              {join?.status === "pending" ? (
                <div className="mt-4 rounded-lg bg-warn-wash px-4 py-3 text-sm text-warn">
                  <p className="font-medium">{fmt(a.joinWaiting, { clan: join.clan_name, code: join.clan_code })}</p>
                  <p className="mt-0.5 text-xs">{fmt(a.joinAskedOn, { date: formatDate(join.created_at, locale) })}</p>
                  <form action={withdrawJoinRequest}>
                    <button type="submit" className="mt-2 text-sm font-semibold text-brand underline-offset-2 hover:underline">
                      {a.joinWithdraw}
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  {join?.status === "rejected" && (
                    <div className="mt-4 rounded-lg bg-bad-wash px-4 py-3 text-sm text-bad">
                      <p className="font-medium">{fmt(a.joinDeclined, { clan: join.clan_name })}</p>
                      {join.note && <p className="mt-0.5">{join.note}</p>}
                    </div>
                  )}
                  <JoinClanForm />
                </>
              )}
            </div>
          )}
        </div>

        <dl className="h-fit rounded-xl border border-line bg-surface p-5 text-sm sm:p-6">
          <div>
            <dt className="text-muted">{t.member.name}</dt>
            <dd className="mt-0.5 font-medium text-ink">{user.fullName}</dd>
          </div>
          <div className="mt-4">
            <dt className="text-muted">{t.member.phone}</dt>
            <dd className="tabular mt-0.5 font-medium text-ink">{user.phone}</dd>
          </div>
          {user.email && (
            <div className="mt-4">
              <dt className="text-muted">{t.register.email}</dt>
              <dd className="mt-0.5 font-medium text-ink">{user.email}</dd>
            </div>
          )}
          <div className="mt-4">
            <dt className="text-muted">{a.role}</dt>
            <dd className="mt-0.5 font-medium text-ink">{t.roles[user.role]}</dd>
          </div>
          <div className="mt-4">
            <dt className="text-muted">{a.status}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={user.status} />
              {user.isTreasurer && <span className="text-xs font-medium text-brand">{t.treasurer.badge}</span>}
            </dd>
          </div>
          <div className="mt-4">
            <dt className="text-muted">{t.member.clan}</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {user.clanName ? `${user.clanName} (${user.clanCode})` : <span className="text-ink-soft">{a.noClan}</span>}
            </dd>
          </div>
        </dl>
      </div>
    </>
  );
}
