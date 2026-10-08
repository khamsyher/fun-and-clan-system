"use client";

import { useState } from "react";
import { fmt } from "@/lib/i18n/config";
import { useT } from "./i18n-provider";
import { CheckIcon, LinkIcon, ShareIcon } from "./icons";

/** Share a donation request to Facebook, WhatsApp, Telegram, the phone's own share sheet, or copy the link. */
export function ShareButtons({ url, title, compact = false }: { url: string; title: string; compact?: boolean }) {
  const t = useT().donations;
  const [copied, setCopied] = useState(false);
  const text = fmt(t.shareText, { title });

  const links = [
    { key: "fb", label: t.shareFacebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, color: "#1877F2" },
    { key: "wa", label: t.shareWhatsapp, href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, color: "#25D366" },
    { key: "tg", label: t.shareTelegram, href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, color: "#2AABEE" },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked (http, old browser): show the link so it can be copied by hand.
      window.prompt(t.copyLink, url);
    }
  };

  /** The phone's own share sheet when the browser has one, otherwise copy the link. */
  const shareNative = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title, text, url }).catch(() => {});
    } else {
      void copy();
    }
  };

  return (
    <div className={compact ? "" : "rounded-xl border border-line bg-surface p-5 sm:p-6"}>
      {!compact && (
        <>
          <h2 className="font-semibold text-ink">{t.share}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t.shareHint}</p>
        </>
      )}
      <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-4"}`}>
        {links.map((l) => (
          <a
            key={l.key}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: l.color }}
          >
            {l.label}
          </a>
        ))}
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-sunken"
        >
          {copied ? <CheckIcon width={16} height={16} /> : <LinkIcon width={16} height={16} />}
          {copied ? t.copied : t.copyLink}
        </button>
        <button
          type="button"
          onClick={shareNative}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink hover:bg-sunken"
        >
          <ShareIcon width={16} height={16} />
          {t.shareMore}
        </button>
      </div>
    </div>
  );
}
