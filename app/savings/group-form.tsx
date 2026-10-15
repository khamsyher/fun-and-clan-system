"use client";

import { useActionState } from "react";
import { createGroup, updateGroup } from "@/app/actions/savings";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SelectField, SubmitButton, TextAreaField } from "@/components/ui";
import { ReceivingFields } from "./receiving-fields";

export type GroupInitial = {
  id: string;
  name: string;
  description: string;
  amount: string;
  period: "weekly" | "monthly";
  startDate: string;
};

/** Used for "Start a group" and for editing one while it is still forming. */
export function GroupForm({ initial }: { initial?: GroupInitial }) {
  const [state, action] = useActionState(initial ? updateGroup : createGroup, undefined);
  const s = useT().savings;
  const v = state?.values;
  const e = state?.errors;
  const today = new Date().toISOString().slice(0, 10);
  const val = (key: keyof GroupInitial) => v?.[key] ?? (initial ? String(initial[key]) : undefined);

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

      {!initial && <ReceivingFields values={v} errors={e} />}

      <SubmitButton pendingLabel={initial ? s.saving : s.creating} className="w-full">
        {initial ? s.save : s.submitCreate}
      </SubmitButton>
    </form>
  );
}
