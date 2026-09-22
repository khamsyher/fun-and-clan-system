"use client";

import { useActionState } from "react";
import { decidePayout } from "@/app/actions/payouts";
import { useT } from "@/components/i18n-provider";
import { Notice, TextAreaField } from "@/components/ui";

export function DecisionForm({ payoutId }: { payoutId: string }) {
  const [state, action, pending] = useActionState(decidePayout, undefined);
  const t = useT().approvals;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="payoutId" value={payoutId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <TextAreaField label={t.note} name="note" placeholder={t.notePlaceholder} errors={state?.errors?.note} maxLength={500} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 font-medium text-bad hover:bg-bad-wash disabled:opacity-60"
        >
          {t.reject}
        </button>
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className="inline-flex h-12 flex-[2] items-center justify-center rounded-lg bg-brand px-4 font-semibold text-white shadow-soft hover:bg-brand-2 disabled:opacity-60"
        >
          {t.approve}
        </button>
      </div>
    </form>
  );
}
