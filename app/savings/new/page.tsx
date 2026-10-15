import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import { GroupForm } from "../group-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).savings.newMetaTitle };
}

export default async function NewSavingsGroupPage() {
  await requireRole(...DONOR_ROLES);
  const s = (await getT()).savings;
  return (
    <>
      <Link href="/savings" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {s.back}
      </Link>
      <div className="mt-3">
        <PageHeading title={s.newTitle} lede={s.newLede} />
      </div>
      <div className="mt-8 max-w-2xl rounded-xl border border-line bg-surface p-5 sm:p-6">
        <GroupForm />
      </div>
    </>
  );
}
