"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { removeLogo, resetBranding, updateBranding } from "@/app/actions/admin";
import { useT } from "@/components/i18n-provider";
import { Field, FileField, Notice, SubmitButton } from "@/components/ui";

export function BrandingForm({
  appName,
  primaryColor,
  accentColor,
  logo,
}: {
  appName: string;
  primaryColor: string;
  accentColor: string;
  logo: string | null;
}) {
  const [state, action] = useActionState(updateBranding, undefined);
  const b = useT().branding;
  const e = state?.errors;
  // Kept in state so the preview follows the pickers before anything is saved.
  const [name, setName] = useState(appName);
  const [primary, setPrimary] = useState(primaryColor);
  const [accent, setAccent] = useState(accentColor);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.success && <Notice tone="success">{state.success}</Notice>}

      {/* What the header and sign-in panel will look like. */}
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="flex items-center gap-2.5 bg-surface px-4 py-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the platform logo
            <img src={logo} alt="" className="size-8 rounded-md object-contain" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full border-2" style={{ borderColor: primary }}>
              <span className="size-2.5 rounded-full" style={{ background: accent }} />
            </span>
          )}
          <span className="font-display text-xl" style={{ color: primary }}>
            {name || "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white" style={{ background: primary }}>
          <span>{b.previewPanel}</span>
          <span className="rounded-md px-2.5 py-1 font-semibold" style={{ background: accent, color: "#111" }}>
            {b.previewButton}
          </span>
        </div>
      </div>

      <Field
        label={b.appName}
        name="appName"
        value={name}
        onChange={(ev) => setName(ev.target.value)}
        maxLength={60}
        errors={e?.appName}
        hint={b.appNameHint}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <ColorField label={b.primary} hint={b.primaryHint} name="primaryColor" value={primary} onChange={setPrimary} errors={e?.primaryColor} />
        <ColorField label={b.accent} hint={b.accentHint} name="accentColor" value={accent} onChange={setAccent} errors={e?.accentColor} />
      </div>

      <FileField label={b.logo} name="logo" accept="image/png,image/jpeg,image/webp" chooseLabel={b.logoChoose} hint={b.logoHint} errors={e?.logo} />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel={b.saving}>{b.save}</SubmitButton>
        {logo && <QuietAction formAction={removeLogo} label={b.removeLogo} />}
        <QuietAction formAction={resetBranding} label={b.reset} />
      </div>
    </form>
  );
}

function ColorField({
  label,
  hint,
  name,
  value,
  onChange,
  errors,
}: {
  label: string;
  hint: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  errors?: string[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor={`${name}-text`}>
        {label}
      </label>
      <div className={`flex h-12 items-center gap-2 rounded-lg border bg-surface px-2 ${errors?.length ? "border-bad" : "border-line-strong"}`}>
        <input
          type="color"
          aria-label={label}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(ev) => onChange(ev.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <input
          id={`${name}-text`}
          name={name}
          value={value}
          onChange={(ev) => onChange(ev.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase text-ink outline-none"
        />
      </div>
      {errors?.length ? <p className="mt-1.5 text-sm text-bad">{errors[0]}</p> : <p className="mt-1.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

function QuietAction({ formAction, label }: { formAction: () => Promise<void>; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={pending}
      className="rounded-md px-2.5 py-2 text-sm font-medium text-ink-soft hover:bg-sunken hover:text-ink disabled:opacity-60"
    >
      {label}
    </button>
  );
}
