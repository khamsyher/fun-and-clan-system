import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { Notice } from "@/components/ui";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES } from "@/lib/definitions";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { pendingPolicies, recentPolicyDecisions } from "@/lib/policies";
import { ClanTabs } from "../clan-tabs";
import { DecidePolicy } from "./decide-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).policy.tab };
}

/** Clan rules sent by leaders, waiting for the platform team, shown next to the rules they replace. */
export default async function ClanRulesQueuePage({ searchParams }: PageProps<"/admin/clans/rules">) {
  await requireRole(...STAFF_ROLES);
  const [t, locale, pending, recent, sp] = await Promise.all([getT(), getLocale(), pendingPolicies(), recentPolicyDecisions(), searchParams]);
  const p = t.policy;

  return (
    <>
      <PageHeading title={t.clansAdmin.title} lede={t.clansAdmin.lede} />
      <ClanTabs t={t} />
      {(sp.done === "approved" || sp.done === "declined") && (
        <div className="mt-6">
          <Notice tone="success">{sp.done === "approved" ? p.approvedDone : p.declinedDone}</Notice>
        </div>
      )}

      <Section title={p.waitingTitle} aside={fmt(t.admin.total, { n: pending.length })}>
        <p className="-mt-2 mb-4 max-w-[65ch] text-sm text-ink-soft">{p.staffLede}</p>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-10 text-center text-sm text-ink-soft">{p.none}</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-surface p-5">
                <div className="min-w-0">
                  <Link href={`/admin/clans/${r.clan_id}`} className="font-display text-xl text-brand-deep hover:text-brand">
                    {r.clan_name}
                  </Link>
                  <span className="ml-2 text-xs font-semibold tracking-[0.06em] text-brand">{r.clan_code}</span>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {p.sentBy} {r.submitted_by_name ?? "—"} · {formatDate(r.updated_at, locale)}
                  </p>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted">{p.newVersion}</p>
                    <p className="mt-1 max-h-96 overflow-y-auto rounded-lg border border-brand/30 bg-brand-wash/40 p-3 text-sm leading-relaxed whitespace-pre-line break-words text-ink">
                      {r.body}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted">{p.replaces}</p>
                    {r.current_body ? (
                      <p className="mt-1 max-h-96 overflow-y-auto rounded-lg border border-line bg-paper/60 p-3 text-sm leading-relaxed whitespace-pre-line break-words text-ink-soft">
                        {r.current_body}
                      </p>
                    ) : (
                      <p className="mt-1 rounded-lg border border-dashed border-line-strong p-3 text-sm text-ink-soft">{p.firstVersion}</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 border-t border-line pt-4">
                  <DecidePolicy policyId={r.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {recent.length > 0 && (
        <Section title={p.recentTitle}>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  <Link href={`/admin/clans/${r.clan_id}`} className="font-medium text-ink hover:text-brand">
                    {r.clan_name}
                  </Link>
                  <span className="block text-xs text-muted">
                    {r.decided_by_name ?? "—"} · {formatDate(r.decided_at, locale)}
                    {r.note && <> · “{r.note}”</>}
                  </span>
                </span>
                <Pill tone={r.status === "approved" ? "ok" : "bad"}>{r.status === "approved" ? p.statusApproved : p.statusDeclined}</Pill>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
