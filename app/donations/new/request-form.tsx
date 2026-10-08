"use client";

import { useActionState } from "react";
import { createRequest, updateRequest } from "@/app/actions/donations";
import { useT } from "@/components/i18n-provider";
import { Field, FileField, Notice, SubmitButton, TextAreaField } from "@/components/ui";

export type RequestInitial = {
  id: string;
  title: string;
  story: string;
  target: string;
  deadline: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  photoFileId: string | null;
  qrFileId: string | null;
};

/** Used for both "Ask for help" and editing an existing request. */
export function RequestForm({ initial }: { initial?: RequestInitial }) {
  const [state, action] = useActionState(initial ? updateRequest : createRequest, undefined);
  const tt = useT();
  const t = tt.donations;
  const v = state?.values;
  const e = state?.errors;
  const today = new Date().toISOString().slice(0, 10);
  const val = (key: keyof RequestInitial) => v?.[key as string] ?? (initial ? String(initial[key] ?? "") : undefined);

  return (
    <form action={action} className="space-y-5" noValidate>
      {initial && <input type="hidden" name="requestId" value={initial.id} />}
      {state?.message && <Notice tone="error">{state.message}</Notice>}

      <Field label={t.fTitle} name="title" placeholder={t.fTitlePlaceholder} defaultValue={val("title")} errors={e?.title} maxLength={150} />
      <TextAreaField label={t.fStory} name="story" placeholder={t.fStoryPlaceholder} defaultValue={val("story")} errors={e?.story} maxLength={4000} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t.fTarget}
          name="target"
          inputMode="numeric"
          optional
          hint={t.fTargetHint}
          defaultValue={val("target")}
          errors={e?.target}
          className="[&_input]:tabular-nums"
        />
        <Field
          label={t.fDeadline}
          name="deadline"
          type="date"
          min={today}
          optional
          hint={t.fDeadlineHint}
          defaultValue={val("deadline")}
          errors={e?.deadline}
        />
      </div>

      <FileField
        label={t.fPhoto}
        name="photo"
        accept="image/jpeg,image/png,image/webp"
        hint={initial?.photoFileId ? t.keepFile : t.fPhotoHint}
        errors={e?.photo}
        chooseLabel={tt.common.chooseFile}
      />
      {initial?.photoFileId && <CurrentFile id={initial.photoFileId} label={t.currentPhoto} removeName="removePhoto" removeLabel={t.removePhoto} />}

      <fieldset className="rounded-lg border border-line bg-paper/60 p-4">
        <legend className="px-1 text-sm font-semibold text-brand">{t.payment}</legend>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.fBank} name="bankName" optional defaultValue={val("bankName")} placeholder="BCEL" />
            <Field label={t.fAccountName} name="accountName" optional defaultValue={val("accountName")} />
          </div>
          <Field
            label={t.fAccountNumber}
            name="accountNumber"
            optional
            inputMode="numeric"
            defaultValue={val("accountNumber")}
            errors={e?.accountNumber}
            className="[&_input]:tabular-nums"
          />
          <FileField
            label={t.fQr}
            name="qr"
            accept="image/jpeg,image/png,image/webp"
            hint={initial?.qrFileId ? t.keepFile : t.fQrHint}
            errors={e?.qr}
            chooseLabel={tt.common.chooseFile}
          />
          {initial?.qrFileId && <CurrentFile id={initial.qrFileId} label={t.currentQr} removeName="removeQr" removeLabel={t.removeQr} />}
        </div>
      </fieldset>

      <SubmitButton pendingLabel={initial ? t.saving : t.submitting} className="w-full">
        {initial ? t.save : t.submit}
      </SubmitButton>
    </form>
  );
}

function CurrentFile({ id, label, removeName, removeLabel }: { id: string; label: string; removeName: string; removeLabel: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-line bg-surface p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked upload */}
      <img src={`/files/${id}`} alt={label} className="size-16 rounded-md border border-line object-cover" />
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <label className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" name={removeName} className="size-4 accent-brand" />
          {removeLabel}
        </label>
      </div>
    </div>
  );
}
