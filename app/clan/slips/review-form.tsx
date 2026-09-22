"use client";

import { useActionState } from "react";
import { reviewSlip } from "@/app/actions/slips";
import { useT } from "@/components/i18n-provider";
import { Notice, TextAreaField } from "@/components/ui";

export function ReviewSlipForm({ slipId }: { slipId: string }) {
  const [state, action, pending] = useActionState(reviewSlip, undefined);
  const t = useT().slips;

  if (state?.success) return <Notice tone="success">{state.success}</Notice>;

  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="slipId" value={slipId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <TextAreaField label={t.reason} name="note" optional placeholder={t.reasonPlaceholder} errors={state?.errors?.note} maxLength={300} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 font-medium text-bad hover:bg-bad-wash disabled:opacity-60"
        >
          {t.reject}
        </button>
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className="inline-flex h-11 flex-[2] items-center justify-center rounded-lg bg-brand px-4 font-semibold text-white shadow-soft hover:bg-brand-2 disabled:opacity-60"
        >
          {t.approve}
        </button>
      </div>
    </form>
  );
}
