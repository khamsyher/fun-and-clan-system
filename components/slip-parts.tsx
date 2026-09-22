import { Pill } from "./badge";
import { fmt, type Dictionary } from "@/lib/i18n/config";
import type { SlipRow } from "@/lib/payments";

const SLIP_TONE = { pending: "warn", approved: "ok", rejected: "bad" } as const;

export function SlipStatus({ status, t }: { status: SlipRow["status"]; t: Dictionary }) {
  return <Pill tone={SLIP_TONE[status]}>{t.slips.status[status]}</Pill>;
}

/** What a slip (or open item) is paying for, in the viewer's language. */
export function slipTarget(
  s: { event_no: number | null; deceased_name: string | null; label: string | null; bill_status?: string | null; kind?: string },
  t: Dictionary,
) {
  if (s.label) return fmt(t.slips.forDue, { label: s.label });
  const isDebt = s.kind === "debt" || s.bill_status === "carried" || s.bill_status === "settled";
  return fmt(isDebt ? t.slips.forDebt : t.slips.forBill, { n: s.event_no ?? "", name: s.deceased_name ?? "" });
}
