import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireRole("super_admin");
  return <AppShell user={user}>{children}</AppShell>;
}
