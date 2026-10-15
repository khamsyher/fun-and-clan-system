"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { removeDependent, saveDependent } from "@/app/actions/family";
import { useT } from "@/components/i18n-provider";
import { buttonQuiet } from "@/components/button-styles";
import { UserPlusIcon, UsersIcon } from "@/components/icons";
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

/**
 * The household, on the page where someone keeps everything else about themself.
 * Like the documents below it, the form is folded away until asked for: most people add
 * their family once and afterwards only read it.
 */
export function FamilyManager({ dependents }: { dependents: DependentView[] }) {
  const t = useT().family;
  const [editing, setEditing] = useState<DependentView | null>(null);
  const [adding, setAdding] = useState(false);
  const [removeState, removeAction] = useActionState(removeDependent, undefined);
  const [flash, setFlash] = useState<string | null>(null);
  const shown = flash ?? removeState?.success;
  const open = adding || editing !== null;

  const close = (message?: string) => {
    if (message) setFlash(message);
    setAdding(false);
    setEditing(null);
  };

  return (
    <div>
      {shown && (
        <div className="mb-4">
          <Notice tone="success">{shown}</Notice>
        </div>
      )}

      {dependents.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {dependents.map((d) => (
            <DependentRow
              key={d.id}
              dependent={d}
              isEditing={editing?.id === d.id}
              onEdit={() => {
                setFlash(null);
                setAdding(false);
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

      {open ? (
        <div className="mt-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
          <h3 className="font-medium text-ink">{editing ? fmt(t.editTitle, { name: editing.fullName }) : t.addTitle}</h3>
          <div className="mt-5">
            {/* Remount on switch so the fields reload the chosen person. */}
            <DependentForm key={editing?.id ?? "new"} editing={editing} onDone={close} />
          </div>
        </div>
      ) : dependents.length === 0 ? (
        // Nobody on file: the empty state carries the invitation instead of apologising for itself.
        <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-wash text-brand">
            <UsersIcon width={24} height={24} />
          </span>
          <p className="mt-4 font-medium text-ink">{t.empty}</p>
          <p className="mt-1 max-w-sm text-sm text-ink-soft">{t.emptyBody}</p>
          <button type="button" onClick={() => setAdding(true)} className={`${buttonQuiet} mt-5`}>
            <UserPlusIcon width={16} height={16} />
            {t.add}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${buttonQuiet} mt-4`}>
          <UserPlusIcon width={16} height={16} />
          {t.addAnother}
        </button>
      )}
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
  const tt = useT();
  const t = tt.family;
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
    // The saved person is in the list above, so the form folds away either way.
    onDone(state.success);
  }, [state, onDone]);

  return (
    <form ref={formRef} action={action} className="space-y-5" noValidate>
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t.fullName} name="fullName" autoComplete="off" defaultValue={v?.fullName ?? editing?.fullName} errors={e?.fullName} />
        <SelectField
          label={t.relationship}
          name="relationship"
          placeholder={t.choose}
          defaultValue={v?.relationship ?? editing?.relationship ?? ""}
          options={RELATIONSHIPS.map((r) => ({ value: r, label: t.rel[r] }))}
          errors={e?.relationship}
        />
      </div>
      <Field label={t.dob} name="dob" type="date" max={today} optional defaultValue={v?.dob ?? editing?.dob} errors={e?.dob} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel={editing ? t.saving : t.adding}>{editing ? t.save : t.add}</SubmitButton>
        <button type="button" onClick={() => onDone()} className="text-sm font-medium text-ink-soft hover:text-ink">
          {tt.reset.cancel}
        </button>
      </div>
    </form>
  );
}
