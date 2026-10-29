import type { Metadata } from "next";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { Notice } from "@/components/ui";
import { withdrawPolicy } from "@/app/actions/policies";
import { requireRole } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { currentPolicy, latestDraft, pastPolicies, policyAgreements } from "@/lib/policies";
import { PolicyForm } from "./policy-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).policy.title };
}

/**
 * The leader writes the clan's rules and sends them to the platform team. Approved rules are
 * what members read and agree to; this page shows who has agreed to the current version.
 */
export default async function ClanRulesPage() {
  const leader = await requireRole("clan_admin");
  const [t, locale, current, draft, past] = await Promise.all([
    getT(),
    getLocale(),
    currentPolicy(leader.clanId!),
    latestDraft(leader.clanId!),
    pastPolicies(leader.clanId!),
  ]);
  const p = t.policy;
  const people = current ? await policyAgreements(leader.clanId!, current.id) : [];
  const agreed = people.filter((x) => x.agreed_at).length;

  return (
    <>
      <PageHeading title={p.title} lede={p.lede} />

      {draft?.status === "pending" && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-wash px-4 py-3 text-sm text-ink">
          <span>{p.waiting}</span>
          <form action={withdrawPolicy}>
            <button type="submit" className="rounded-lg px-3 py-1.5 font-medium text-ink-soft hover:bg-surface hover:text-bad">
              {p.withdraw}
            </button>
          </form>
        </div>
      )}
      {draft?.status === "rejected" && (
        <div className="mt-6">
          <Notice tone="error">{fmt(p.declinedMine, { note: draft.note ?? "" })}</Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="h-fit rounded-xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">{p.currentTitle}</h2>
            {current?.decided_at && <Pill tone="ok">{fmt(p.approvedOn, { date: formatDate(current.decided_at, locale) })}</Pill>}
          </div>
          {current ? (
            <p className="mt-4 text-sm leading-relaxed whitespace-pre-line break-words text-ink">{current.body}</p>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-soft">{p.noneYet}</p>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-ink">{p.writeTitle}</h2>
          <div className="mt-5">
            {/* Keyed on the current rules, so the box starts over once a version is approved but keeps its "sent" message otherwise. */}
            <PolicyForm key={current?.id ?? "new"} initial={draft?.body ?? current?.body ?? ""} />
          </div>
        </section>
      </div>

      {current && (
        <Section title={fmt(p.agreedCount, { n: agreed, total: people.length })}>
          {people.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
              {people.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0 truncate font-medium text-ink">{m.full_name}</span>
                  {m.agreed_at ? (
                    <Pill tone="ok">{fmt(p.agreedOn, { date: formatDate(m.agreed_at, locale) })}</Pill>
                  ) : (
                    <Pill tone="warn">{p.notAgreed}</Pill>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {past.length > 0 && (
        <Section title={p.historyTitle}>
          <ul className="space-y-2">
            {past.map((v) => (
              <li key={v.id}>
                <details className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-medium text-ink">
                    {fmt(p.approvedOn, { date: formatDate(v.decided_at, locale) })}
                  </summary>
                  <p className="mt-3 leading-relaxed whitespace-pre-line break-words text-ink-soft">{v.body}</p>
                </details>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
