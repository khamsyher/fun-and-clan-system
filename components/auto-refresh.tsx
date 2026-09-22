"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useT } from "./i18n-provider";

/** Re-fetches the server-rendered page every few seconds while it's visible, so the progress bar stays live. */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const t = useT().events;

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-ok" />
      </span>
      {t.live}
    </span>
  );
}
