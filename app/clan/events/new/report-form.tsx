"use client";

import { useActionState, useId } from "react";
import { reportDeath } from "@/app/actions/events";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SubmitButton, TextAreaField } from "@/components/ui";

export type PersonOption = { value: string; label: string };

export function ReportDeathForm({ people, mode }: { people: { members: PersonOption[]; family: PersonOption[] }; mode: "A" | "B" }) {
  const [state, action] = useActionState(reportDeath, undefined);
  const t = useT().events;
  const v = state?.values;
  const e = state?.errors;
  const whoId = useId();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message && <Notice tone="error">{state.message}</Notice>}

      <div>
        <label htmlFor={whoId} className="mb-1.5 block text-sm font-medium text-ink">
          {t.who}
        </label>
        <select
          id={whoId}
          name="who"
          defaultValue={v?.who ?? ""}
          aria-invalid={e?.who ? true : undefined}
          className={`h-12 w-full rounded-lg border bg-surface px-3.5 text-base text-ink outline-none focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15 ${
            e?.who ? "border-bad" : "border-line-strong"
          }`}
        >
          <option value="">{t.choosePerson}</option>
          <optgroup label={t.groupMembers}>
            {people.members.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </optgroup>
          {people.family.length > 0 && (
            <optgroup label={t.groupFamily}>
              {people.family.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {e?.who && <p className="mt-1.5 text-sm text-bad">{e.who[0]}</p>}
      </div>

      <Field label={t.dateOfDeath} name="dateOfDeath" type="date" max={today} defaultValue={v?.dateOfDeath} errors={e?.dateOfDeath} />
      <TextAreaField label={t.note} name="note" optional placeholder={t.notePlaceholder} defaultValue={v?.note} maxLength={500} />

      <SubmitButton pendingLabel={t.pending} className="w-full">
        {mode === "B" ? t.submitB : t.submitA}
      </SubmitButton>
    </form>
  );
}
