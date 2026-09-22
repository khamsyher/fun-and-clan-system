import { formatKip } from "@/lib/format";
import { fmt, type Dictionary } from "@/lib/i18n/config";

/** Crowdfunding bar (TOR 3.4): how many households paid, how many still owe, and the total raised. */
export function CollectionProgress({
  paid,
  total,
  raised,
  expected,
  t,
  size = "lg",
}: {
  paid: number;
  total: number;
  raised: number;
  expected: number;
  t: Dictionary["events"];
  size?: "lg" | "sm";
}) {
  const pct = expected > 0 ? Math.min(100, Math.round((raised / expected) * 100)) : 0;
  const outstanding = Math.max(0, total - paid);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={size === "lg" ? "tabular font-display text-3xl text-brand-deep" : "tabular font-semibold text-ink"}>
          {formatKip(raised)}
          <span className={`ml-2 font-sans text-ink-soft ${size === "lg" ? "text-base" : "text-sm font-normal"}`}>
            {fmt(t.of, { amount: formatKip(expected) })}
          </span>
        </p>
        <p className="tabular text-sm font-semibold text-brand">{pct}%</p>
      </div>
      <div
        className={`mt-2 overflow-hidden rounded-full bg-sunken ${size === "lg" ? "h-3" : "h-2"}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t.raised}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-bright transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-sm">
        <span className="text-ok">{fmt(t.paidCount, { paid, total })}</span>
        {outstanding > 0 && <span className="text-warn">{fmt(t.stillToPay, { n: outstanding })}</span>}
      </div>
    </div>
  );
}
