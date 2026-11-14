import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { FileIcon } from "@/components/icons";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES } from "@/lib/definitions";
import { formatDate, formatNumber } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { listPlatformMembersReport } from "@/lib/users";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.membersReportTitle };
}

export default async function AdminMembersReportPage() {
  await requireRole(...STAFF_ROLES);
  const [t, locale, members] = await Promise.all([getT(), getLocale(), listPlatformMembersReport()]);
  const rt = t.reports;

  return (
    <>
      <Link href="/admin/reports" className="text-sm font-medium text-brand hover:text-brand-bright">← {rt.adminTitle}</Link>
      <div className="mt-3"><PageHeading title={rt.membersReportTitle} lede={rt.membersReportLede} /></div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-soft">{formatNumber(members.length)} {rt.membersReportTotal}</p>
        <a
          href="/admin/reports/members/export"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ok hover:bg-ok-wash"
        >
          <FileIcon width={16} height={16} />
          {rt.exportExcel}
        </a>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface shadow-soft">
        {members.length === 0 ? (
          <p className="px-5 py-10 text-center text-ink-soft">{rt.noMembersReport}</p>
        ) : (
          <table className="w-full min-w-[70rem] text-left text-sm">
            <thead className="border-b border-line bg-brand-wash/60 text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">{rt.colMember}</th>
                <th className="px-4 py-3 font-medium">{rt.colPhone}</th>
                <th className="px-4 py-3 font-medium">{t.member.email}</th>
                <th className="px-4 py-3 font-medium">{rt.colClan}</th>
                <th className="px-4 py-3 font-medium">{t.admin.colRole}</th>
                <th className="px-4 py-3 font-medium">{rt.membersReportPosition}</th>
                <th className="px-4 py-3 font-medium">{t.admin.colStatus}</th>
                <th className="px-4 py-3 font-medium">{t.admin.colJoined}</th>
                <th className="px-4 py-3 font-medium">{rt.membersReportPassedAway}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${member.id}`} className="font-medium text-ink hover:text-brand">{member.full_name}</Link>
                    {member.village && <p className="text-xs text-muted">{member.village}</p>}
                  </td>
                  <td className="tabular px-4 py-3 text-ink-soft">{member.phone}</td>
                  <td className="px-4 py-3 text-ink-soft">{member.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    {member.clan_name ? <><span className="font-medium text-ink">{member.clan_name}</span><span className="block text-xs font-semibold tracking-wide text-brand">{member.clan_code}</span></> : "—"}
                  </td>
                  <td className="px-4 py-3">{t.roles.member}</td>
                  <td className="px-4 py-3">{member.is_treasurer ? t.treasurer.badge : t.roles.member}</td>
                  <td className="px-4 py-3">{t.status[member.status]}{member.deceased_at && <span className="block text-xs text-muted">{rt.membersReportPassedAway}</span>}</td>
                  <td className="px-4 py-3 text-ink-soft">{formatDate(member.created_at, locale)}</td>
                  <td className="px-4 py-3 text-ink-soft">{member.deceased_at ? formatDate(member.deceased_at, locale) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
