import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/app-shell";
import { SupportChat } from "@/components/support-chat";
import { requireRole } from "@/lib/dal";
import { isStaffRole } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import { myConversation } from "@/lib/support";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).support.title };
}

/** A person's own conversation with the platform team. Staff answer from their inbox instead. */
export default async function SupportPage() {
  const me = await requireRole();
  if (isStaffRole(me.role)) redirect("/admin/support");
  const [t, chat] = await Promise.all([getT(), myConversation(me.id)]);

  return (
    <>
      <PageHeading title={t.support.title} lede={t.support.lede} />
      <div className="mt-8 max-w-3xl">
        <SupportChat threadId={chat.threadId} initial={chat.messages} status={chat.status} staff={false} />
      </div>
    </>
  );
}
