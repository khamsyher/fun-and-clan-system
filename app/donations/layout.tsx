import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";

// Donation requests are cross-clan: every signed-in user, whatever their role, sees this area.
export default async function DonationsLayout({ children }: LayoutProps<"/donations">) {
  const user = await requireRole();
  return <AppShell user={user}>{children}</AppShell>;
}
