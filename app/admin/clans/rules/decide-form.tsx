"use client";

import { useActionState, useState } from "react";
import { decidePolicy } from "@/app/actions/policies";
import { useT } from "@/components/i18n-provider";
import { Notice, SubmitButton, TextAreaField } from "@/components/ui";

/** Approve straight away, or decline with a reason the leader reads. */
export function DecidePolicy({ policyId }: { policyId: string }) {
  const [state, action] = useActionState(decidePolicy, undefined);
  const [declining, setDeclining] = useState(false);
  const t = useT();
  const p = t.policy;


  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="policyId" value={policyId} />
      <input type="hidden" name="decision" value={declining ? "decline" : "approve"} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      {declining && (
        <TextAreaField
          label={p.noteLabel}
          name="note"
          maxLength={300}
          hint={p.noteHint}
          defaultValue={state?.values?.note}
          errors={state?.errors?.note}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel={t.users.working} variant={declining ? "quiet" : "primary"}>
          {declining ? p.declineYes : p.approve}
        </SubmitButton>
        {declining ? (
          <button type="button" onClick={() => setDeclining(false)} className="rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-sunken">
            {t.users.cancel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setDeclining(true)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-soft hover:bg-bad-wash hover:text-bad"
          >
            {p.decline}
          </button>
        )}
      </div>
    </form>
  );
}
