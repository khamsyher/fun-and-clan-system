import type { Metadata } from "next";
import { PageHeading, Section } from "@/components/app-shell";
import { FileIcon } from "@/components/icons";
import { requireRole } from "@/lib/dal";
import { query, queryOne } from "@/lib/db";
import { formatDate, formatKip } from "@/lib/format";
import { fmt, type Dictionary } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { FundSettingsForm } from "./settings-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).settings.metaTitle };
}

type Period = "monthly" | "yearly" | null;

type ChangeRow = {
  version: number;
  old_fund_mode: "A" | "B";
  new_fund_mode: "A" | "B";
  old_amount: string;
  new_amount: string;
  old_period: Period;
  new_period: Period;
  meeting_date: Date;
  note: string | null;
  minutes_file_id: string;
  changed_by_name: string | null;
  created_at: Date;
};

export default async function SettingsPage() {
  const leader = await requireRole("clan_admin");
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const s = t.settings;

  const [clan, history] = await Promise.all([
    queryOne<{ fund_mode: "A" | "B"; contribution_amount: string; contribution_period: Period; rate_version: number }>(
      `SELECT fund_mode, contribution_amount, contribution_period, rate_version FROM clans WHERE id = $1`,
      [leader.clanId],
    ),
    query<ChangeRow>(
      `SELECT r.version, r.old_fund_mode, r.new_fund_mode, r.old_amount, r.new_amount, r.old_period, r.new_period,
              r.meeting_date, r.note, r.minutes_file_id, u.full_name AS changed_by_name, r.created_at
         FROM clan_rate_changes r
         LEFT JOIN users u ON u.id = r.changed_by
        WHERE r.clan_id = $1
        ORDER BY r.version DESC`,
      [leader.clanId],
    ),
  ]);
  if (!clan) return null;

  return (
    <>
      <PageHeading title={s.title} lede={s.lede} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="panel-brand h-fit rounded-xl p-5 text-white shadow-soft sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/75">{s.current}</p>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">{fmt(s.version, { n: clan.rate_version })}</span>
          </div>
          <p className="mt-3 font-display text-2xl">
            {fmt(t.clan.mode, { m: clan.fund_mode })} · {clan.fund_mode === "A" ? t.clan.modeAName : t.clan.modeBName}
          </p>
          <p className="mt-4 text-sm text-white/75">{clan.fund_mode === "A" ? s.amountA : s.amountB}</p>
          <p className="tabular mt-1 font-display text-4xl">
            {formatKip(clan.contribution_amount)}
            {clan.fund_mode === "A" && (
              <span className="ml-2 font-sans text-base text-white/75">
                {clan.contribution_period === "monthly" ? t.clan.perMonth : t.clan.perYear}
              </span>
            )}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-white/70">{clan.fund_mode === "A" ? t.clan.modeABody : t.clan.modeBBody}</p>
        </div>

        <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-ink">{s.changeTitle}</h2>
          <div className="mt-5">
            <FundSettingsForm
              current={{
                mode: clan.fund_mode,
                amount: String(clan.contribution_amount),
                period: clan.contribution_period ?? "yearly",
                version: clan.rate_version,
              }}
            />
          </div>
        </section>
      </div>

      <Section title={s.history}>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center text-sm text-ink-soft">
            {s.noHistory}
          </p>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">{s.colVersion}</th>
                  <th className="px-4 py-3 font-medium">{s.colChange}</th>
                  <th className="px-4 py-3 font-medium">{s.colMeeting}</th>
                  <th className="px-4 py-3 font-medium">{s.colBy}</th>
                  <th className="px-4 py-3"><span className="sr-only">{s.viewMinutes}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.map((h) => (
                  <tr key={h.version} className="align-top">
                    <td className="px-4 py-3.5 font-semibold text-brand">{fmt(s.version, { n: h.version })}</td>
                    <td className="px-4 py-3.5">
                      <p className="text-ink-soft">
                        <span className="line-through decoration-muted/60">{describe(t, h.old_fund_mode, h.old_amount, h.old_period)}</span>
                      </p>
                      <p className="mt-0.5 font-medium text-ink">→ {describe(t, h.new_fund_mode, h.new_amount, h.new_period)}</p>
                      {h.note && <p className="mt-1 text-xs text-muted">{h.note}</p>}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink-soft">{formatDate(h.meeting_date, locale)}</td>
                    <td className="px-4 py-3.5 text-ink-soft">
                      {h.changed_by_name ?? "—"}
                      <span className="block text-xs text-muted">{formatDate(h.created_at, locale)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <a
                        href={`/files/${h.minutes_file_id}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-brand hover:bg-brand-wash"
                      >
                        <FileIcon width={16} height={16} />
                        {s.viewMinutes}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function describe(t: Dictionary, mode: "A" | "B", amount: string, period: Period) {
  const suffix = mode === "A" ? ` ${period === "monthly" ? t.clan.perMonth : t.clan.perYear}` : "";
  return `${fmt(t.clan.mode, { m: mode })} · ${formatKip(amount)}${suffix}`;
}
