import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { buttonPrimary } from "@/components/button-styles";
import { requireRole } from "@/lib/dal";
import { canAskForHelp } from "@/lib/access";
import { DONOR_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import { RequestForm } from "./request-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).donations.newMetaTitle };
}

export default async function NewRequestPage() {
  const me = await requireRole(...DONOR_ROLES);
  const t = await getT();

  return (
    <>
      <Link href="/donations" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {t.donations.back}
      </Link>
      <div className="mt-3">
        <PageHeading title={t.donations.newTitle} lede={t.donations.newLede} />
      </div>
      {/* Money goes straight to whoever asks, so only an identified person may ask. */}
      {canAskForHelp(me) ? (
        <div className="mt-8 max-w-2xl rounded-xl border border-line bg-surface p-5 sm:p-6">
          <RequestForm />
        </div>
      ) : (
        <div className="mt-8 max-w-2xl rounded-xl border border-warn/40 bg-warn-wash p-5 sm:p-6">
          <h2 className="font-display text-xl text-brand-deep">{t.kyc.needTitle}</h2>
          <p className="mt-2 text-sm text-ink">{t.kyc.needForRequest}</p>
          <p className="mt-1 text-sm text-ink-soft">{t.kyc.needHint}</p>
          <Link href="/account" className={`${buttonPrimary} mt-5`}>
            {t.kyc.goToAccount}
          </Link>
        </div>
      )}
    </>
  );
}
