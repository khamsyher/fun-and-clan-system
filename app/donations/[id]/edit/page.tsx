import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { getRequest } from "@/lib/donations";
import { getT } from "@/lib/i18n/server";
import { RequestForm } from "../../new/request-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).donations.editMetaTitle };
}

export default async function EditRequestPage({ params }: PageProps<"/donations/[id]/edit">) {
  const me = await requireRole(...DONOR_ROLES);
  const { id } = await params;
  const t = await getT();

  const request = await getRequest(id);
  // Only the person who asked can open this page; everyone else sees "not found".
  if (!request || request.created_by !== me.id || request.status === "cancelled") notFound();

  return (
    <>
      <Link href={`/donations/${request.id}`} className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {request.title}
      </Link>
      <div className="mt-3">
        <PageHeading title={t.donations.editTitle} lede={t.donations.editLede} />
      </div>
      <div className="mt-8 max-w-2xl rounded-xl border border-line bg-surface p-5 sm:p-6">
        <RequestForm
          initial={{
            id: request.id,
            title: request.title,
            story: request.story,
            target: request.target_amount ? String(request.target_amount) : "",
            deadline: request.deadline ? new Date(request.deadline).toISOString().slice(0, 10) : "",
            bankName: request.bank_name ?? "",
            accountName: request.account_name ?? "",
            accountNumber: request.account_number ?? "",
            photoFileId: request.photo_file_id,
            qrFileId: request.qr_file_id,
          }}
        />
      </div>
    </>
  );
}
