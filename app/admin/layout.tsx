import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES } from "@/lib/definitions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireRole(...STAFF_ROLES);
  return <AppShell user={user}>{children}</AppShell>;
}
