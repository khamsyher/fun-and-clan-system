"use client";

import { useActionState, useState } from "react";
import { donate, reviewDonation, setRequestOpen } from "@/app/actions/donations";
import { useT } from "@/components/i18n-provider";
import { HeartIcon } from "@/components/icons";
import { Field, FileField, Notice, SubmitButton, TextAreaField } from "@/components/ui";

/** "I have donated" — the donor records the transfer they already made. */
export function DonateForm({ requestId }: { requestId: string }) {
  const tt = useT();
  const t = tt.donations;
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(donate, undefined);
  const v = state?.values;
  const e = state?.errors;
  const today = new Date().toISOString().slice(0, 10);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white shadow-soft hover:bg-brand-2"
      >
        <HeartIcon width={18} height={18} />
        {t.give}
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <h3 className="font-semibold text-ink">{t.giveTitle}</h3>
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.fAmount} name="amount" inputMode="numeric" defaultValue={v?.amount} errors={e?.amount} className="[&_input]:tabular-nums" />
        <Field label={t.fDate} name="transferDate" type="date" max={today} defaultValue={v?.transferDate ?? today} errors={e?.transferDate} />
      </div>
      <FileField
        label={t.fSlip}
        name="slip"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hint={t.fSlipHint}
        errors={e?.slip}
        chooseLabel={tt.common.chooseFile}
      />
      <TextAreaField label={t.fMessage} name="message" optional defaultValue={v?.message} maxLength={500} />
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="anonymous" className="size-4 accent-brand" />
        {t.fAnonymous}
      </label>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 font-medium text-ink hover:bg-sunken"
        >
          {tt.events.cancel}
        </button>
        <SubmitButton pendingLabel={t.sending} className="flex-[2]">
          {t.send}
        </SubmitButton>
      </div>
    </form>
  );
}

/** The asker confirms a donation arrived, or rejects it with a reason. */
export function ReviewDonationForm({ donationId }: { donationId: string }) {
  const [state, action, pending] = useActionState(reviewDonation, undefined);
  const t = useT().donations;

  if (state?.success) return <Notice tone="success">{state.success}</Notice>;

  return (
    <form action={action} className="mt-3 space-y-3" noValidate>
      <input type="hidden" name="donationId" value={donationId} />
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
          value="confirm"
          disabled={pending}
          className="inline-flex h-11 flex-[2] items-center justify-center rounded-lg bg-brand px-4 font-semibold text-white shadow-soft hover:bg-brand-2 disabled:opacity-60"
        >
          {t.confirm}
        </button>
      </div>
    </form>
  );
}

/** Close (or reopen) your own request. */
export function CloseRequestButton({ requestId, isOpen }: { requestId: string; isOpen: boolean }) {
  const tt = useT();
  const t = tt.donations;
  const [confirming, setConfirming] = useState(false);

  if (!isOpen) {
    return (
      <form action={setRequestOpen}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="open" value="true" />
        <button type="submit" className="inline-flex h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-sunken">
          {t.reopen}
        </button>
      </form>
    );
  }
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-sunken"
      >
        {t.closeButton}
      </button>
    );
  }
  return (
    <form action={setRequestOpen} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="open" value="false" />
      <span className="text-sm text-ink">{t.closeConfirm}</span>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-sunken">
        {tt.events.cancel}
      </button>
      <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2">
        {t.closeYes}
      </button>
    </form>
  );
}
