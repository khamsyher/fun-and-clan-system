"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteUser, setUserBlocked } from "@/app/actions/users";
import { useT } from "@/components/i18n-provider";
import { BanIcon, CheckIcon, TrashIcon } from "@/components/icons";
import { fmt } from "@/lib/i18n/config";

const quiet = "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap";

/** Blocking asks first, because it signs the person out straight away. Letting them back in does not. */
export function BlockButton({ userId, name, blocked }: { userId: string; name: string; blocked: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const t = useT().users;

  if (blocked) {
    return (
      <form action={setUserBlocked} className="inline">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="blocked" value="false" />
        <Submit className={`${quiet} text-ok hover:bg-ok-wash`} pending={t.working}>
          <CheckIcon width={16} height={16} />
          {t.unblock}
        </Submit>
      </form>
    );
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${quiet} text-ink-soft hover:bg-sunken hover:text-ink`}>
        <BanIcon width={16} height={16} />
        {t.block}
      </button>
    );
  }

  return (
    <form action={setUserBlocked} className="inline-flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="blocked" value="true" />
      <span className="text-xs text-ink-soft">{fmt(t.blockConfirm, { name })}</span>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-sunken">
        {t.cancel}
      </button>
      <Submit className="rounded-md bg-bad px-2.5 py-1 text-sm font-semibold text-white hover:opacity-90" pending={t.working}>
        {t.blockYes}
      </Submit>
    </form>
  );
}

/**
 * Deleting is permanent, so it asks first and says plainly when the database refuses —
 * an account with bills, slips, payouts or donations behind it can only be blocked.
 */
export function DeleteButton({ userId, name }: { userId: string; name: string }) {
  const [state, action] = useActionState(deleteUser, undefined);
  const [confirming, setConfirming] = useState(false);
  const t = useT().users;

  if (state?.message) {
    return (
      <p className="max-w-64 rounded-lg bg-bad-wash px-3 py-2 text-left text-xs text-bad" role="alert">
        {state.message}
      </p>
    );
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${quiet} text-ink-soft hover:bg-bad-wash hover:text-bad`}>
        <TrashIcon width={16} height={16} />
        {t.delete}
      </button>
    );
  }

  return (
    <form action={action} className="inline-flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <span className="max-w-56 text-left text-xs text-ink-soft">{fmt(t.deleteConfirm, { name })}</span>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-sunken">
        {t.cancel}
      </button>
      <Submit className="rounded-md bg-bad px-2.5 py-1 text-sm font-semibold text-white hover:opacity-90" pending={t.working}>
        {t.deleteYes}
      </Submit>
    </form>
  );
}

function Submit({ children, className, pending }: { children: React.ReactNode; className: string; pending: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" disabled={busy} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
      {busy ? pending : children}
    </button>
  );
}
