"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createClanType, deleteClanType, updateClanType } from "@/app/actions/admin";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SubmitButton } from "@/components/ui";
import type { FormState } from "@/lib/definitions";
import { fmt } from "@/lib/i18n/config";

export type ClanTypeItem = { id: string; name: string; description: string | null; is_active: boolean; clans: string };

export function NewClanTypeForm() {
  const [state, action] = useActionState(createClanType, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const ct = useT().clanTypes;

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      <p className="text-sm font-medium text-brand">{ct.add}</p>
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      <Field label={ct.name} name="name" maxLength={80} defaultValue={state?.values?.name} errors={state?.errors?.name} placeholder={ct.namePlaceholder} />
      <Field
        label={ct.description}
        name="description"
        optional
        maxLength={300}
        defaultValue={state?.values?.description}
        errors={state?.errors?.description}
      />
      <SubmitButton variant="quiet" pendingLabel={ct.saving} className="w-full">
        {ct.addButton}
      </SubmitButton>
    </form>
  );
}

/** One clan type: shows its name and how many clans use it; rename, retire or delete in place. */
export function ClanTypeRow({ type }: { type: ClanTypeItem }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [saveState, save] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await updateClanType(prev, formData);
    if (result?.success) setMode("view");
    return result;
  }, undefined);
  const [deleteState, remove] = useActionState(deleteClanType, undefined);
  const ct = useT().clanTypes;
  const inUse = Number(type.clans) > 0;

  const error = saveState?.message ?? saveState?.errors?.name?.[0] ?? deleteState?.message;

  return (
    <li className="px-4 py-3 text-sm">
      {mode === "edit" ? (
        <form action={save} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={type.id} />
          <input
            name="name"
            defaultValue={saveState?.values?.name ?? type.name}
            maxLength={80}
            aria-label={ct.name}
            className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2.5"
          />
          <label className="flex items-center gap-1.5 text-ink-soft">
            <input type="checkbox" name="active" value="true" defaultChecked={type.is_active} />
            {ct.active}
          </label>
          <button type="button" onClick={() => setMode("view")} className="rounded-md px-2 py-1 text-ink-soft hover:bg-sunken">
            {ct.cancel}
          </button>
          <RowSubmit label={ct.save} pending={ct.saving} />
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
              {type.name}
              {/* Same look as <Pill tone="warn">, which can't be used here: badge.tsx is server-only. */}
              {!type.is_active && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-wash px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-warn">
                  <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                  {ct.retired}
                </span>
              )}
            </p>
            <p className="text-xs text-muted">
              {fmt(ct.usedBy, { n: type.clans })}
              {type.description && <> · {type.description}</>}
            </p>
          </div>
          {mode === "delete" ? (
            <form action={remove} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={type.id} />
              <span className="text-xs text-ink-soft">{fmt(ct.deleteConfirm, { name: type.name })}</span>
              <button type="button" onClick={() => setMode("view")} className="rounded-md px-2 py-1 text-ink-soft hover:bg-sunken">
                {ct.cancel}
              </button>
              <RowSubmit label={ct.delete} pending={ct.saving} danger />
            </form>
          ) : (
            <div className="flex gap-1">
              <button type="button" onClick={() => setMode("edit")} className="rounded-md px-2.5 py-1.5 font-medium text-brand hover:bg-sunken">
                {ct.edit}
              </button>
              {/* A type in use can only be retired, so deleting isn't offered. */}
              {!inUse && (
                <button type="button" onClick={() => setMode("delete")} className="rounded-md px-2.5 py-1.5 font-medium text-ink-soft hover:bg-bad-wash hover:text-bad">
                  {ct.delete}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-bad" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function RowSubmit({ label, pending, danger }: { label: string; pending: string; danger?: boolean }) {
  const { pending: busy } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={busy}
      className={`rounded-md px-2.5 py-1 font-semibold text-white hover:opacity-90 disabled:opacity-60 ${danger ? "bg-bad" : "bg-brand"}`}
    >
      {busy ? pending : label}
    </button>
  );
}
