import type { Metadata } from "next";
import { requireRole } from "@/lib/dal";
import { getT } from "@/lib/i18n/server";
import { ReportDeathPage } from "@/components/report-death-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).events.newMetaTitle };
}

export default async function NewEventPage() {
  const leader = await requireRole("clan_admin");
  return <ReportDeathPage clanId={leader.clanId!} backHref="/clan/events" memberId={null} />;
}
