"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setClanActive } from "@/app/actions/admin";
import { useT } from "@/components/i18n-provider";
import { fmt } from "@/lib/i18n/config";

/**
 * Enables or disables a clan. Disabling asks first, naming the clan, because it changes what
 * every leader and member of it sees. The button sits where the opposite one appears after
 * saving, so both lock while the change is on its way: a quick double click can't undo it.
 */
export function ClanActiveButton({ clanId, active, name }: { clanId: string; active: boolean; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const t = useT();
  const a = t.admin;

  if (active && !confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-bad transition-colors hover:bg-bad-wash"
      >
        {a.disable}
      </button>
    );
  }

  return (
    <form action={setClanActive} onSubmit={() => setConfirming(false)} className="inline-flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="clanId" value={clanId} />
      <input type="hidden" name="active" value={String(!active)} />
      {active && (
        <>
          <span className="max-w-64 text-left text-xs text-ink-soft">{fmt(t.clansAdmin.disableConfirm, { name })}</span>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-sunken">
            {t.users.cancel}
          </button>
        </>
      )}
      <Submit active={active} label={active ? t.clansAdmin.disableYes : a.enable} working={t.users.working} />
    </form>
  );
}

function Submit({ active, label, working }: { active: boolean; label: string; working: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-wait disabled:opacity-60 ${
        active ? "bg-bad font-semibold text-white hover:opacity-90" : "text-ok hover:bg-ok-wash"
      }`}
    >
      {pending ? working : label}
    </button>
  );
}
