"use client";

import { useActionState, useEffect, useRef } from "react";
import { createClan, updatePlatformFee } from "@/app/actions/admin";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { PercentIcon } from "@/components/icons";

export function CreateClanForm() {
  const [state, action] = useActionState(createClan, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const a = useT().admin;
  const v = state?.values;
  const e = state?.errors;

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <Field label={a.clanName} name="name" defaultValue={v?.name} errors={e?.name} placeholder="Vang Clan — Vientiane" />
      <Field
        label={a.clanCode}
        name="code"
        autoCapitalize="characters"
        defaultValue={v?.code}
        errors={e?.code}
        hint={a.clanCodeHint}
        placeholder="VANG01"
        className="[&_input]:uppercase"
      />
      <p className="pt-2 text-sm font-medium text-brand">{a.leaderAccount}</p>
      <Field label={a.leaderName} name="leaderName" defaultValue={v?.leaderName} errors={e?.leaderName} />
      <Field label={a.leaderPhone} name="leaderPhone" type="tel" inputMode="tel" defaultValue={v?.leaderPhone} errors={e?.leaderPhone} />
      <Field
        label={a.tempPassword}
        name="leaderPassword"
        type="password"
        autoComplete="new-password"
        errors={e?.leaderPassword}
        hint={a.tempPasswordHint}
      />
      <SubmitButton pendingLabel={a.creating} className="w-full">
        {a.createClan}
      </SubmitButton>
    </form>
  );
}

export function PlatformFeeForm({ current }: { current: string }) {
  const [state, action] = useActionState(updatePlatformFee, undefined);
  const a = useT().admin;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      <Field
        label={a.feeLabel}
        name="fee"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        max="100"
        icon={<PercentIcon width={18} height={18} />}
        defaultValue={state?.values?.fee ?? Number(current)}
        errors={state?.errors?.fee}
        hint={a.feeHint}
      />
      <SubmitButton variant="quiet" pendingLabel={a.saving} className="w-full">
        {a.saveFee}
      </SubmitButton>
    </form>
  );
}
