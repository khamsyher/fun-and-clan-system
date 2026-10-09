"use client";

import { useActionState, useState } from "react";
import { addDocument } from "@/app/actions/profile";
import { useT } from "@/components/i18n-provider";
import { Field, FileField, Notice, SelectField, SubmitButton } from "@/components/ui";
import { buttonPrimary, buttonQuiet } from "@/components/button-styles";
import { ShieldBlankIcon, UploadIcon } from "@/components/icons";
import { DOCUMENT_TYPES } from "@/lib/definitions";

/**
 * Records one identity document. Folded away until asked for, because most people add
 * one and stop — but with nothing on file the invitation is the whole point of the section.
 */
export function DocumentForm({ hasDocuments }: { hasDocuments: boolean }) {
  const [state, action] = useActionState(addDocument, undefined);
  const [open, setOpen] = useState(false);
  // Fold the form away as soon as a save comes back; the new document is in the list above it.
  // Compared by identity rather than by message, so two identical saves both close it.
  const [handled, setHandled] = useState<typeof state>(undefined);
  if (state && state !== handled) {
    setHandled(state);
    if (state.success) setOpen(false);
  }
  const tt = useT();
  const t = tt.profile;
  const e = state?.errors;
  const v = state?.values;

  if (!open) {
    return (
      <div className={hasDocuments ? "mt-4" : ""}>
        {state?.success && (
          <div className="mb-4">
            <Notice tone="success">{state.success}</Notice>
          </div>
        )}
        {hasDocuments ? (
          <button type="button" onClick={() => setOpen(true)} className={buttonQuiet}>
            <UploadIcon width={16} height={16} />
            {t.addAnother}
          </button>
        ) : (
          // Nothing on file: the empty state is the call to action, not a grey apology.
          <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-wash text-brand">
              <ShieldBlankIcon width={24} height={24} />
            </span>
            <p className="mt-4 font-medium text-ink">{t.emptyTitle}</p>
            <p className="mt-1 max-w-sm text-sm text-ink-soft">{t.emptyBody}</p>
            <button type="button" onClick={() => setOpen(true)} className={`${buttonPrimary} mt-5`}>
              <UploadIcon width={18} height={18} />
              {t.addDocument}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-5 rounded-xl border border-line bg-surface p-5 sm:p-6" noValidate>
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label={t.docType}
          name="docType"
          placeholder={t.chooseType}
          defaultValue={v?.docType}
          options={DOCUMENT_TYPES.map((d) => ({ value: d, label: t.docTypes[d] }))}
          errors={e?.docType}
          required
        />
        <Field label={t.docNumber} name="docNumber" autoComplete="off" defaultValue={v?.docNumber} errors={e?.docNumber} required />
        <Field label={t.issuedOn} name="issuedOn" type="date" optional defaultValue={v?.issuedOn} errors={e?.issuedOn} />
        <Field label={t.expiresOn} name="expiresOn" type="date" optional defaultValue={v?.expiresOn} errors={e?.expiresOn} />
      </div>
      <Field label={t.docNote} name="note" optional defaultValue={v?.note} errors={e?.note} />
      <FileField
        label={t.docFile}
        name="file"
        hint={t.docFileHint}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        chooseLabel={tt.common.chooseFile}
        errors={e?.file}
      />
      <p className="text-xs text-muted">{t.docFinal}</p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel={t.saving}>{t.saveDocument}</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-ink-soft hover:text-ink">
          {tt.reset.cancel}
        </button>
      </div>
    </form>
  );
}
