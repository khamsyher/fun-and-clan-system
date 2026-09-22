"use client";

import { useActionState, useState } from "react";
import { changeFundSettings } from "@/app/actions/settings";
import { useT } from "@/components/i18n-provider";
import { fmt } from "@/lib/i18n/config";
import { Field, FileField, Notice, SubmitButton, TextAreaField } from "@/components/ui";

type Mode = "A" | "B";

export function FundSettingsForm({ current }: { current: { mode: Mode; amount: string; period: string; version: number } }) {
  const [state, action] = useActionState(changeFundSettings, undefined);
  const tt = useT();
  const s = tt.settings;
  const c = tt.clan;
  const v = state?.values;
  const e = state?.errors;
  // A choice only applies to the version it was made on; after a save the new setting shows.
  const [picked, setPicked] = useState<{ mode: Mode; version: number } | null>(null);
  const mode = picked?.version === current.version ? picked.mode : current.mode;
  const setMode = (m: Mode) => setPicked({ mode: m, version: current.version });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      {state?.message && <Notice tone="error">{state.message}</Notice>}

      {/* Remount after each saved version: React's post-action form reset would otherwise
          leave these inputs out of sync with the new setting. */}
      <div key={current.version} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{s.modeLabel}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["A", "B"] as const).map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer flex-col rounded-lg border p-3.5 transition-colors ${
                  mode === m ? "border-brand-bright bg-brand-wash/60 ring-1 ring-brand-bright" : "border-line-strong hover:bg-sunken"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="size-4 accent-brand"
                  />
                  <span className="text-sm font-semibold text-ink">
                    {fmt(c.mode, { m })} · {m === "A" ? c.modeAName : c.modeBName}
                  </span>
                </span>
                <span className="mt-1.5 pl-6 text-xs leading-relaxed text-ink-soft">{m === "A" ? c.modeABody : c.modeBBody}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={`grid gap-5 ${mode === "A" ? "sm:grid-cols-[minmax(0,1fr)_11rem]" : ""}`}>
          <Field
            label={s.amount}
            name="amount"
            inputMode="numeric"
            defaultValue={v?.amount ?? current.amount}
            hint={mode === "A" ? s.amountHintA : s.amountHintB}
            errors={e?.amount}
            className="[&_input]:tabular-nums"
          />
          {mode === "A" && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink">{s.periodLabel}</legend>
              <div className="flex h-12 overflow-hidden rounded-lg border border-line-strong">
                {(["monthly", "yearly"] as const).map((p) => (
                  <label key={p} className="flex flex-1 cursor-pointer items-center justify-center text-sm has-checked:bg-brand has-checked:font-semibold has-checked:text-white">
                    <input type="radio" name="period" value={p} defaultChecked={(v?.period || current.period) === p} className="sr-only" />
                    {p === "monthly" ? s.monthly : s.yearly}
                  </label>
                ))}
              </div>
              {e?.period && <p className="mt-1.5 text-sm text-bad">{e.period[0]}</p>}
            </fieldset>
          )}
        </div>
      </div>

      <Field label={s.meetingDate} name="meetingDate" type="date" max={today} defaultValue={v?.meetingDate} errors={e?.meetingDate} />

      <FileField
        label={s.minutes}
        name="minutes"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hint={s.minutesHint}
        errors={e?.minutes}
        chooseLabel={tt.common.chooseFile}
      />

      <TextAreaField label={s.note} name="note" optional placeholder={s.notePlaceholder} defaultValue={v?.note} maxLength={500} />

      <SubmitButton pendingLabel={s.pending} className="w-full">
        {s.submit}
      </SubmitButton>
    </form>
  );
}
