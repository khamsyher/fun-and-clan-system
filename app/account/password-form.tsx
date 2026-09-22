"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword } from "@/app/actions/account";
import { useT } from "@/components/i18n-provider";
import { LockIcon } from "@/components/icons";
import { Field, Notice, SubmitButton } from "@/components/ui";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const tt = useT();
  const t = tt.account;
  const e = state?.errors;

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-5" noValidate>
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      <Field label={t.current} name="current" type="password" autoComplete="current-password" icon={<LockIcon />} errors={e?.current} />
      <Field
        label={t.next}
        name="next"
        type="password"
        autoComplete="new-password"
        icon={<LockIcon />}
        hint={tt.register.passwordHint}
        errors={e?.next}
      />
      <Field label={t.confirm} name="confirm" type="password" autoComplete="new-password" icon={<LockIcon />} errors={e?.confirm} />
      <SubmitButton pendingLabel={t.pending} className="w-full">
        {t.submit}
      </SubmitButton>
    </form>
  );
}
