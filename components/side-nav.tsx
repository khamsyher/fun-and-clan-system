"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AreaIcon, type NavArea } from "./area-nav";
import { useT } from "./i18n-provider";

type Item = { href: string; label: string; badge?: number; match: string[] };

/** One link per page; an area without sections is a single link to the area itself. */
function itemsOf(area: NavArea): Item[] {
  if (area.sections.length === 0) return [{ href: area.href, label: area.label, match: [area.href, ...area.owns] }];
  return area.sections.map((s) => ({ ...s, match: [s.href] }));
}

/**
 * The platform owner's menu as a sidebar: each area with sections becomes a titled group,
 * an area without sections a single link. Used fixed on large screens and inside the drawer.
 */
export function SideNav({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();
  // The longest matching path wins, so /admin doesn't light up on /admin/users.
  const active = areas
    .flatMap(itemsOf)
    .flatMap((i) => i.match.map((m) => ({ href: i.href, m })))
    .filter(({ m }) => pathname === m || pathname.startsWith(`${m}/`))
    .sort((a, b) => b.m.length - a.m.length)[0]?.href;

  const link = (item: Item, icon?: ReactNode) => {
    const isActive = item.href === active;
    return (
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive ? "bg-brand-wash font-semibold text-brand" : "font-medium text-ink-soft hover:bg-sunken hover:text-ink"
        }`}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {Boolean(item.badge) && (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-warn-wash px-1.5 py-0.5 text-xs font-semibold text-warn">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav aria-label="Main" className="space-y-6">
      {areas.map((area) =>
        area.sections.length === 0 ? (
          <div key={area.href}>{link(itemsOf(area)[0], <AreaIcon name={area.icon} />)}</div>
        ) : (
          <div key={area.href}>
            <p className="flex items-center gap-2 px-3 pb-2 text-xs font-semibold tracking-[0.06em] text-muted uppercase">
              <AreaIcon name={area.icon} />
              {area.label}
            </p>
            <ul className="space-y-0.5">
              {itemsOf(area).map((item) => (
                <li key={item.href}>{link(item)}</li>
              ))}
            </ul>
          </div>
        ),
      )}
    </nav>
  );
}

/** Below the large breakpoint the sidebar slides in from the left behind a menu button. */
export function MobileNav({ areas, brand }: { areas: NavArea[]; brand: ReactNode }) {
  const t = useT().common;
  const pathname = usePathname();
  // Remembers the page it was opened on, so choosing another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.menu}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="flex size-10 items-center justify-center rounded-lg text-ink-soft hover:bg-sunken hover:text-ink lg:hidden"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <div className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`} inert={!open}>
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <div
          id="mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label={t.menu}
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-soft transition-transform duration-200 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
            {brand}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.closeMenu}
              className="flex size-9 items-center justify-center rounded-lg text-ink-soft hover:bg-sunken hover:text-ink"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-5"><SideNav areas={areas} /></div>
        </div>
      </div>
    </>
  );
}
