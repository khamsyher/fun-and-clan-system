import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";

export default async function ClanLayout({ children }: LayoutProps<"/clan">) {
  const user = await requireRole("clan_admin");
  return <AppShell user={user}>{children}</AppShell>;
}
