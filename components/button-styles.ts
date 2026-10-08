/**
 * Button classes shared by links and buttons.
 * Kept out of ui.tsx on purpose: that file is a client component, and a plain value
 * imported from it into a server page becomes a client reference, not the string.
 */
export const buttonPrimary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-base font-semibold text-white shadow-soft transition-[background-color,transform] duration-200 hover:bg-brand-2 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70";

export const buttonQuiet =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors duration-200 hover:bg-sunken disabled:cursor-wait disabled:opacity-60";
