"use client";

import { useActionState, useState } from "react";
import { cancelEvent, closeCollection, recordBillPayment, undoBillPayment } from "@/app/actions/events";
import { markPayoutPaid, requestPayout } from "@/app/actions/payouts";
import { useT } from "@/components/i18n-provider";
import { Field, FileField, Notice, SelectField, SubmitButton, TextAreaField } from "@/components/ui";
import { fmt } from "@/lib/i18n/config";

const formatKip = (n: number) => `${new Intl.NumberFormat("en-US").format(n)} ₭`;

/** Per-bill control: record a payment (with optional earlier debt) or undo one. */
export function BillControls({
  billId,
  status,
  carriedIn,
  viaSlip = false,
}: {
  billId: string;
  status: string;
  carriedIn: number;
  viaSlip?: boolean;
}) {
  const t = useT().events;
  const [open, setOpen] = useState(false);
  const [payState, payAction, paying] = useActionState(recordBillPayment, undefined);
  const [undoState, undoAction, undoing] = useActionState(undoBillPayment, undefined);
  const error = payState?.message ?? undoState?.message;

  if (status === "paid") {
    // Paid through an approved slip: the slip is the record, so no undo here.
    if (viaSlip) return null;
    return (
      <form action={undoAction} className="inline">
        <input type="hidden" name="billId" value={billId} />
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
      <input type="hidden" name="billId" value={billId} />
      <select name="method" aria-label={t.paidMethod} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm">
        <option value="cash">{t.method.cash}</option>
        <option value="transfer">{t.method.transfer}</option>
      </select>
      {carriedIn > 0 && (
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <input type="checkbox" name="includeDebt" defaultChecked className="size-4 accent-brand" />
          {fmt(t.includeDebt, { amount: formatKip(carriedIn) })}
        </label>
      )}
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

/** Two-step confirm for closing or cancelling an event. */
export function ConfirmEventAction({
  kind,
  eventId,
  confirmText,
}: {
  kind: "close" | "cancel";
  eventId: string;
  confirmText: string;
}) {
  const t = useT().events;
  const [state, action, pending] = useActionState(kind === "close" ? closeCollection : cancelEvent, undefined);
  const [confirming, setConfirming] = useState(false);
  const primary = kind === "close";

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={
          primary
            ? "inline-flex h-11 items-center justify-center rounded-lg bg-brand px-4 font-semibold text-white shadow-soft hover:bg-brand-2"
            : "inline-flex h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-bad hover:bg-bad-wash"
        }
      >
        {primary ? t.closeButton : t.cancelButton}
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <span className="text-sm text-ink">{confirmText}</span>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-sunken">
        {t.cancel}
      </button>
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 ${primary ? "bg-brand hover:bg-brand-2" : "bg-bad hover:opacity-90"}`}
      >
        {primary ? t.closeYes : t.cancelYes}
      </button>
      {state?.message && <p className="w-full text-sm text-bad">{state.message}</p>}
    </form>
  );
}

export function PayoutRequestForm({
  eventId,
  suggested,
  available,
  feeNote,
  defaultReceiver,
}: {
  eventId: string;
  suggested: number | null;
  available: number;
  feeNote: string | null;
  defaultReceiver: string;
}) {
  const t = useT().events;
  const [state, action] = useActionState(requestPayout, undefined);
  const v = state?.values;
  const e = state?.errors;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="eventId" value={eventId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <Field
        label={t.payoutAmount}
        name="amount"
        inputMode="numeric"
        defaultValue={v?.amount ?? (suggested === null ? "" : String(suggested))}
        hint={fmt(t.available, { amount: formatKip(Math.max(0, available)) })}
        errors={e?.amount}
        className="[&_input]:tabular-nums"
      />
      {feeNote && <p className="-mt-2 text-sm text-muted">{feeNote}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.receiverName} name="receiverName" defaultValue={v?.receiverName ?? defaultReceiver} errors={e?.receiverName} />
        <Field label={t.receiverPhone} name="receiverPhone" type="tel" inputMode="tel" optional defaultValue={v?.receiverPhone} />
      </div>
      <TextAreaField label={t.payoutNote} name="note" optional defaultValue={v?.note} maxLength={500} />
      <SubmitButton pendingLabel={t.requesting} className="w-full">
        {t.requestPayout}
      </SubmitButton>
    </form>
  );
}

export function MarkPaidForm({ payoutId }: { payoutId: string }) {
  const tt = useT();
  const t = tt.events;
  const [state, action] = useActionState(markPayoutPaid, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="payoutId" value={payoutId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <SelectField
        label={t.paidMethod}
        name="method"
        options={[
          { value: "cash", label: t.method.cash },
          { value: "transfer", label: t.method.transfer },
        ]}
      />
      <FileField
        label={t.proof}
        name="proof"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hint={t.proofHint}
        errors={state?.errors?.proof}
        chooseLabel={tt.common.chooseFile}
      />
      <SubmitButton pendingLabel={t.marking} className="w-full">
        {t.markPaid}
      </SubmitButton>
    </form>
  );
}
