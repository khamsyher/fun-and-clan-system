import { decideMember } from "@/app/actions/clan";
import { decideJoinRequest } from "@/app/actions/membership";
import { CheckIcon, XIcon } from "@/components/icons";
import { fmt } from "@/lib/i18n/config";
import type { Relationship } from "@/lib/definitions";

/** Approve / decline a registration, or disable / enable a member. Always scoped server-side to the leader's clan. */
export function DecisionButton({
  memberId,
  decision,
  label,
  primary,
  subtle,
  disabled,
}: {
  memberId: string;
  decision: "approve" | "reject" | "disable" | "enable";
  label: string;
  primary?: boolean;
  subtle?: boolean;
  /** With the reason shown on hover, e.g. the clan is full. */
  disabled?: string;
}) {
  const cls = subtle
    ? "rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-soft hover:bg-sunken hover:text-ink"
    : primary
      ? "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-soft hover:bg-brand-2 sm:flex-none"
      : "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-bad-wash hover:text-bad sm:flex-none";
  return (
    <form action={decideMember} className={subtle ? "inline" : "flex flex-1 sm:flex-none"}>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="decision" value={decision} />
      <button type="submit" className={`${cls} disabled:cursor-not-allowed disabled:opacity-50`} disabled={Boolean(disabled)} title={disabled}>
        {!subtle && (decision === "approve" ? <CheckIcon width={16} height={16} /> : <XIcon width={16} height={16} />)}
        {label}
      </button>
    </form>
  );
}

/** Approve or decline a general user who sent this clan's code. */
export function JoinButton({
  requestId,
  decision,
  label,
  primary,
  disabled,
}: {
  requestId: string;
  decision: "approve" | "reject";
  label: string;
  primary?: boolean;
  disabled?: string;
}) {
  return (
    <form action={decideJoinRequest} className="flex flex-1 sm:flex-none">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="decision" value={decision} />
      <button
        type="submit"
        disabled={Boolean(disabled)}
        title={disabled}
        className={
          "disabled:cursor-not-allowed disabled:opacity-50 " +
          (primary
            ? "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-soft hover:bg-brand-2 sm:flex-none"
            : "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-bad-wash hover:text-bad sm:flex-none")
        }
      >
        {decision === "approve" ? <CheckIcon width={16} height={16} /> : <XIcon width={16} height={16} />}
        {label}
      </button>
    </form>
  );
}

/** A member's household, folded: "3 people ›" opens the names. */
export function FamilyCell({
  people,
  rel,
  countLabel,
}: {
  people: { full_name: string; relationship: Relationship }[];
  rel: Record<Relationship, string>;
  countLabel: string;
}) {
  if (people.length === 0) return <span className="text-muted">—</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm font-medium text-brand hover:text-brand-bright [&::-webkit-details-marker]:hidden">
        {fmt(countLabel, { n: people.length })}
        <span className="ml-1 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
      </summary>
      <ul className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
        {people.map((p, i) => (
          <li key={i}>
            {p.full_name} <span className="text-muted">· {rel[p.relationship]}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
