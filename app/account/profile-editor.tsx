"use client";

import { useState, type ReactNode } from "react";
import { useT } from "@/components/i18n-provider";
import { buttonQuiet } from "@/components/button-styles";
import { PencilIcon } from "@/components/icons";
import { Notice } from "@/components/ui";
import { ProfileForm } from "./profile-form";

type Current = Parameters<typeof ProfileForm>[0]["current"];

/**
 * Details are read until the person asks to change them. `view` is the server-rendered
 * reading version, so the same markup serves this page and everyone else's view of them.
 */
export function ProfileEditor({ view, current }: { view: ReactNode; current: Current }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const t = useT().profile;

  if (editing) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="mb-5 font-display text-xl text-brand-deep">{t.yourDetails}</h2>
        <ProfileForm
          current={current}
          onSaved={(message) => {
            setSaved(message);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {saved && <Notice tone="success">{saved}</Notice>}
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-xl text-brand-deep">{t.yourDetails}</h2>
        <button
          type="button"
          onClick={() => {
            setSaved(null);
            setEditing(true);
          }}
          className={buttonQuiet}
        >
          <PencilIcon width={16} height={16} />
          {t.edit}
        </button>
      </div>
      {view}
    </div>
  );
}
