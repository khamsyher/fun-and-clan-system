import { PageHeading } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";

/**
 * System settings: how the app looks. Each other kind of setting lives where it's used —
 * the platform fee on the Fund page, clan types on the Clans page.
 */
export default async function AdminSettingsLayout({ children }: LayoutProps<"/admin/settings">) {
  await requireRole(...STAFF_ROLES);
  const b = (await getT()).branding;

  return (
    <>
      <PageHeading title={b.title} lede={b.lede} />
      {children}
    </>
  );
}
