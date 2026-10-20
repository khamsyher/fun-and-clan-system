import type { Metadata } from "next";
import { PageHeading } from "@/components/app-shell";
import { StatusBadge } from "@/components/badge";
import { DocumentList } from "@/components/document-list";
import { KycBadge, KycWarning, kycLine, overallKyc } from "@/components/kyc-status";
import { ProfileFacts } from "@/components/profile-facts";
import { ProfileEditor } from "./profile-editor";
import { Avatar } from "@/components/profile-facts";
import { withdrawJoinRequest } from "@/app/actions/membership";
import { withdrawLeaderRequest } from "@/app/actions/leader-requests";
import { latestLeaderRequest } from "@/lib/leader-requests";
import { LeadClanForm } from "./lead-clan-form";
import { requireRole } from "@/lib/dal";
import { canJoinClan, canManageFamily } from "@/lib/access";
import { listDependents } from "@/lib/family";
import { formatDate } from "@/lib/format";
import { latestJoinRequest } from "@/lib/membership";
import { getProfile, listDocuments, toDateInput } from "@/lib/profile";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { DocumentForm } from "./document-form";
import { FamilyManager } from "./family-manager";
import { JoinClanForm } from "./join-clan-form";
import { ChangePasswordForm } from "./password-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).account.metaTitle };
}

export default async function AccountPage() {
  const user = await requireRole();
  // The locale comes first: the family list formats its dates with it.
  const locale = await getLocale();
  const [t, profile, documents, join, family, lead] = await Promise.all([
    getT(),
    getProfile(user.id),
    listDocuments(user.id),
    // Only a general user can be waiting to join a clan; only a member has a household here.
    user.role === "user" ? latestJoinRequest(user.id) : null,
    canManageFamily(user) ? listDependents(user.id, locale) : [],
    user.role === "user" ? latestLeaderRequest(user.id) : null,
  ]);
  const a = t.account;
  const l = t.leaderRequests;
  const p = t.profile;
  const kyc = overallKyc(documents);

  return (
    <>
      <PageHeading title={a.title} lede={p.lede} />

      {/* Until an identity is confirmed, say so before anything else: it is what holds them up. */}
      {kyc !== "approved" && <KycWarning state={kyc} t={t} />}

      {/* Their clan is switched off: say why the clan pages are gone, and that it is temporary. */}
      {user.suspendedClan && (
        <div className="mt-6 rounded-xl border border-warn/30 bg-warn-wash px-5 py-4 text-sm text-warn" role="status">
          <p className="font-medium">{fmt(a.clanSuspendedTitle, { clan: user.suspendedClan })}</p>
          <p className="mt-1">{a.clanSuspendedBody}</p>
        </div>
      )}

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

          {/* The household this fund covers. It lives beside their own details, because it is
              part of who they are here rather than a separate errand. */}
          {canManageFamily(user) && (
            <section id="family" className="mt-12 min-w-0 scroll-mt-28">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">{t.family.title}</h2>
                {family.length > 0 && <span className="text-sm text-muted">{fmt(t.family.count, { n: family.length })}</span>}
              </div>
              <p className="mb-4 max-w-[65ch] text-sm text-ink-soft">{user.role === "member" ? t.family.lede : t.family.ledeNoClan}</p>
              <FamilyManager dependents={family} />
            </section>
          )}
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

          {user.role === "user" && !user.suspendedClan && (
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

          {/* No clan to join yet? A verified person can propose one and ask to lead it; staff decide. */}
          {user.role === "user" && !user.suspendedClan && (
            <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
              <h2 className="font-display text-xl text-brand-deep">{l.title}</h2>
              <p className="mt-1 text-sm text-ink-soft">{l.body}</p>

              {lead?.status === "pending" ? (
                <div className="mt-4 rounded-lg bg-warn-wash px-4 py-3 text-sm text-warn">
                  <p className="font-medium">{fmt(l.waiting, { clan: lead.clan_name })}</p>
                  <p className="mt-0.5 text-xs">{fmt(a.joinAskedOn, { date: formatDate(lead.created_at, locale) })}</p>
                  <form action={withdrawLeaderRequest}>
                    <button type="submit" className="mt-2 text-sm font-semibold text-brand underline-offset-2 hover:underline">
                      {l.withdraw}
                    </button>
                  </form>
                </div>
              ) : !canJoinClan(user) ? (
                <div className="mt-4 rounded-lg bg-warn-wash px-4 py-3 text-sm text-warn">
                  <p className="font-medium">{t.kyc.needForClan}</p>
                  <p className="mt-0.5 text-xs">{t.kyc.needHint}</p>
                </div>
              ) : (
                <>
                  {lead?.status === "rejected" && (
                    <div className="mt-4 rounded-lg bg-bad-wash px-4 py-3 text-sm text-bad">
                      <p className="font-medium">{fmt(l.declinedMine, { clan: lead.clan_name })}</p>
                      {lead.note && <p className="mt-0.5">{lead.note}</p>}
                    </div>
                  )}
                  <LeadClanForm />
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
