import type { NavArea } from "@/components/area-nav";
import type { CurrentUser } from "./dal";
import type { Dictionary } from "./i18n/config";

/**
 * Every tab in the app, in one place.
 *
 * The product is two areas, and a feature belongs to exactly one of them:
 *  - the **funeral fund**, which is a single clan's business (members, events, money);
 *  - **donations**, which is the whole platform's (anyone the platform has identified).
 * The platform owner's own area replaces the fund area, since they run the system
 * rather than belong to a clan.
 *
 * To add a feature: add its page under the matching role folder in `app/`, then add one
 * line to the right `sections` list here. Nothing else decides what appears in the header.
 */
export function areasFor(user: CurrentUser, t: Dictionary, badges: { kycWaiting?: number } = {}): NavArea[] {
  const donations: NavArea = {
    href: "/donations",
    label: t.nav.areaDonations,
    note: t.nav.areaDonationsNote,
    icon: "donations",
    // The public share pages belong to this area as well, for anyone signed in who lands on one.
    owns: ["/d"],
    sections: [],
  };

  // A general user belongs to no clan, so donations is the only area they have.
  if (user.role === "user") return [donations];

  if (user.role === "super_admin")
    return [
      {
        href: "/admin",
        label: t.nav.areaPlatform,
        note: t.nav.areaPlatformNote,
        icon: "fund",
        owns: [],
        sections: [
          { href: "/admin", label: t.nav.overview },
          { href: "/admin/users", label: t.nav.users },
          // The badge keeps the queue visible after the notification has been read.
          { href: "/admin/kyc", label: t.nav.kyc, badge: badges.kycWaiting },
          { href: "/admin/reports", label: t.nav.reports },
        ],
      },
      donations,
    ];

  if (user.role === "clan_admin")
    return [
      {
        href: "/clan",
        label: t.nav.areaFund,
        note: t.nav.areaFundNote,
        icon: "fund",
        owns: [],
        sections: [
          { href: "/clan", label: t.nav.overview },
          { href: "/clan/events", label: t.nav.events },
          { href: "/clan/slips", label: t.nav.slips },
          // Mode A clans collect on a schedule; Mode B clans have nothing to show here.
          ...(user.clanFundMode === "A" ? [{ href: "/clan/contributions", label: t.nav.contributions }] : []),
          { href: "/clan/fund", label: t.nav.fund },
          { href: "/clan/reports", label: t.nav.reports },
          { href: "/clan/settings", label: t.nav.settings },
        ],
      },
      donations,
    ];

  return [
    {
      href: "/member",
      label: t.nav.areaFund,
      note: t.nav.areaFundNote,
      icon: "fund",
      owns: [],
      sections: [
        { href: "/member", label: t.nav.overview },
        { href: "/member/events", label: t.nav.events },
        { href: "/member/payments", label: t.nav.payments },
        { href: "/member/family", label: t.nav.family },
        ...(user.isTreasurer ? [{ href: "/member/approvals", label: t.nav.approvals }] : []),
      ],
    },
    donations,
  ];
}
