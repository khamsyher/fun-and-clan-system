"use client";

import { useActionState, useState } from "react";
import { submitPolicy } from "@/app/actions/policies";
import { useT } from "@/components/i18n-provider";
import { Notice, SubmitButton, TextAreaField } from "@/components/ui";

const MAX = 5000;

/** The leader's rules box: starts from the version waiting (or the current one) and sends it for approval. */
export function PolicyForm({ initial }: { initial: string }) {
  const t = useT().policy;
  const [state, action] = useActionState(submitPolicy, undefined);
  const start = state?.values?.body ?? initial;
  // Only the length is tracked: the box itself is left to the browser, so anything typed
  // before the page has finished loading on a slow phone is kept rather than overwritten.
  const [length, setLength] = useState(start.length);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <TextAreaField
        label={t.bodyLabel}
        name="body"
        rows={12}
        maxLength={MAX}
        placeholder={t.bodyPlaceholder}
        hint={t.bodyHint}
        defaultValue={start}
        onChange={(e) => setLength(e.target.value.length)}
        errors={state?.errors?.body}
        className="[&_textarea]:min-h-64 [&_textarea]:leading-relaxed"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="tabular text-xs text-muted">
          {length.toLocaleString("en-US")} / {MAX.toLocaleString("en-US")}
        </span>
        <SubmitButton pendingLabel={t.sending}>{t.send}</SubmitButton>
      </div>
    </form>
  );
}
