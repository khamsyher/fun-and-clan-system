"use client";

import { useActionState, useState } from "react";
import { recordDeposit, settleMemberDebt } from "@/app/actions/fund";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { fmt } from "@/lib/i18n/config";

export function DepositForm() {
  const [state, action] = useActionState(recordDeposit, undefined);
  const t = useT().fund;
  const v = state?.success ? undefined : state?.values;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      <Field label={t.depositAmount} name="amount" inputMode="numeric" defaultValue={v?.amount} errors={state?.errors?.amount} className="[&_input]:tabular-nums" />
      <Field label={t.depositNote} name="note" placeholder={t.depositNotePlaceholder} defaultValue={v?.note} errors={state?.errors?.note} />
      <SubmitButton pendingLabel={t.depositing} className="w-full">
        {t.deposit}
      </SubmitButton>
    </form>
  );
}

export function SettleDebtButton({ memberId, name, amount }: { memberId: string; name: string; amount: string }) {
  const [state, action, pending] = useActionState(settleMemberDebt, undefined);
  const [confirming, setConfirming] = useState(false);
  const t = useT();

  if (state?.success) return <p className="text-sm text-ok">{state.success}</p>;
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-sunken"
      >
        {t.fund.settle}
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="memberId" value={memberId} />
      <span className="text-sm text-ink">{fmt(t.fund.settleConfirm, { amount, name })}</span>
      <select name="method" aria-label={t.events.paidMethod} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm">
        <option value="cash">{t.events.method.cash}</option>
        <option value="transfer">{t.events.method.transfer}</option>
      </select>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-sunken">
        {t.events.cancel}
      </button>
      <button type="submit" disabled={pending} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2 disabled:opacity-60">
        {t.fund.settleYes}
      </button>
    </form>
  );
}
