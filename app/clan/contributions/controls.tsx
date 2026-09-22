"use client";

import { useActionState, useState } from "react";
import { openPeriod, recordDuePayment, undoDuePayment } from "@/app/actions/contributions";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { fmt } from "@/lib/i18n/config";

export function OpenPeriodForm({ periodType, suggestion }: { periodType: "monthly" | "yearly"; suggestion: string }) {
  const [state, action] = useActionState(openPeriod, undefined);
  const t = useT().contributions;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <Field
        label={t.label}
        name="label"
        defaultValue={state?.success ? "" : (state?.values?.label ?? suggestion)}
        placeholder={suggestion}
        hint={fmt(periodType === "monthly" ? t.labelHintMonth : t.labelHintYear, { example: suggestion })}
        errors={state?.errors?.label}
        className="[&_input]:tabular-nums"
      />
      <SubmitButton pendingLabel={t.opening} className="w-full">
        {t.open}
      </SubmitButton>
    </form>
  );
}

/** Per-due control, same shape as the event bill control: record cash/transfer, or undo. */
export function DueControls({ dueId, status, viaSlip }: { dueId: string; status: string; viaSlip: boolean }) {
  const t = useT().events;
  const [open, setOpen] = useState(false);
  const [payState, payAction, paying] = useActionState(recordDuePayment, undefined);
  const [undoState, undoAction, undoing] = useActionState(undoDuePayment, undefined);
  const error = payState?.message ?? undoState?.message;

  if (status === "paid") {
    if (viaSlip) return null;
    return (
      <form action={undoAction} className="inline">
        <input type="hidden" name="dueId" value={dueId} />
        <button type="submit" disabled={undoing} className="rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-soft hover:bg-sunken hover:text-ink">
          {t.undo}
        </button>
        {error && <p className="text-xs text-bad">{error}</p>}
      </form>
    );
  }
  if (status !== "unpaid") return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-white hover:bg-brand-2"
      >
        {t.recordPaid}
      </button>
    );
  }
  return (
    <form action={payAction} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="dueId" value={dueId} />
      <select name="method" aria-label={t.paidMethod} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm">
        <option value="cash">{t.method.cash}</option>
        <option value="transfer">{t.method.transfer}</option>
      </select>
      <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-sunken">
        {t.cancel}
      </button>
      <button type="submit" disabled={paying} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:opacity-60">
        {t.save}
      </button>
      {error && <p className="w-full text-right text-xs text-bad">{error}</p>}
    </form>
  );
}
