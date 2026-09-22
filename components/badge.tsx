import type { UserStatus } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";

type BadgeStatus = UserStatus | "enabled" | "off";

const STATUS_STYLE: Record<BadgeStatus, string> = {
  active: "bg-ok-wash text-ok",
  pending: "bg-warn-wash text-warn",
  rejected: "bg-bad-wash text-bad",
  disabled: "bg-sunken text-ink-soft",
  enabled: "bg-ok-wash text-ok",
  off: "bg-sunken text-ink-soft",
};

export async function StatusBadge({ status }: { status: BadgeStatus }) {
  const t = await getT();
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {t.status[status]}
    </span>
  );
}

const TONE = {
  ok: "bg-ok-wash text-ok",
  warn: "bg-warn-wash text-warn",
  bad: "bg-bad-wash text-bad",
  info: "bg-brand-wash text-brand",
  mute: "bg-sunken text-ink-soft",
} as const;

export function Pill({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

const EVENT_TONE = { collecting: "info", awaiting_payout: "warn", completed: "ok", cancelled: "mute" } as const;
const BILL_TONE = { unpaid: "warn", paid: "ok", carried: "bad", settled: "ok", void: "mute" } as const;
const PAYOUT_TONE = { requested: "warn", approved: "info", rejected: "bad", paid: "ok" } as const;

export async function EventBadge({ status }: { status: keyof typeof EVENT_TONE }) {
  const t = await getT();
  return <Pill tone={EVENT_TONE[status]}>{t.events.status[status]}</Pill>;
}

export async function BillBadge({ status }: { status: keyof typeof BILL_TONE }) {
  const t = await getT();
  return <Pill tone={BILL_TONE[status]}>{t.events.bill[status]}</Pill>;
}

export async function PayoutBadge({ status }: { status: keyof typeof PAYOUT_TONE }) {
  const t = await getT();
  return <Pill tone={PAYOUT_TONE[status]}>{t.events.payout[status]}</Pill>;
}
