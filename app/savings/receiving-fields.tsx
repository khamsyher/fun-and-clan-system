"use client";

import { useT } from "@/components/i18n-provider";
import { Field, FileField } from "@/components/ui";

export type ReceivingValues = { bankName?: string; accountName?: string; accountNumber?: string };

/** Where a member receives their pot: an account, a QR photo, or both. Used when creating, joining and editing. */
export function ReceivingFields({
  values,
  errors,
  hasQr,
}: {
  values?: ReceivingValues;
  errors?: Record<string, string[] | undefined>;
  hasQr?: boolean;
}) {
  const tt = useT();
  const s = tt.savings;
  return (
    <fieldset className="rounded-lg border border-line bg-paper/60 p-4">
      <legend className="px-1 text-sm font-semibold text-brand">{s.receivingTitle}</legend>
      <p className="mb-4 text-sm text-ink-soft">{s.receivingHint}</p>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={s.fBank} name="bankName" optional defaultValue={values?.bankName} placeholder="BCEL" />
          <Field label={s.fAccountName} name="accountName" optional defaultValue={values?.accountName} />
        </div>
        <Field
          label={s.fAccountNumber}
          name="accountNumber"
          optional
          inputMode="numeric"
          defaultValue={values?.accountNumber}
          errors={errors?.accountNumber}
          className="[&_input]:tabular-nums"
        />
        <FileField
          label={s.fQr}
          name="qr"
          accept="image/jpeg,image/png,image/webp"
          hint={hasQr ? s.keepQr : s.fQrHint}
          errors={errors?.qr}
          chooseLabel={tt.common.chooseFile}
        />
      </div>
    </fieldset>
  );
}
