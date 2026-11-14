import type { Metadata } from "next";
import { ReportDeathPage } from "@/components/report-death-page";
import { requireRole } from "@/lib/dal";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).events.newMetaTitle };
}

export default async function NewMemberEventPage() {
  const member = await requireRole("member");
  return <ReportDeathPage clanId={member.clanId!} backHref="/member/events" memberId={member.id} />;
}
