"use client";

import { useActionState, useState } from "react";
import { resetPassword } from "@/app/actions/account";
import { fmt } from "@/lib/i18n/config";
import { useT } from "./i18n-provider";
import { KeyIcon } from "./icons";

/** Two-step "Reset password" control; shows the temporary password once. */
export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  const [confirming, setConfirming] = useState(false);
  const t = useT().reset;

  if (state?.success) {
    return (
      <div className="rounded-lg bg-brand-wash px-3 py-2 text-left" role="status">
        <p className="text-xs text-ink-soft">{fmt(t.done, { name })}</p>
        <p className="tabular mt-0.5 font-mono text-base font-semibold tracking-wider text-brand select-all">{state.success}</p>
        <p className="mt-1 max-w-56 text-xs text-muted">{t.note}</p>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-ink-soft hover:bg-sunken hover:text-ink"
      >
        <KeyIcon width={16} height={16} />
        {t.button}
      </button>
    );
  }

  return (
    <form action={action} className="inline-flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <span className="text-xs text-ink-soft">{fmt(t.confirm, { name })}</span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-sunken"
      >
        {t.cancel}
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-2.5 py-1 text-sm font-semibold text-white hover:bg-brand-2 disabled:opacity-60"
      >
        {t.yes}
      </button>
    </form>
  );
}
