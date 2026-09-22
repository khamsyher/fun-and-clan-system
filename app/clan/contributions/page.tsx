import type { Metadata } from "next";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { CollectionProgress } from "@/components/collection-progress";
import { Notice } from "@/components/ui";
import { addMissingMembers } from "@/app/actions/contributions";
import { requireRole } from "@/lib/dal";
import { query, queryOne } from "@/lib/db";
import { formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { DueControls, OpenPeriodForm } from "./controls";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).contributions.metaTitle };
}

type DueRow = {
  id: string;
  period_id: string;
  full_name: string;
  amount: string;
  status: "unpaid" | "paid" | "void";
  paid_method: "cash" | "transfer" | null;
  pending_slip: boolean;
  via_slip: boolean;
};

const DUE_TONE = { unpaid: "warn", paid: "ok", void: "mute" } as const;

export default async function ContributionsPage() {
  const leader = await requireRole("clan_admin");
  const t = await getT();
  const c = t.contributions;

  const clan = await queryOne<{ fund_mode: "A" | "B"; contribution_amount: string; contribution_period: "monthly" | "yearly" | null }>(
    `SELECT fund_mode, contribution_amount, contribution_period FROM clans WHERE id = $1`,
    [leader.clanId],
  );
  const [periods, dues] = await Promise.all([
    query<{ id: string; label: string; amount: string }>(
      `SELECT id, label, amount FROM contribution_periods WHERE clan_id = $1 ORDER BY label DESC`,
      [leader.clanId],
    ),
    query<DueRow>(
      `SELECT d.id, d.period_id, u.full_name, d.amount, d.status, d.paid_method,
              EXISTS (SELECT 1 FROM payment_slips s WHERE s.due_id = d.id AND s.status = 'pending') AS pending_slip,
              EXISTS (SELECT 1 FROM payment_slips s WHERE s.due_id = d.id AND s.status = 'approved') AS via_slip
         FROM contribution_dues d JOIN users u ON u.id = d.member_id
        WHERE d.clan_id = $1
        ORDER BY (d.status = 'unpaid') DESC, u.full_name`,
      [leader.clanId],
    ),
  ]);

  const isA = clan?.fund_mode === "A" && clan.contribution_period;
  const now = new Date();
  const suggestion =
    clan?.contribution_period === "monthly" ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` : String(now.getFullYear());

  return (
    <>
      <PageHeading
        title={c.title}
        lede={
          isA
            ? fmt(c.lede, {
                amount: formatKip(clan!.contribution_amount),
                period: clan!.contribution_period === "monthly" ? t.clan.perMonth : t.clan.perYear,
              })
            : undefined
        }
      />

      {!isA ? (
        <div className="mt-8">
          <Notice tone="error">{c.notModeA}</Notice>
        </div>
      ) : (
        <div className="mt-8 max-w-md rounded-xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-ink">{c.openTitle}</h2>
          <OpenPeriodForm periodType={clan!.contribution_period!} suggestion={suggestion} />
        </div>
      )}

      <Section title={c.periods}>
        {periods.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">{c.empty}</p>
        ) : (
          <div className="space-y-6">
            {periods.map((p) => {
              const rows = dues.filter((d) => d.period_id === p.id && d.status !== "void");
              const paid = rows.filter((d) => d.status === "paid");
              return (
                <section key={p.id} className="rounded-xl border border-line bg-surface">
                  <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="tabular font-display text-2xl text-brand-deep">{p.label}</h3>
                      <p className="text-sm text-ink-soft">{fmt(c.perMember, { amount: formatKip(p.amount) })}</p>
                    </div>
                    <form action={addMissingMembers}>
                      <input type="hidden" name="periodId" value={p.id} />
                      <button type="submit" className="rounded-md px-2.5 py-1.5 text-sm font-medium text-brand hover:bg-brand-wash">
                        {c.addMissing}
                      </button>
                    </form>
                  </div>
                  <div className="p-5">
                    <CollectionProgress
                      paid={paid.length}
                      total={rows.length}
                      raised={paid.reduce((s, d) => s + Number(d.amount), 0)}
                      expected={rows.reduce((s, d) => s + Number(d.amount), 0)}
                      t={t.events}
                      size="sm"
                    />
                  </div>
                  <div className="relative overflow-x-auto border-t border-line">
                    <table className="w-full min-w-[34rem] text-left text-sm">
                      <tbody className="divide-y divide-line">
                        {rows.map((d) => (
                          <tr key={d.id}>
                            <td className="px-5 py-3 font-medium text-ink">{d.full_name}</td>
                            <td className="tabular px-4 py-3 text-right">{formatKip(d.amount)}</td>
                            <td className="px-4 py-3">
                              <span className="flex flex-wrap gap-1.5">
                                <Pill tone={DUE_TONE[d.status]}>{c.due[d.status]}</Pill>
                                {d.pending_slip && <Pill tone="info">{c.pendingSlip}</Pill>}
                                {d.via_slip && <span className="text-xs text-muted">{t.payments.viaSlip}</span>}
                                {!d.via_slip && d.paid_method && <span className="text-xs text-muted">{t.events.method[d.paid_method]}</span>}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <DueControls key={d.status} dueId={d.id} status={d.status} viaSlip={d.via_slip} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
