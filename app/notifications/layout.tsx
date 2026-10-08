import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";

export default async function NotificationsLayout({ children }: LayoutProps<"/notifications">) {
  const user = await requireRole();
  return <AppShell user={user}>{children}</AppShell>;
}
