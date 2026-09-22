"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, EyeIcon, EyeOffIcon, UploadIcon } from "./icons";
import { useT } from "./i18n-provider";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
  icon?: ReactNode;
  optional?: boolean;
};

export function Field({ label, name, hint, errors, icon, optional, type = "text", className, ...rest }: FieldProps) {
  const id = useId();
  const t = useT();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const invalid = Boolean(errors?.length);
  const describedBy = [hint && `${id}-hint`, invalid && `${id}-error`].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-muted">{t.common.optional}</span>}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">{icon}</span>
        )}
        <input
          id={id}
          name={name}
          type={isPassword && reveal ? "text" : type}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`h-12 w-full rounded-lg border bg-surface text-base text-ink placeholder:text-muted/80 transition-[border-color,box-shadow] duration-200 outline-none
            focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15
            ${invalid ? "border-bad focus:border-bad focus:ring-bad/10" : "border-line-strong"}
            ${icon ? "pl-11" : "pl-3.5"} ${isPassword ? "pr-12" : "pr-3.5"}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="absolute inset-y-0 right-1 my-1 flex w-10 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink"
            aria-label={reveal ? t.common.hidePassword : t.common.showPassword}
          >
            {reveal ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {hint && !invalid && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {invalid && (
        <ul id={`${id}-error`} className="mt-1.5 space-y-0.5 text-sm text-bad">
          {errors!.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "quiet";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`${variant === "primary" ? buttonPrimary : buttonQuiet} ${className}`}
    >
      {pending && <Spinner />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

export const buttonPrimary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-base font-semibold text-white shadow-soft transition-[background-color,transform] duration-200 hover:bg-brand-2 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70";

export const buttonQuiet =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors duration-200 hover:bg-sunken disabled:cursor-wait disabled:opacity-60";

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const styles = tone === "error" ? "bg-bad-wash text-bad" : "bg-ok-wash text-ok";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-lg px-4 py-3 text-sm leading-relaxed ${styles}`}>
      <span className="mt-0.5 shrink-0">{tone === "error" ? <AlertIcon width={18} height={18} /> : <CheckIcon width={18} height={18} />}</span>
      <div>{children}</div>
    </div>
  );
}

const controlBase =
  "w-full rounded-lg border bg-surface text-base text-ink transition-[border-color,box-shadow] duration-200 outline-none focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15";

function FieldShell({
  id,
  label,
  hint,
  errors,
  optional,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = useT();
  const invalid = Boolean(errors?.length);
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-muted">{t.common.optional}</span>}
      </label>
      {children}
      {hint && !invalid && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {invalid && (
        <ul id={`${id}-error`} className="mt-1.5 space-y-0.5 text-sm text-bad">
          {errors!.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const describe = (id: string, hint?: string, errors?: string[]) =>
  [hint && !errors?.length && `${id}-hint`, errors?.length && `${id}-error`].filter(Boolean).join(" ") || undefined;

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
  optional?: boolean;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function SelectField({ label, name, hint, errors, optional, options, placeholder, className, ...rest }: SelectProps) {
  const id = useId();
  const invalid = Boolean(errors?.length);
  return (
    <FieldShell id={id} label={label} hint={hint} errors={errors} optional={optional} className={className}>
      <select
        id={id}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={describe(id, hint, errors)}
        className={`${controlBase} h-12 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5' fill='none' stroke='%235b6680' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-10 pl-3.5 ${invalid ? "border-bad" : "border-line-strong"}`}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
  optional?: boolean;
};

export function TextAreaField({ label, name, hint, errors, optional, className, ...rest }: TextAreaProps) {
  const id = useId();
  const invalid = Boolean(errors?.length);
  return (
    <FieldShell id={id} label={label} hint={hint} errors={errors} optional={optional} className={className}>
      <textarea
        id={id}
        name={name}
        rows={3}
        aria-invalid={invalid || undefined}
        aria-describedby={describe(id, hint, errors)}
        className={`${controlBase} min-h-24 px-3.5 py-3 placeholder:text-muted/80 ${invalid ? "border-bad" : "border-line-strong"}`}
        {...rest}
      />
    </FieldShell>
  );
}

export function FileField({
  label,
  name,
  hint,
  errors,
  accept,
  chooseLabel,
}: {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
  accept: string;
  chooseLabel: string;
}) {
  const id = useId();
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const invalid = Boolean(errors?.length);

  // Forget the chosen name when the form resets (React resets forms after a successful action).
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => setFileName(null);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  return (
    <FieldShell id={id} label={label} hint={hint} errors={errors}>
      <label
        htmlFor={id}
        className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 transition-colors hover:border-brand-bright hover:bg-brand-wash/40 focus-within:border-brand-bright focus-within:ring-4 focus-within:ring-brand-bright/15 ${
          invalid ? "border-bad bg-bad-wash/30" : "border-line-strong bg-surface"
        }`}
      >
        <UploadIcon width={20} height={20} className="shrink-0 text-brand-bright" />
        <span className={`min-w-0 truncate text-sm ${fileName ? "font-medium text-ink" : "text-ink-soft"}`}>
          {fileName ?? chooseLabel}
        </span>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept={accept}
          className="sr-only"
          aria-describedby={describe(id, hint, errors)}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>
    </FieldShell>
  );
}
