"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { removeDependent, saveDependent } from "@/app/actions/family";
import { useT } from "@/components/i18n-provider";
import { UsersIcon } from "@/components/icons";
import { Field, Notice, SelectField, SubmitButton } from "@/components/ui";
import { fmt } from "@/lib/i18n/config";
import { RELATIONSHIPS, type Relationship } from "@/lib/definitions";

export type DependentView = {
  id: string;
  fullName: string;
  relationship: Relationship;
  dob: string;
  dobLabel: string | null;
};

export function FamilyManager({ dependents }: { dependents: DependentView[] }) {
  const t = useT().family;
  const [editing, setEditing] = useState<DependentView | null>(null);
  const [removeState, removeAction] = useActionState(removeDependent, undefined);
  const [flash, setFlash] = useState<string | null>(null);
  const shown = flash ?? removeState?.success;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink">{t.title}</h2>
          <span className="text-sm text-muted">{fmt(t.count, { n: dependents.length })}</span>
        </div>
        {shown && (
          <div className="mb-4">
            <Notice tone="success">{shown}</Notice>
          </div>
        )}
        {dependents.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface px-5 py-12 text-center">
            <UsersIcon className="text-brand-bright" width={28} height={28} />
            <p className="mt-3 font-medium text-ink">{t.empty}</p>
            <p className="mt-1 max-w-xs text-sm text-ink-soft">{t.emptyBody}</p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {dependents.map((d) => (
              <DependentRow
                key={d.id}
                dependent={d}
                isEditing={editing?.id === d.id}
                onEdit={() => {
                  setFlash(null);
                  setEditing(d);
                }}
                removeAction={(fd) => {
                  setFlash(null);
                  removeAction(fd);
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="h-fit rounded-xl border border-line bg-surface p-5 sm:p-6 lg:sticky lg:top-32">
        <h2 className="text-lg font-semibold text-ink">{editing ? fmt(t.editTitle, { name: editing.fullName }) : t.addTitle}</h2>
        <div className="mt-5">
          {/* Remount on switch so the fields reload the chosen person. */}
          <DependentForm
            key={editing?.id ?? "new"}
            editing={editing}
            onDone={(message) => {
              if (message) setFlash(message);
              setEditing(null);
            }}
          />
        </div>
      </section>
    </div>
  );
}

function DependentRow({
  dependent: d,
  isEditing,
  onEdit,
  removeAction,
}: {
  dependent: DependentView;
  isEditing: boolean;
  onEdit: () => void;
  removeAction: (formData: FormData) => void;
}) {
  const t = useT().family;
  const [confirming, setConfirming] = useState(false);

  return (
    <li className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${isEditing ? "bg-brand-wash/50" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-wash text-sm font-semibold text-brand" aria-hidden="true">
          {d.fullName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{d.fullName}</p>
          <p className="text-sm text-ink-soft">
            {t.rel[d.relationship]}
            {d.dobLabel && <> · {fmt(t.bornOn, { date: d.dobLabel })}</>}
          </p>
        </div>
      </div>
      {confirming ? (
        <form action={removeAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={d.id} />
          <span className="text-sm text-ink-soft">{fmt(t.removeConfirm, { name: d.fullName })}</span>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-sunken">
            {t.cancel}
          </button>
          <button type="submit" className="rounded-md bg-bad px-2.5 py-1.5 text-sm font-semibold text-white hover:opacity-90">
            {t.removeYes}
          </button>
        </form>
      ) : (
        <div className="flex gap-1">
          <button type="button" onClick={onEdit} className="rounded-md px-2.5 py-1.5 text-sm font-medium text-brand hover:bg-brand-wash">
            {t.edit}
          </button>
          <button type="button" onClick={() => setConfirming(true)} className="rounded-md px-2.5 py-1.5 text-sm font-medium text-bad hover:bg-bad-wash">
            {t.remove}
          </button>
        </div>
      )}
    </li>
  );
}

function DependentForm({ editing, onDone }: { editing: DependentView | null; onDone: (message?: string) => void }) {
  const [state, action] = useActionState(saveDependent, undefined);
  const t = useT().family;
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<unknown>(null);
  const v = state?.values;
  const e = state?.errors;
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    // Act once per successful save, not on every re-render.
    if (!state?.success || handled.current === state) return;
    handled.current = state;
    formRef.current?.reset();
    if (editing) onDone(state.success);
  }, [state, editing, onDone]);

  return (
    <form ref={formRef} action={action} className="space-y-5" noValidate>
      {state?.success && !editing && <Notice tone="success">{state.success}</Notice>}
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <Field label={t.fullName} name="fullName" autoComplete="off" defaultValue={v?.fullName ?? editing?.fullName} errors={e?.fullName} />
      <SelectField
        label={t.relationship}
        name="relationship"
        placeholder={t.choose}
        defaultValue={v?.relationship ?? editing?.relationship ?? ""}
        options={RELATIONSHIPS.map((r) => ({ value: r, label: t.rel[r] }))}
        errors={e?.relationship}
      />
      <Field label={t.dob} name="dob" type="date" max={today} optional defaultValue={v?.dob ?? editing?.dob} errors={e?.dob} />
      <div className="flex gap-3">
        {editing && (
          <button
            type="button"
            onClick={() => onDone()}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 font-medium text-ink hover:bg-sunken"
          >
            {t.cancel}
          </button>
        )}
        <SubmitButton pendingLabel={editing ? t.saving : t.adding} className="flex-[2]">
          {editing ? t.save : t.add}
        </SubmitButton>
      </div>
    </form>
  );
}
