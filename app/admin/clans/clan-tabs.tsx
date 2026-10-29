import { NavTabs } from "@/components/nav-tabs";
import type { Dictionary } from "@/lib/i18n/config";
import { countPendingLeaderRequests } from "@/lib/leader-requests";
import { countPendingPolicies } from "@/lib/policies";

/** Clan management: the clans, the types they're grouped by, requests to lead a new one, and clan rules to approve. */
export async function ClanTabs({ t }: { t: Dictionary }) {
  const [waiting, rules] = await Promise.all([countPendingLeaderRequests(), countPendingPolicies()]);
  return (
    <div className="mt-6 border-b border-line">
      <NavTabs
        items={[
          { href: "/admin/clans", label: t.clansAdmin.tabClans },
          { href: "/admin/clans/types", label: t.clanTypes.title },
          { href: "/admin/clans/requests", label: t.leaderRequests.tab, badge: waiting },
          { href: "/admin/clans/rules", label: t.policy.tab, badge: rules },
        ]}
      />
    </div>
  );
}
