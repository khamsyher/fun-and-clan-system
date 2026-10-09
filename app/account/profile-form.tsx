"use client";

import { useActionState, useState } from "react";
import { updateProfile } from "@/app/actions/profile";
import { useT } from "@/components/i18n-provider";
import { Field, FileField, Notice, SelectField, SubmitButton } from "@/components/ui";
import { PhoneIcon } from "@/components/icons";
import { GENDERS } from "@/lib/definitions";

type Current = {
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  email: string | null;
  whatsapp: string | null;
  facebook: string | null;
  tiktok: string | null;
  village: string | null;
  district: string | null;
  province: string | null;
  phone: string;
  has_photo: boolean;
};

/** Someone's own details. Nothing here is required; the phone number is shown but not editable. */
export function ProfileForm({
  current,
  onSaved,
  onCancel,
}: {
  current: Current;
  /** Called once with the confirmation, so the page can go back to reading. */
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [state, action] = useActionState(updateProfile, undefined);
  // Hand the result up once, compared by identity so two identical saves both count.
  const [handled, setHandled] = useState<typeof state>(undefined);
  if (state && state !== handled) {
    setHandled(state);
    if (state.success) onSaved(state.success);
  }
  const tt = useT();
  const t = tt.profile;
  const e = state?.errors;
  // After a successful save the server sends the new values, so the form shows those.
  const v = (key: keyof Current) => state?.values?.[key as string] ?? (current[key] as string | null) ?? "";

  return (
    <form action={action} className="space-y-6" noValidate>
      {state?.message && <Notice tone="error">{state.message}</Notice>}

      <fieldset className="space-y-5">
        <legend className="font-display text-lg text-brand-deep">{t.personal}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t.firstName} name="firstName" autoComplete="given-name" optional defaultValue={v("first_name")} errors={e?.firstName} />
          <Field label={t.lastName} name="lastName" autoComplete="family-name" optional defaultValue={v("last_name")} errors={e?.lastName} />
          <Field
            label={t.dateOfBirth}
            name="dateOfBirth"
            type="date"
            hint={t.dateOfBirthHint}
            optional
            defaultValue={v("date_of_birth")}
            errors={e?.dateOfBirth}
          />
          <SelectField
            // Keyed on the saved value: React resets the form after a successful action, and an
            // uncontrolled select would fall back to its placeholder instead of what was saved.
            key={`gender-${v("gender")}`}
            label={t.gender}
            name="gender"
            optional
            placeholder={t.notSaid}
            defaultValue={v("gender")}
            options={GENDERS.map((g) => ({ value: g, label: t.genders[g] }))}
            errors={e?.gender}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={t.village} name="village" optional defaultValue={v("village")} errors={e?.village} />
          <Field label={t.district} name="district" optional defaultValue={v("district")} errors={e?.district} />
          <Field label={t.province} name="province" optional defaultValue={v("province")} errors={e?.province} />
        </div>
        <FileField
          label={t.photo}
          name="photo"
          hint={t.photoHint}
          accept="image/jpeg,image/png,image/webp"
          chooseLabel={tt.common.chooseFile}
          errors={e?.photo}
        />
        {current.has_photo && (
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="removePhoto" className="size-4 rounded border-line-strong" />
            {t.removePhoto}
          </label>
        )}
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-6">
        <legend className="font-display text-lg text-brand-deep">{t.contact}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">{t.phone}</p>
            <p className="tabular flex h-12 items-center rounded-lg border border-line bg-sunken px-3.5 text-base text-ink-soft">
              {current.phone}
            </p>
            <p className="mt-1.5 text-sm text-muted">{t.phoneNote}</p>
          </div>
          <Field label={t.email} name="email" type="email" autoComplete="email" optional defaultValue={v("email")} errors={e?.email} />
          <Field
            label={t.whatsapp}
            name="whatsapp"
            type="tel"
            inputMode="tel"
            icon={<PhoneIcon />}
            hint={t.whatsappHint}
            optional
            defaultValue={v("whatsapp")}
            errors={e?.whatsapp}
          />
          <Field label={t.facebook} name="facebook" hint={t.socialHint} optional defaultValue={v("facebook")} errors={e?.facebook} />
          <Field label={t.tiktok} name="tiktok" hint={t.socialHint} optional defaultValue={v("tiktok")} errors={e?.tiktok} />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel={t.saving}>{t.save}</SubmitButton>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-ink-soft hover:text-ink">
          {tt.reset.cancel}
        </button>
      </div>
    </form>
  );
}
