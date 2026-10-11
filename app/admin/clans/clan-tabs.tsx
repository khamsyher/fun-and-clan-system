import { NavTabs } from "@/components/nav-tabs";
import type { Dictionary } from "@/lib/i18n/config";

/** The two halves of clan management: the clans themselves, and the types they're grouped by. */
export function ClanTabs({ t }: { t: Dictionary }) {
  return (
    <div className="mt-6 border-b border-line">
      <NavTabs
        items={[
          { href: "/admin/clans", label: t.clansAdmin.tabClans },
          { href: "/admin/clans/types", label: t.clanTypes.title },
        ]}
      />
    </div>
  );
}
