import Link from "next/link";
import { formatNumber } from "@/lib/format";

/** A count of one kind of account, linking to that filter of the user list. */
export function PeopleCard({
  label,
  value,
  href,
  active,
  tone,
}: {
  label: string;
  value: string | number;
  href: string;
  active?: boolean;
  tone?: "warn";
}) {
  const warn = tone === "warn" && Number(value) > 0;
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-xl border px-4 py-3 transition-colors ${
        active ? "border-brand bg-brand-wash" : "border-line bg-surface hover:border-brand-bright/40"
      }`}
    >
      <span className={`tabular block font-display text-2xl ${warn ? "text-warn" : "text-brand-deep"}`}>{formatNumber(value)}</span>
      <span className="mt-0.5 block text-xs text-ink-soft">{label}</span>
    </Link>
  );
}
