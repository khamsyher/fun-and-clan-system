import { NavTabs } from "@/components/nav-tabs";
import type { Dictionary } from "@/lib/i18n/config";
import { countPendingLeaderRequests } from "@/lib/leader-requests";

/** Clan management: the clans, the types they're grouped by, and requests to lead a new one. */
export async function ClanTabs({ t }: { t: Dictionary }) {
  const waiting = await countPendingLeaderRequests();
  return (
    <div className="mt-6 border-b border-line">
      <NavTabs
        items={[
          { href: "/admin/clans", label: t.clansAdmin.tabClans },
          { href: "/admin/clans/types", label: t.clanTypes.title },
          { href: "/admin/clans/requests", label: t.leaderRequests.tab, badge: waiting },
        ]}
      />
    </div>
  );
}
