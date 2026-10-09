"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavTabs, type NavItem } from "./nav-tabs";

export type NavArea = {
  /** Where the area opens. */
  href: string;
  label: string;
  note: string;
  icon: "fund" | "donations";
  /** Paths that belong to this area, beyond its own sections. */
  owns: string[];
  sections: NavItem[];
};

const owns = (area: NavArea, pathname: string) =>
  [area.href, ...area.owns, ...area.sections.map((s) => s.href)].some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * The product is two things: a clan's funeral fund, and donations open to everyone the
 * platform has identified. The switcher says which one you are in; the tabs below it
 * only ever belong to that one.
 */
export function AreaNav({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();
  const active = areas.find((a) => owns(a, pathname)) ?? areas[0];

  return (
    <div className="flex flex-col gap-1 pt-2.5">
      <nav aria-label="Areas" className="-mx-1 flex overflow-x-auto px-1 pb-1">
        <div className="inline-flex gap-1 rounded-xl bg-sunken p-1">
          {areas.map((area) => {
            const current = area === active;
            return (
              <Link
                key={area.href}
                href={area.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors sm:px-4 ${
                  current ? "bg-surface text-brand shadow-soft" : "text-ink-soft hover:text-ink"
                }`}
              >
                <AreaIcon name={area.icon} />
                <span>{area.label}</span>
                <span className="hidden text-xs font-normal text-muted lg:inline">{area.note}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      {active.sections.length > 1 && <NavTabs items={active.sections} />}
    </div>
  );
}

/** Drawn here rather than imported so the two areas read as a pair at a glance. */
function AreaIcon({ name }: { name: NavArea["icon"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "donations") {
    return (
      <svg {...common}>
        <path d="M12 20.25S3.75 15.5 3.75 9.75a4 4 0 0 1 7.1-2.5l1.15 1.4 1.15-1.4a4 4 0 0 1 7.1 2.5c0 5.75-8.25 10.5-8.25 10.5Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3.75 20.25h16.5" />
      <path d="M5.75 20.25V9.5l6.25-4.25 6.25 4.25v10.75" />
      <path d="M10 20.25v-5.5h4v5.5" />
    </svg>
  );
}
