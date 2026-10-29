"use client";

import { useActionState } from "react";
import { setMemberLimit } from "@/app/actions/clan";
import { useT } from "@/components/i18n-provider";
import { Notice, SubmitButton } from "@/components/ui";
import { fmt } from "@/lib/i18n/config";

/** The leader's member limit: a number, or empty for no limit. Shows how many places are used. */
export function MemberLimitForm({ limit, active }: { limit: number | null; active: number }) {
  const [state, action] = useActionState(setMemberLimit, undefined);
  const m = useT().clanMembers;
  const full = limit !== null && active >= limit;
  const pct = limit ? Math.min(100, (active / limit) * 100) : 0;

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{m.limitTitle}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">{limit === null ? fmt(m.limitNone, { n: active }) : fmt(m.limitUsed, { n: active, limit })}</p>
        </div>
        {full && <span className="rounded-full bg-warn-wash px-2.5 py-0.5 text-xs font-semibold text-warn">{m.limitFullBadge}</span>}
      </div>

      {limit !== null && (
        // Places used, on a track of the same hue; turns to the warning colour when full.
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-wash" role="img" aria-label={fmt(m.limitUsed, { n: active, limit })}>
          <div className={`h-full rounded-full ${full ? "bg-warn" : "bg-brand"}`} style={{ width: `${pct}%` }} />
        </div>
      )}

      <form action={action} className="mt-4 flex flex-wrap items-end gap-2" noValidate>
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          {m.limitLabel}
          <input
            name="limit"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            step={1}
            defaultValue={state?.values?.limit ?? (limit ?? "")}
            placeholder={m.limitPlaceholder}
            aria-invalid={Boolean(state?.errors?.limit) || undefined}
            className="h-10 w-36 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
          />
        </label>
        <SubmitButton variant="quiet" pendingLabel={m.limitSaving}>
          {m.limitSave}
        </SubmitButton>
      </form>
      <p className="mt-2 text-xs text-muted">{m.limitHint}</p>
      {state?.errors?.limit && <p className="mt-2 text-sm text-bad">{state.errors.limit[0]}</p>}
      {state?.success && (
        <div className="mt-3">
          <Notice tone="success">{state.success}</Notice>
        </div>
      )}
    </div>
  );
}
