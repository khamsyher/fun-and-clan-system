"use client";

import { useActionState } from "react";
import { createGroup, updateGroup } from "@/app/actions/savings";
import { useT } from "@/components/i18n-provider";
import { Field, FileField, Notice, SelectField, SubmitButton, TextAreaField } from "@/components/ui";
import { ReceivingFields } from "./receiving-fields";

export type GroupInitial = {
  id: string;
  name: string;
  description: string;
  amount: string;
  period: "weekly" | "monthly";
  startDate: string;
  rules: string;
  rulesFileId: string | null;
};

/** Used for "Start a group" and for editing one while it is still forming. */
export function GroupForm({ initial }: { initial?: GroupInitial }) {
  const [state, action] = useActionState(initial ? updateGroup : createGroup, undefined);
  const s = useT().savings;
  const v = state?.values;
  const e = state?.errors;
  const today = new Date().toISOString().slice(0, 10);
  const val = (key: Exclude<keyof GroupInitial, "rulesFileId">) => v?.[key] ?? (initial ? String(initial[key]) : undefined);
  const tt = useT();

  return (
    <form action={action} className="space-y-5" noValidate>
      {initial && <input type="hidden" name="groupId" value={initial.id} />}
      {state?.message && <Notice tone="error">{state.message}</Notice>}

      <Field label={s.fName} name="name" placeholder={s.fNamePlaceholder} defaultValue={val("name")} errors={e?.name} maxLength={100} />
      <TextAreaField label={s.fDescription} name="description" optional defaultValue={val("description")} maxLength={1000} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={s.fAmount} name="amount" inputMode="numeric" defaultValue={val("amount")} errors={e?.amount} className="[&_input]:tabular-nums" />
        <SelectField
          label={s.fPeriod}
          name="period"
          defaultValue={val("period") ?? "monthly"}
          errors={e?.period}
          options={[
            { value: "monthly", label: s.periodLabel.monthly },
            { value: "weekly", label: s.periodLabel.weekly },
          ]}
        />
      </div>
      <Field label={s.fStartDate} name="startDate" type="date" min={today} hint={s.fStartDateHint} defaultValue={val("startDate")} errors={e?.startDate} />

      {/* The group's own rules, shown to people before they ask to join. */}
      <fieldset className="space-y-4 rounded-lg border border-line bg-paper/60 p-4">
        <legend className="px-1 text-sm font-semibold text-brand">{s.rulesTitle}</legend>
        <TextAreaField
          label={s.fRules}
          name="rules"
          optional
          rows={6}
          placeholder={s.fRulesPlaceholder}
          defaultValue={val("rules")}
          errors={e?.rules}
          maxLength={4000}
        />
        <FileField
          label={s.fRulesFile}
          name="rulesFile"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          hint={initial?.rulesFileId ? s.keepRulesFile : s.fRulesFileHint}
          errors={e?.rulesFile}
          chooseLabel={tt.common.chooseFile}
        />
        {initial?.rulesFileId && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3 text-sm">
            <a href={`/files/${initial.rulesFileId}`} target="_blank" rel="noreferrer" className="font-medium text-brand hover:text-brand-bright">
              {s.currentRulesFile}
            </a>
            <label className="flex items-center gap-2 text-ink-soft">
              <input type="checkbox" name="removeRulesFile" className="size-4 accent-brand" />
              {s.removeRulesFile}
            </label>
          </div>
        )}
      </fieldset>

      {!initial && <ReceivingFields values={v} errors={e} />}

      <SubmitButton pendingLabel={initial ? s.saving : s.creating} className="w-full">
        {initial ? s.save : s.submitCreate}
      </SubmitButton>
    </form>
  );
}
