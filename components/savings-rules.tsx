import { FileIcon } from "./icons";
import { formatDate } from "@/lib/format";
import { fmt, type Dictionary, type Locale } from "@/lib/i18n/config";

/**
 * A savings group's rules: the written text and/or a document, with when they last changed.
 * Shown on the join page (so people know what they agree to) and on the group page.
 */
export function SavingsRules({
  rules,
  fileId,
  updatedAt,
  t,
  locale,
  agreeNote,
}: {
  rules: string | null;
  fileId: string | null;
  updatedAt: Date | null;
  t: Dictionary;
  locale: Locale;
  /** On the join page: "By asking to join, you agree to these rules." */
  agreeNote?: boolean;
}) {
  const s = t.savings;
  if (!rules && !fileId) return null;
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink">{s.rulesTitle}</h2>
        {updatedAt && <span className="text-xs text-muted">{fmt(s.rulesUpdated, { date: formatDate(updatedAt, locale) })}</span>}
      </div>
      {rules && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink">{rules}</p>}
      {fileId && (
        <a
          href={`/files/${fileId}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-brand hover:bg-brand-wash"
        >
          <FileIcon width={16} height={16} />
          {s.openRulesFile}
        </a>
      )}
      {agreeNote && <p className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">{s.rulesAgree}</p>}
    </section>
  );
}
