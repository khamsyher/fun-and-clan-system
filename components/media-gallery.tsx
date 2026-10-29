"use client";

import { useState } from "react";
import { useT } from "./i18n-provider";

type Item = { id: string; fileId: string; kind: "image" | "video" };

/**
 * A help request's photos and videos: one large viewer and a strip of thumbnails to pick from.
 * Videos stream from /files (range requests), so they start quickly and can be skipped through.
 */
export function MediaGallery({ items }: { items: Item[] }) {
  const t = useT().donations;
  const [current, setCurrent] = useState(0);
  if (items.length === 0) return null;
  const shown = items[Math.min(current, items.length - 1)];

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-line bg-ink/95">
        {shown.kind === "image" ? (
          <a href={`/files/${shown.fileId}`} target="_blank" rel="noreferrer" title={t.openFull}>
            {/* eslint-disable-next-line @next/next/no-img-element -- auth-checked upload */}
            <img src={`/files/${shown.fileId}`} alt="" className="mx-auto max-h-[28rem] w-full object-contain" />
          </a>
        ) : (
          // Keyed so switching videos starts the new one cleanly.
          <video key={shown.fileId} src={`/files/${shown.fileId}`} controls playsInline preload="metadata" className="mx-auto max-h-[28rem] w-full bg-black" />
        )}
      </div>

      {items.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={t.galleryTitle}>
          {items.map((m, i) => (
            <li key={m.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`${m.kind === "video" ? t.video : t.photo} ${i + 1}`}
                aria-current={i === current}
                className={`relative block size-16 overflow-hidden rounded-lg border-2 sm:size-20 ${i === current ? "border-brand" : "border-transparent opacity-80 hover:opacity-100"}`}
              >
                {m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- auth-checked upload
                  <img src={`/files/${m.fileId}`} alt="" className="size-full object-cover" />
                ) : (
                  <>
                    <video src={`/files/${m.fileId}`} muted playsInline preload="metadata" className="size-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-lg text-white" aria-hidden="true">
                      ▶
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
