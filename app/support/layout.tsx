import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";

export default async function SupportLayout({ children }: LayoutProps<"/support">) {
  const user = await requireRole();
  return <AppShell user={user}>{children}</AppShell>;
}
