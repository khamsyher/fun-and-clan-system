"use client";

import { useActionState, useState } from "react";
import { uploadSlip } from "@/app/actions/slips";
import { useT } from "@/components/i18n-provider";
import { UploadIcon } from "@/components/icons";
import { Field, FileField, Notice, SubmitButton } from "@/components/ui";
import { fmt } from "@/lib/i18n/config";

const kip = (n: number) => `${new Intl.NumberFormat("en-US").format(n)} ₭`;

/** "Upload slip" button that opens the upload form for one payable item. */
export function SlipUpload({ target, amount, debt }: { target: string; amount: number; debt: number }) {
  const tt = useT();
  const t = tt.slips;
  const [open, setOpen] = useState(false);
  const [includeDebt, setIncludeDebt] = useState(debt > 0);
  const [state, action] = useActionState(uploadSlip, undefined);
  const v = state?.values;
  const today = new Date().toISOString().slice(0, 10);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-soft hover:bg-brand-2"
      >
        <UploadIcon width={16} height={16} />
        {tt.payments.pay}
      </button>
    );
  }

  return (
    <form action={action} className="mt-4 w-full space-y-4 rounded-lg border border-line bg-paper/60 p-4" noValidate>
      <input type="hidden" name="target" value={target} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      {debt > 0 && (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="includeDebt"
            checked={includeDebt}
            onChange={(e) => setIncludeDebt(e.target.checked)}
            className="mt-0.5 size-4 accent-brand"
          />
          {fmt(t.includeDebt, { amount: kip(debt) })}
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          key={String(includeDebt)}
          label={t.amount}
          name="amount"
          inputMode="numeric"
          defaultValue={v?.amount ?? String(amount + (includeDebt ? debt : 0))}
          errors={state?.errors?.amount}
          className="[&_input]:tabular-nums"
        />
        <Field label={t.date} name="transferDate" type="date" max={today} defaultValue={v?.transferDate ?? today} errors={state?.errors?.transferDate} />
      </div>
      <FileField
        label={t.file}
        name="slip"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hint={t.fileHint}
        errors={state?.errors?.slip}
        chooseLabel={tt.common.chooseFile}
      />
      <Field label={t.note} name="note" optional defaultValue={v?.note} maxLength={300} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 font-medium text-ink hover:bg-sunken"
        >
          {tt.events.cancel}
        </button>
        <SubmitButton pendingLabel={t.sending} className="flex-[2]">
          {t.submit}
        </SubmitButton>
      </div>
    </form>
  );
}
