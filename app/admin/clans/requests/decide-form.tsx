"use client";

import { useActionState, useState } from "react";
import { decideLeaderRequest } from "@/app/actions/leader-requests";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SelectField, SubmitButton, TextAreaField } from "@/components/ui";
import type { ClanTypeOption } from "../../forms";

/**
 * Approve (choose the clan's code, and optionally its type) or decline (with a reason the
 * person will read). Both ask for what they need before they can be sent.
 */
export function DecideLeaderRequest({ requestId, types }: { requestId: string; types: ClanTypeOption[] }) {
  const [state, action] = useActionState(decideLeaderRequest, undefined);
  const [mode, setMode] = useState<"approve" | "decline" | null>(null);
  const t = useT();
  const l = t.leaderRequests;
  const v = state?.values;
  const e = state?.errors;
  const active = types.filter((x) => x.is_active);

  if (state?.success) return <Notice tone="success">{state.success}</Notice>;

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("approve")}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2"
        >
          {l.approve}
        </button>
        <button
          type="button"
          onClick={() => setMode("decline")}
          className="rounded-lg px-4 py-2 text-sm font-medium text-ink-soft hover:bg-bad-wash hover:text-bad"
        >
          {l.decline}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-line bg-paper/60 p-4" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="decision" value={mode} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}

      {mode === "approve" ? (
        <>
          <Field
            label={t.admin.clanCode}
            name="code"
            autoCapitalize="characters"
            placeholder="VANG02"
            hint={l.codeHint}
            defaultValue={v?.code}
            errors={e?.code}
            className="[&_input]:uppercase"
          />
          {active.length > 0 && (
            <SelectField
              label={t.clanTypes.clanType}
              name="clanTypeId"
              optional
              placeholder={t.clanTypes.none}
              options={active.map((x) => ({ value: x.id, label: x.name }))}
              defaultValue={v?.clanTypeId ?? ""}
              errors={e?.clanTypeId}
            />
          )}
        </>
      ) : (
        <TextAreaField label={l.noteLabel} name="note" maxLength={300} hint={l.noteHint} defaultValue={v?.note} errors={e?.note} />
      )}

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel={t.users.working} variant={mode === "approve" ? "primary" : "quiet"}>
          {mode === "approve" ? l.approveYes : l.declineYes}
        </SubmitButton>
        <button type="button" onClick={() => setMode(null)} className="rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-sunken">
          {t.users.cancel}
        </button>
      </div>
    </form>
  );
}
