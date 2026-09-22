import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";

// Shared by all three roles.
export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const user = await requireRole();
  return <AppShell user={user}>{children}</AppShell>;
}
