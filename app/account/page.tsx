import type { Metadata } from "next";
import { PageHeading } from "@/components/app-shell";
import { StatusBadge } from "@/components/badge";
import { DocumentList } from "@/components/document-list";
import { KycBadge, KycWarning, kycLine, overallKyc } from "@/components/kyc-status";
import { ProfileFacts } from "@/components/profile-facts";
import { ProfileEditor } from "./profile-editor";
import { Avatar } from "@/components/profile-facts";
import { withdrawJoinRequest } from "@/app/actions/membership";
import { requireRole } from "@/lib/dal";
import { canJoinClan } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { latestJoinRequest } from "@/lib/membership";
import { getProfile, listDocuments, toDateInput } from "@/lib/profile";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { DocumentForm } from "./document-form";
import { JoinClanForm } from "./join-clan-form";
import { ChangePasswordForm } from "./password-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).account.metaTitle };
}

export default async function AccountPage() {
  const user = await requireRole();
  // Only a general user can be waiting to join a clan.
  const [t, locale, profile, documents, join] = await Promise.all([
    getT(),
    getLocale(),
    getProfile(user.id),
    listDocuments(user.id),
    user.role === "user" ? latestJoinRequest(user.id) : null,
  ]);
  const a = t.account;
  const p = t.profile;
  const kyc = overallKyc(documents);

  return (
    <>
      <PageHeading title={a.title} lede={p.lede} />

      {/* Until an identity is confirmed, say so before anything else: it is what holds them up. */}
      {kyc !== "approved" && <KycWarning state={kyc} t={t} />}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-6">
          <ProfileEditor
            view={profile && <ProfileFacts p={profile} t={t} locale={locale} />}
            current={{
                first_name: profile?.first_name ?? null,
                last_name: profile?.last_name ?? null,
                date_of_birth: toDateInput(profile?.date_of_birth ?? null),
                gender: profile?.gender ?? null,
                email: profile?.email ?? null,
                whatsapp: profile?.whatsapp ?? null,
                facebook: profile?.facebook ?? null,
                tiktok: profile?.tiktok ?? null,
                village: profile?.village ?? null,
                district: profile?.district ?? null,
                province: profile?.province ?? null,
                phone: user.phone,
              has_photo: Boolean(profile?.photo_file_id),
            }}
          />

          <section id="identity" className="mt-12 min-w-0 scroll-mt-28">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">{p.documents}</h2>
              <KycBadge state={kyc} t={t} />
            </div>
            {/* The line under the heading says what this state means for them, not what KYC is. */}
            <p className="mb-4 max-w-[65ch] text-sm text-ink-soft">{kycLine(t, kyc)}</p>
            {documents.length > 0 && <DocumentList docs={documents} t={t} locale={locale} canOpenFile emptyText={p.noDocuments} />}
            <DocumentForm hasDocuments={documents.length > 0} />
          </section>
        </div>

        <div className="space-y-6">
          <dl className="h-fit rounded-xl border border-line bg-surface p-5 text-sm sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <Avatar fileId={profile?.photo_file_id ?? null} name={user.fullName} size={48} />
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{user.fullName}</p>
                <p className="text-xs text-muted">{t.roles[user.role]}</p>
              </div>
            </div>
            <div>
              <dt className="text-muted">{t.member.phone}</dt>
              <dd className="tabular mt-0.5 font-medium text-ink">{user.phone}</dd>
            </div>
            <div className="mt-4">
              <dt className="text-muted">{a.status}</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={user.status} />
                {user.isTreasurer && <span className="text-xs font-medium text-brand">{t.treasurer.badge}</span>}
              </dd>
            </div>
            <div className="mt-4">
              <dt className="text-muted">{t.kyc.mineLabel}</dt>
              <dd className="mt-1">
                <KycBadge state={kyc} t={t} />
              </dd>
            </div>
            <div className="mt-4">
              <dt className="text-muted">{t.member.clan}</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {user.clanName ? `${user.clanName} (${user.clanCode})` : <span className="text-ink-soft">{a.noClan}</span>}
              </dd>
            </div>
          </dl>

          {user.role === "user" && (
            <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
              <h2 className="font-display text-xl text-brand-deep">{a.joinTitle}</h2>
              <p className="mt-1 text-sm text-ink-soft">{a.joinBody}</p>

              {!canJoinClan(user) && join?.status !== "pending" ? (
                <div className="mt-4 rounded-lg bg-warn-wash px-4 py-3 text-sm text-warn">
                  <p className="font-medium">{t.kyc.needForClan}</p>
                  <p className="mt-0.5 text-xs">{t.kyc.needHint}</p>
                </div>
              ) : join?.status === "pending" ? (
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

          <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-display text-xl text-brand-deep">{a.passwordTitle}</h2>
            <p className="mt-1 mb-4 text-sm text-ink-soft">{a.lede}</p>
            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </>
  );
}
