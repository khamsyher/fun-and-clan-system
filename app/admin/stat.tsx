import { setClanActive } from "@/app/actions/admin";

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

/** Enables or disables a clan. Disabling locks its people out at once. */
export function ClanActiveButton({ clanId, active, labels }: { clanId: string; active: boolean; labels: { enable: string; disable: string } }) {
  return (
    <form action={setClanActive}>
      <input type="hidden" name="clanId" value={clanId} />
      <input type="hidden" name="active" value={String(!active)} />
      <button
        type="submit"
        className={`rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
          active ? "text-bad hover:bg-bad-wash" : "text-ok hover:bg-ok-wash"
        }`}
      >
        {active ? labels.disable : labels.enable}
      </button>
    </form>
  );
}
