import { fmt, type Dictionary } from "./i18n/config";
import type { ClanReport } from "./reports";

type LedgerRow = ClanReport["ledger"][number];

/** One human line for a ledger entry: which event / period, whose payment, or the deposit note. */
export function ledgerDetail(l: LedgerRow, t: Dictionary) {
  const parts: string[] = [];
  if (l.event_no) parts.push(`${fmt(t.events.eventNo, { n: l.event_no })} · ${l.deceased_name ?? ""}`);
  if (l.period_label) parts.push(fmt(t.slips.forDue, { label: l.period_label }));
  if (l.member_name) parts.push(l.member_name);
  if ((l.entry_type === "deposit" || l.entry_type === "adjustment") && l.note) parts.push(l.note);
  return parts.join(" · ");
}

/** Report rows in display order: income lines, expense lines, corrections (only types that occur). */
export function summaryRows(r: ClanReport, t: Dictionary) {
  const income = (["collection", "debt_collection", "contribution", "deposit"] as const)
    .filter((k) => r.totals[k])
    .map((k) => ({ label: t.fund.type[k], amount: r.totals[k]! }));
  const expenses = (["payout", "platform_fee"] as const)
    .filter((k) => r.totals[k])
    .map((k) => ({ label: t.fund.type[k], amount: r.totals[k]! }));
  return { income, expenses };
}

export function reportFileName(prefix: string, from: string, to: string, ext: "xlsx" | "pdf") {
  return `${prefix}-${from}_${to}.${ext}`.replace(/[^\w.-]+/g, "-");
}
