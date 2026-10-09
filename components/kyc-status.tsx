import type { SVGProps } from "react";
import { AlertIcon, ClockIcon, ShieldBlankIcon, ShieldIcon } from "./icons";
import type { KycStatus, UserDocument } from "@/lib/profile";
import type { Dictionary } from "@/lib/i18n/config";

/** Where a person stands overall, which is what decides what they may do. */
export type KycState = "none" | KycStatus;

/**
 * One look per state, carried by three things at once — colour, icon shape and words —
 * so the state survives a small screen, a colour-blind reader and a glance.
 */
const LOOK: Record<KycState, { tone: string; mark: string; Icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement }> = {
  none: { tone: "bg-sunken text-ink-soft", mark: "bg-sunken text-muted", Icon: ShieldBlankIcon },
  pending: { tone: "bg-warn-wash text-warn", mark: "bg-warn-wash text-warn", Icon: ClockIcon },
  approved: { tone: "bg-ok-wash text-ok", mark: "bg-ok-wash text-ok", Icon: ShieldIcon },
  rejected: { tone: "bg-bad-wash text-bad", mark: "bg-bad-wash text-bad", Icon: AlertIcon },
};

const LABEL = (t: Dictionary, state: KycState) =>
  state === "none"
    ? t.kyc.mineNone
    : state === "pending"
      ? t.kyc.statusPending
      : state === "approved"
        ? t.kyc.statusApproved
        : t.kyc.statusRejected;

/** The person's overall standing, shown beside the Identity documents heading. */
export function KycBadge({ state, t }: { state: KycState; t: Dictionary }) {
  const look = LOOK[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${look.tone}`}>
      <look.Icon width={16} height={16} />
      {LABEL(t, state)}
    </span>
  );
}

/** The coloured mark that opens each document row. */
export function KycMark({ status }: { status: KycStatus }) {
  const look = LOOK[status];
  return (
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${look.mark}`} aria-hidden="true">
      <look.Icon width={20} height={20} />
    </span>
  );
}

/** What the state means for this person, in their own terms. */
export function kycLine(t: Dictionary, state: KycState) {
  return state === "none" ? t.kyc.mineBodyNone : state === "pending" ? t.kyc.mineBodyPending : state === "approved" ? t.kyc.mineBodyApproved : t.kyc.mineBodyRejected;
}

/**
 * Said once at the top of the account page, because an unconfirmed identity is what
 * stops someone joining a clan or asking for help — not something to find further down.
 */
export function KycWarning({ state, t }: { state: KycState; t: Dictionary }) {
  const waiting = state === "pending";
  const look = LOOK[state];
  return (
    <div
      className={`mt-5 flex flex-col gap-3 rounded-xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
        waiting ? "bg-warn-wash" : "bg-bad-wash"
      }`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 ${waiting ? "text-warn" : "text-bad"}`}>
          <look.Icon width={20} height={20} />
        </span>
        <div>
          <p className={`font-semibold ${waiting ? "text-warn" : "text-bad"}`}>{waiting ? t.kyc.bannerPending : t.kyc.needTitle}</p>
          <p className={`mt-0.5 max-w-[60ch] text-sm ${waiting ? "text-warn" : "text-bad"}`}>
            {state === "pending" ? t.kyc.bannerBodyPending : state === "rejected" ? t.kyc.bannerBodyRejected : t.kyc.bannerBodyNone}
          </p>
        </div>
      </div>
      {!waiting && (
        <a
          href="#identity"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold whitespace-nowrap text-white hover:bg-brand-2"
        >
          {t.kyc.bannerAction}
        </a>
      )}
    </div>
  );
}

/** Approved beats waiting beats turned down: the best standing is the one that counts. */
export function overallKyc(docs: UserDocument[]): KycState {
  if (docs.some((d) => d.status === "approved")) return "approved";
  if (docs.some((d) => d.status === "pending")) return "pending";
  if (docs.some((d) => d.status === "rejected")) return "rejected";
  return "none";
}
