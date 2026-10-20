import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { requireRole } from "@/lib/dal";
import { query } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/definitions";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { pendingLeaderRequests, recentLeaderDecisions } from "@/lib/leader-requests";
import type { ClanTypeOption } from "../../forms";
import { ClanTabs } from "../clan-tabs";
import { DecideLeaderRequest } from "./decide-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).leaderRequests.tab };
}

/** People asking to set up and lead a new clan, waiting for staff to decide. */
export default async function LeaderRequestsPage() {
  await requireRole(...STAFF_ROLES);
  const [t, locale, pending, recent, types] = await Promise.all([
    getT(),
    getLocale(),
    pendingLeaderRequests(),
    recentLeaderDecisions(),
    query<ClanTypeOption>(`SELECT id, name, is_active FROM clan_types ORDER BY lower(name)`),
  ]);
  const l = t.leaderRequests;

  return (
    <>
      <PageHeading title={t.clansAdmin.title} lede={t.clansAdmin.lede} />
      <ClanTabs t={t} />

      <Section title={l.waitingTitle} aside={fmt(t.admin.total, { n: pending.length })}>
        <p className="-mt-2 mb-4 max-w-[65ch] text-sm text-ink-soft">{l.staffLede}</p>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-10 text-center text-sm text-ink-soft">{l.none}</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-xl text-brand-deep">{r.clan_name}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {l.askedBy}{" "}
                      <Link href={`/admin/users/${r.user_id}`} className="font-medium text-ink hover:text-brand">
                        {r.full_name}
                      </Link>{" "}
                      · {r.phone} · {formatDate(r.created_at, locale)}
                    </p>
                  </div>
                  {/* Approval re-checks this, but staff should see it before choosing a code. */}
                  <Pill tone={r.kyc_approved ? "ok" : "bad"}>{r.kyc_approved ? l.verified : l.notVerified}</Pill>
                </div>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  {r.description && (
                    <div>
                      <dt className="text-xs text-muted">{l.fDescription}</dt>
                      <dd className="mt-0.5 whitespace-pre-line text-ink">{r.description}</dd>
                    </div>
                  )}
                  {r.reason && (
                    <div>
                      <dt className="text-xs text-muted">{l.fReason}</dt>
                      <dd className="mt-0.5 whitespace-pre-line text-ink">{r.reason}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-4 border-t border-line pt-4">
                  <DecideLeaderRequest requestId={r.id} types={types} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {recent.length > 0 && (
        <Section title={l.recentTitle}>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="min-w-0">
                  {r.clan_id ? (
                    <Link href={`/admin/clans/${r.clan_id}`} className="font-medium text-ink hover:text-brand">
                      {r.clan_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink">{r.clan_name}</span>
                  )}
                  {r.clan_code && <span className="ml-2 text-xs font-semibold tracking-[0.06em] text-brand">{r.clan_code}</span>}
                  <span className="block text-xs text-muted">
                    {r.full_name} · {r.decided_by_name ?? "—"} · {r.decided_at ? formatDate(r.decided_at, locale) : ""}
                    {r.note && <> · “{r.note}”</>}
                  </span>
                </span>
                <Pill tone={r.status === "approved" ? "ok" : "bad"}>{r.status === "approved" ? l.statusApproved : l.statusDeclined}</Pill>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
