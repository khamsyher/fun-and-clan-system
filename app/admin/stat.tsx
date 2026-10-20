/** One figure in a row of figures; `highlight` gives it the brand panel. */
export function Stat({ label, value, note, highlight }: { label: string; value: string; note?: string; highlight?: boolean }) {
  return (
    <div className={`p-4 sm:p-5 ${highlight ? "panel-brand text-white" : "bg-surface"}`}>
      <dt className={`text-sm ${highlight ? "text-white/75" : "text-ink-soft"}`}>{label}</dt>
      <dd className={`tabular mt-1 font-display text-3xl ${highlight ? "text-white" : "text-brand-deep"}`}>{value}</dd>
      {note && <dd className={`mt-0.5 text-xs ${highlight ? "text-white/65" : "text-muted"}`}>{note}</dd>}
    </div>
  );
}

export { ClanActiveButton } from "./clan-active-button";
