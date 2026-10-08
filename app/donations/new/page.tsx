import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import { RequestForm } from "./request-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).donations.newMetaTitle };
}

export default async function NewRequestPage() {
  await requireRole(...DONOR_ROLES);
  const t = await getT();

  return (
    <>
      <Link href="/donations" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {t.donations.back}
      </Link>
      <div className="mt-3">
        <PageHeading title={t.donations.newTitle} lede={t.donations.newLede} />
      </div>
      <div className="mt-8 max-w-2xl rounded-xl border border-line bg-surface p-5 sm:p-6">
        <RequestForm />
      </div>
    </>
  );
}
