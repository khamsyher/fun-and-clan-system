import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";

export default async function MemberLayout({ children }: LayoutProps<"/member">) {
  const user = await requireRole("member");
  return <AppShell user={user}>{children}</AppShell>;
}
