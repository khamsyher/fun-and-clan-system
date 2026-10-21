"use client";

import Link from "next/link";
import { useState } from "react";
import { formatKip, formatNumber } from "@/lib/format";
import { useT } from "./i18n-provider";

// One series per chart, so one color: categorical slot 1, validated against the white chart
// surface (lightness band, chroma floor, contrast >= 3:1). Labels and values never wear it —
// they use the text tokens; the colored mark beside them carries identity.
const SERIES = "#2a78d6";

export type MonthPoint = { key: string; label: string; full: string; value: number };
type Kind = "kip" | "count";

const exact = (v: number, kind: Kind) => (kind === "kip" ? formatKip(v) : formatNumber(v));

/** Axis ticks: 0 / 1.5K / 3M — compact from 1,000 up, trailing zeros dropped. */
function compact(v: number) {
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [n, s] of units) if (Math.abs(v) >= n) return `${Number((v / n).toFixed(1))}${s}`;
  return String(v);
}

/** A clean top for the axis, so the halfway tick is a round number too. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * mag >= v) return step * mag;
  return 10 * mag;
}

/**
 * Monthly columns. Each column is its own hover/focus target (the full slot, not just the
 * painted bar); the tooltip shows the exact value and month. Only the latest month is
 * labeled on the chart; the axis carries the rest, and the table view has every number.
 */
export function MonthlyColumns({ points, kind, caption }: { points: MonthPoint[]; kind: Kind; caption: string }) {
  const c = useT().charts;
  const [active, setActive] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const ticks = [top, top / 2, 0];
  const last = points.length - 1;
  const nothing = points.every((p) => p.value === 0);

  return (
    <figure className="min-w-0">
      <div className="relative h-48" role="img" aria-label={caption}>
        {/* Hairline grid with its tick labels, recessive. */}
        {ticks.map((t) => (
          <div key={t} className="absolute right-0 left-0 flex items-center" style={{ bottom: `${(t / top) * 100}%`, transform: "translateY(50%)" }}>
            <span className="tabular w-11 shrink-0 pr-2 text-right text-[0.7rem] text-muted">{kind === "kip" ? compact(t) : compact(Math.round(t))}</span>
            <span className={`h-px flex-1 ${t === 0 ? "bg-line-strong" : "bg-line"}`} />
          </div>
        ))}

        {/* An all-zero year is said in words, not left as a flat line to puzzle over. */}
        {nothing && (
          <p className="absolute inset-x-11 top-1/3 text-center text-xs text-muted">{c.empty}</p>
        )}
        <div className="absolute top-0 right-0 bottom-0 left-11 flex items-end">
          {points.map((p, i) => {
            const h = (p.value / top) * 100;
            const on = active === i;
            return (
              <div
                key={p.key}
                tabIndex={0}
                aria-label={`${p.full}: ${exact(p.value, kind)}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="relative flex h-full flex-1 cursor-default items-end justify-center outline-none focus-visible:bg-brand-wash/40"
              >
                {/* The latest month is the one labeled; the others show on hover. */}
                {i === last && active === null && p.value > 0 && (
                  <span className="tabular absolute text-[0.7rem] font-medium whitespace-nowrap text-ink-soft" style={{ bottom: `calc(${h}% + 4px)` }}>
                    {compact(p.value)}
                  </span>
                )}
                <div
                  className="w-[min(24px,70%)] rounded-t-[4px] transition-[filter]"
                  style={{ height: p.value > 0 ? `max(${h}%, 2px)` : 0, background: SERIES, filter: on ? "brightness(1.15)" : undefined }}
                />
                {on && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left whitespace-nowrap shadow-soft"
                    style={{ bottom: `calc(${Math.min(h, 80)}% + 10px)`, left: "50%", transform: `translateX(${i > last - 2 ? "-85%" : i < 2 ? "-15%" : "-50%"})` }}
                  >
                    <p className="tabular text-sm font-semibold text-ink">{exact(p.value, kind)}</p>
                    <p className="text-xs text-muted">{p.full}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ml-11 flex pt-1.5" aria-hidden="true">
        {points.map((p) => (
          <span key={p.key} className="flex-1 truncate text-center text-[0.65rem] text-muted">
            {p.label}
          </span>
        ))}
      </div>

      <TableView>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 font-medium">{c.colMonth}</th>
              <th className="py-1 text-right font-medium">{caption}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {points.map((p) => (
              <tr key={p.key}>
                <td className="py-1 text-ink-soft">{p.full}</td>
                <td className="tabular py-1 text-right text-ink">{exact(p.value, kind)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </figure>
  );
}

/**
 * Ranked horizontal bars (largest first), each row linking to its detail page. The value sits
 * at the bar's tip, so nothing hides behind a hover; hovering lifts the row.
 */
export function RankedBars({ rows, hrefBase, empty }: { rows: { id: string; label: string; sub?: string; value: number }[]; hrefBase: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`${hrefBase}${r.id}`} className="group grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-3 rounded-md px-1 py-1.5 hover:bg-sunken/60 focus-visible:bg-sunken/60">
            <span className="min-w-0">
              <span className="block truncate text-sm text-ink" title={r.label}>
                {r.label}
              </span>
              {r.sub && <span className="block truncate text-[0.7rem] text-muted">{r.sub}</span>}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              {/* 85% leaves the longest bar room for its value at the tip. */}
              <span
                className="h-3 shrink-0 rounded-r-[4px] transition-[filter] group-hover:brightness-110"
                style={{ width: r.value > 0 ? `max(${(r.value / max) * 85}%, 2px)` : 0, background: SERIES }}
              />
              <span className="tabular shrink-0 text-xs font-medium text-ink-soft">{formatNumber(r.value)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TableView({ children }: { children: React.ReactNode }) {
  const c = useT().charts;
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-brand hover:text-brand-bright">{c.showTable}</summary>
      <div className="mt-2 max-h-64 overflow-y-auto">{children}</div>
    </details>
  );
}
