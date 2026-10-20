"use client";

import { useActionState } from "react";
import { requestToLeadClan } from "@/app/actions/leader-requests";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SubmitButton, TextAreaField } from "@/components/ui";

/** A general user proposes a new clan and asks to lead it; staff decide. */
export function LeadClanForm() {
  const [state, action] = useActionState(requestToLeadClan, undefined);
  const l = useT().leaderRequests;
  const v = state?.values;
  const e = state?.errors;

  return (
    <form action={action} className="mt-4 space-y-4" noValidate>
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <Field label={l.fClanName} name="clanName" maxLength={150} placeholder={l.fClanNamePlaceholder} defaultValue={v?.clanName} errors={e?.clanName} required />
      <TextAreaField
        label={l.fDescription}
        name="description"
        maxLength={500}
        optional
        placeholder={l.fDescriptionPlaceholder}
        defaultValue={v?.description}
        errors={e?.description}
      />
      <TextAreaField
        label={l.fReason}
        name="reason"
        maxLength={500}
        placeholder={l.fReasonPlaceholder}
        hint={l.fReasonHint}
        defaultValue={v?.reason}
        errors={e?.reason}
        required
      />
      <SubmitButton pendingLabel={l.sending} variant="quiet" className="w-full">
        {l.send}
      </SubmitButton>
    </form>
  );
}
