import Link from "next/link";
import { FileIcon } from "./icons";
import type { Dictionary } from "@/lib/i18n/config";

/** Date range picker (a plain GET form, works without JavaScript) plus quick ranges and export links. */
export function ReportRange({ base, from, to, t, valid }: { base: string; from: string; to: string; t: Dictionary; valid: boolean }) {
  const r = t.reports;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Vientiane" });
  const y = Number(today.slice(0, 4));
  const quick = [
    { label: r.thisMonth, from: `${today.slice(0, 7)}-01`, to: today },
    { label: r.thisYear, from: `${y}-01-01`, to: today },
    { label: r.lastYear, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    { label: r.allTime, from: "2000-01-01", to: today },
  ];
  const q = `from=${from}&to=${to}`;
  const input =
    "h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink outline-none focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15";

  return (
    <div className="mt-8 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <form method="get" action={base} className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          {r.from}
          <input type="date" name="from" defaultValue={from} max={today} className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          {r.to}
          <input type="date" name="to" defaultValue={to} max={today} className={input} />
        </label>
        <button type="submit" className="inline-flex h-11 items-center justify-center rounded-lg bg-brand px-5 font-semibold text-white shadow-soft hover:bg-brand-2">
          {r.apply}
        </button>
        <div className="flex gap-2 sm:ml-auto">
          <a
            href={`${base}/export?format=xlsx&${q}`}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ok hover:bg-ok-wash sm:flex-none"
          >
            <FileIcon width={16} height={16} />
            {r.exportExcel}
          </a>
          <a
            href={`${base}/export?format=pdf&${q}`}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-bad hover:bg-bad-wash sm:flex-none"
          >
            <FileIcon width={16} height={16} />
            {r.exportPdf}
          </a>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {quick.map((x) => {
          const active = x.from === from && x.to === to;
          return (
            <Link
              key={x.label}
              href={`${base}?from=${x.from}&to=${x.to}`}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                active ? "bg-brand font-semibold text-white" : "bg-sunken text-ink-soft hover:bg-brand-wash hover:text-brand"
              }`}
            >
              {x.label}
            </Link>
          );
        })}
      </div>
      {!valid && <p className="mt-3 text-sm text-bad">{r.errRange}</p>}
    </div>
  );
}
