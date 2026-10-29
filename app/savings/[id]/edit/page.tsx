import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import { getGroup } from "@/lib/savings";
import { GroupForm } from "../../group-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).savings.editMetaTitle };
}

export default async function EditSavingsGroupPage({ params }: PageProps<"/savings/[id]/edit">) {
  const me = await requireRole(...DONOR_ROLES);
  const [{ id }, t] = await Promise.all([params, getT()]);
  const s = t.savings;
  const group = await getGroup(id);
  // Settings only change while nobody has paid anything yet.
  if (!group || group.organizer_id !== me.id || group.status !== "forming") notFound();

  return (
    <>
      <Link href={`/savings/${group.id}`} className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {group.name}
      </Link>
      <div className="mt-3">
        <PageHeading title={s.editTitle} />
      </div>
      <div className="mt-8 max-w-2xl rounded-xl border border-line bg-surface p-5 sm:p-6">
        <GroupForm
          initial={{
            id: group.id,
            name: group.name,
            description: group.description ?? "",
            amount: group.amount,
            period: group.period,
            startDate: group.start_date,
            rules: group.rules ?? "",
            rulesFileId: group.rules_file_id,
          }}
        />
      </div>
    </>
  );
}
