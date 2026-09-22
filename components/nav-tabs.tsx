"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // The longest matching href wins, so /clan doesn't light up on /clan/settings.
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Sections">
      {items.map((item) => {
        const isActive = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              isActive ? "border-brand text-brand" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
