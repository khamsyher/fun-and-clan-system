import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill, StatusBadge } from "@/components/badge";
import { DocumentList } from "@/components/document-list";
import { KycBadge, overallKyc } from "@/components/kyc-status";
import { ProfileFacts } from "@/components/profile-facts";
import { ResetPasswordButton } from "@/components/reset-password";
import { requireRole } from "@/lib/dal";
import { queryOne } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getProfile, listDocuments } from "@/lib/profile";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import type { UserStatus } from "@/lib/definitions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/clan/members/[id]">): Promise<Metadata> {
  const [{ id }, t] = await Promise.all([params, getT()]);
  const name = UUID.test(id) ? await queryOne<{ full_name: string }>(`SELECT full_name FROM users WHERE id = $1`, [id]) : null;
  return { title: name ? `${name.full_name} · ${t.clan.members}` : t.clan.members };
}

export default async function ClanMemberPage({ params }: PageProps<"/clan/members/[id]">) {
  const leader = await requireRole("clan_admin");
  const [{ id }, t, locale] = await Promise.all([params, getT(), getLocale()]);
  if (!UUID.test(id)) notFound();

  // Scoped to the leader's own clan: another clan's member is simply not found here.
  const member = await queryOne<{ id: string; full_name: string; status: UserStatus; is_treasurer: boolean; created_at: Date }>(
    `SELECT id, full_name, status, is_treasurer, created_at
       FROM users WHERE id = $1 AND clan_id = $2 AND role = 'member'`,
    [id, leader.clanId],
  );
  if (!member) notFound();

  const [profile, documents] = await Promise.all([getProfile(member.id), listDocuments(member.id)]);
  const p = t.profile;

  return (
    <>
      <Link href="/clan" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {t.clan.members}
      </Link>

      <div className="mt-3">
        <PageHeading title={member.full_name} lede={fmt(p.memberSince, { date: formatDate(member.created_at, locale) })}>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusBadge status={member.status} />
            {member.is_treasurer && <Pill tone="info">{t.treasurer.badge}</Pill>}
            <KycBadge state={overallKyc(documents)} t={t} />
            {member.status === "active" && <ResetPasswordButton userId={member.id} name={member.full_name} />}
          </div>
        </PageHeading>
      </div>

      <div className="mt-8">{profile && <ProfileFacts p={profile} t={t} locale={locale} />}</div>

      <Section title={p.documents} aside={t.kyc.adminDecides}>
        {/* A leader looks, but the platform owner is the one who approves. */}
        <DocumentList docs={documents} t={t} locale={locale} canOpenFile emptyText={p.noDocumentsMember} />
      </Section>
    </>
  );
}
