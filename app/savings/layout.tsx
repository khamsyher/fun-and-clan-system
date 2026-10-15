import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";

// Savings groups mix people from any clan, or none. The platform owner runs the system and is not in them.
export default async function SavingsLayout({ children }: LayoutProps<"/savings">) {
  const user = await requireRole(...DONOR_ROLES);
  return <AppShell user={user}>{children}</AppShell>;
}
