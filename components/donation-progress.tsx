import { formatKip } from "@/lib/format";
import { fmt, type Dictionary } from "@/lib/i18n/config";

/** How much a request has raised; with a target it also shows a bar. */
export function DonationProgress({
  raised,
  target,
  donors,
  t,
  size = "sm",
}: {
  raised: number;
  target: number | null;
  donors: number;
  t: Dictionary;
  size?: "sm" | "lg";
}) {
  const d = t.donations;
  const pct = target ? Math.min(100, Math.round((raised / target) * 100)) : null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={size === "lg" ? "tabular font-display text-3xl text-brand-deep" : "tabular font-semibold text-ink"}>
          {fmt(d.raised, { amount: formatKip(raised) })}
          <span className={`ml-2 font-sans font-normal text-ink-soft ${size === "lg" ? "text-base" : "text-sm"}`}>
            {target ? fmt(d.ofTarget, { amount: formatKip(target) }) : d.noTarget}
          </span>
        </p>
        {pct !== null && <p className="tabular text-sm font-semibold text-brand">{pct}%</p>}
      </div>
      {pct !== null && (
        <div
          className={`mt-2 overflow-hidden rounded-full bg-sunken ${size === "lg" ? "h-3" : "h-2"}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-bright transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-2 text-sm text-muted">{fmt(d.donors, { n: donors })}</p>
    </div>
  );
}
