"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { LockIcon, PhoneIcon } from "@/components/icons";

export function LoginForm() {
  const [state, action] = useActionState(login, undefined);
  const t = useT();

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <Field
        label={t.login.phone}
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="020 1234 5678"
        icon={<PhoneIcon />}
        defaultValue={state?.values?.phone}
        errors={state?.errors?.phone}
        required
      />
      <Field
        label={t.login.password}
        name="password"
        type="password"
        autoComplete="current-password"
        icon={<LockIcon />}
        errors={state?.errors?.password}
        required
      />
      <SubmitButton pendingLabel={t.login.pending} className="w-full">
        {t.login.submit}
      </SubmitButton>
    </form>
  );
}
