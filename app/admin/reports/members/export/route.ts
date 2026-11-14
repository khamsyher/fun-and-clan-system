import { getCurrentUser } from "@/lib/dal";
import { isStaffRole } from "@/lib/definitions";
import { platformMembersWorkbook } from "@/lib/export/xlsx";
import { DICTIONARIES } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n/server";
import { listPlatformMembersReport } from "@/lib/users";

/** Downloads the detailed platform-wide member roster (platform staff only). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isStaffRole(user.role)) return new Response("Forbidden", { status: 403 });

  const locale = await getLocale();
  const rows = await listPlatformMembersReport();
  const body = await platformMembersWorkbook(rows, DICTIONARIES[locale], locale, user.fullName);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="platform-members.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
