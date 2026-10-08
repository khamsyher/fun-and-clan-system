"use client";

import { useActionState } from "react";
import { requestJoinClan } from "@/app/actions/membership";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SubmitButton } from "@/components/ui";

/** A general user sends their clan code to that clan's leader. */
export function JoinClanForm() {
  const [state, action] = useActionState(requestJoinClan, undefined);
  const t = useT();
  const a = t.account;

  return (
    <form action={action} className="mt-4 space-y-4" noValidate>
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      <Field
        label={t.register.clanCode}
        name="clanCode"
        placeholder="VANG01"
        autoComplete="off"
        autoCapitalize="characters"
        hint={a.joinHint}
        defaultValue={state?.values?.clanCode}
        errors={state?.errors?.clanCode}
        className="[&_input]:uppercase [&_input]:tracking-[0.08em]"
        required
      />
      <SubmitButton pendingLabel={a.joinPending} className="w-full">
        {a.joinSubmit}
      </SubmitButton>
    </form>
  );
}
