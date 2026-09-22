"use client";

import { useEffect, useId, useRef, useState } from "react";
import { setLocale } from "@/app/actions/locale";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/config";
import { useLocale, useT } from "./i18n-provider";
import { CheckIcon, GlobeIcon } from "./icons";

export function LanguageSwitcher({ tone = "default" }: { tone?: "default" | "compact" }) {
  const locale = useLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

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

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${t.common.language}: ${LOCALE_NAMES[locale].native}`}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-sm font-medium text-ink shadow-soft transition-colors hover:border-brand-bright/50 hover:bg-sunken"
      >
        <GlobeIcon width={17} height={17} className="text-brand-bright" />
        <span>{tone === "compact" ? LOCALE_NAMES[locale].short : LOCALE_NAMES[locale].native}</span>
        <svg viewBox="0 0 12 12" className={`size-3 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-soft"
        >
          {LOCALES.map((l) => (
            <form key={l} action={setLocale} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="locale" value={l} />
              <button
                type="submit"
                lang={l}
                aria-current={l === locale ? "true" : undefined}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-sunken ${
                  l === locale ? "font-semibold text-brand" : "text-ink"
                }`}
              >
                {LOCALE_NAMES[l].native}
                {l === locale && <CheckIcon width={16} height={16} />}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
