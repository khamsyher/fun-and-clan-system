"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { markAllRead } from "@/app/actions/notifications";
import { fmt } from "@/lib/i18n/config";
import { useT } from "./i18n-provider";
import { BellIcon } from "./icons";

export type BellItem = { id: string; text: string; link: string | null; when: string; unread: boolean };

/** Header bell: unread count, a panel with the latest items, and a link to the full list. */
export function NotificationBell({ items, unread }: { items: BellItem[]; unread: number }) {
  const t = useT().notifications;
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Opening the panel counts as reading them.
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) startTransition(() => void markAllRead());
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread > 0 ? `${t.bell}: ${fmt(t.unread, { n: unread })}` : t.bell}
        className="relative flex size-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
      >
        <BellIcon width={20} height={20} />
        {unread > 0 && (
          <span className="tabular absolute -top-0.5 -right-0.5 min-w-4.5 rounded-full bg-bad px-1 text-center text-[11px] leading-[18px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* On phones the panel is pinned to the screen edges; from sm up it hangs under the bell. */}
      {open && (
        <div className="fixed inset-x-3 top-16 z-30 overflow-hidden rounded-xl border border-line bg-surface shadow-soft sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-80">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold text-ink">{t.title}</p>
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-sm font-medium text-brand hover:text-brand-bright">
              {t.seeAll}
            </Link>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-soft">{t.empty}</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <Item item={n} onNavigate={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Item({ item, onNavigate }: { item: BellItem; onNavigate: () => void }) {
  const body = (
    <>
      <p className={`text-sm ${item.unread ? "font-medium text-ink" : "text-ink-soft"}`}>{item.text}</p>
      <p className="mt-0.5 text-xs text-muted">{item.when}</p>
    </>
  );
  const className = `block px-4 py-3 transition-colors ${item.unread ? "bg-brand-wash/50" : ""} hover:bg-sunken`;
  return item.link ? (
    <Link href={item.link} onClick={onNavigate} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
