"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register } from "@/app/actions/auth";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SubmitButton } from "@/components/ui";
import { buttonPrimary } from "@/components/button-styles";
import { CheckIcon, LockIcon, PhoneIcon } from "@/components/icons";

export function RegisterForm() {
  const [state, action] = useActionState(register, undefined);
  const t = useT();
  const r = t.register;
  const v = state?.values;
  const e = state?.errors;

  // Every new account is ready at once; joining a clan comes later, from the account page.
  if (state?.success) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6 shadow-soft" role="status">
        <span className="flex size-11 items-center justify-center rounded-full bg-ok-wash text-ok">
          <CheckIcon width={22} height={22} />
        </span>
        <h2 className="mt-4 font-display text-2xl text-brand-deep">{r.readyTitle}</h2>
        <p className="mt-2 leading-relaxed text-ink-soft">{state.success}</p>
        <Link href="/login" className={`${buttonPrimary} mt-6 w-full`}>
          {r.goToSignIn}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message && <Notice tone="error">{state.message}</Notice>}

      <Field label={r.fullName} name="fullName" autoComplete="name" defaultValue={v?.fullName} errors={e?.fullName} required />

      <Field
        label={r.phone}
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="020 1234 5678"
        icon={<PhoneIcon />}
        hint={r.phoneHint}
        defaultValue={v?.phone}
        errors={e?.phone}
        required
      />

      <Field label={r.email} name="email" type="email" autoComplete="email" optional defaultValue={v?.email} errors={e?.email} />

      <Field
        label={r.password}
        name="password"
        type="password"
        autoComplete="new-password"
        icon={<LockIcon />}
        hint={r.passwordHint}
        errors={e?.password}
        required
      />
      <Field
        label={r.confirmPassword}
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        icon={<LockIcon />}
        errors={e?.confirmPassword}
        required
      />

      <SubmitButton pendingLabel={r.pending} className="w-full">
        {r.submit}
      </SubmitButton>
    </form>
  );
}
