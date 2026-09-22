import type { Metadata } from "next";
import { PageHeading } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { getT } from "@/lib/i18n/server";
import { ChangePasswordForm } from "./password-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).account.metaTitle };
}

export default async function AccountPage() {
  const user = await requireRole();
  const t = await getT();

  return (
    <>
      <PageHeading title={t.account.title} lede={t.account.lede} />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <ChangePasswordForm />
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
          <div className="mt-4">
            <dt className="text-muted">{t.account.role}</dt>
            <dd className="mt-0.5 font-medium text-ink">{t.roles[user.role]}</dd>
          </div>
          {user.clanName && (
            <div className="mt-4">
              <dt className="text-muted">{t.member.clan}</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {user.clanName} ({user.clanCode})
              </dd>
            </div>
          )}
        </dl>
      </div>
    </>
  );
}
