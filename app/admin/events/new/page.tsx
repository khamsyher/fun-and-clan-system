import type { Metadata } from "next";
import { PageHeading } from "@/components/app-shell";
import { ReportDeathPage } from "@/components/report-death-page";
import { requireRole } from "@/lib/dal";
import { query } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";

type ClanOption = { id: string; name: string; code: string };

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).events.newMetaTitle };
}

export default async function AdminNewEventPage({ searchParams }: PageProps<"/admin/events/new">) {
  await requireRole(...STAFF_ROLES);
  const [t, sp, clans] = await Promise.all([
    getT(),
    searchParams,
    query<ClanOption>(`SELECT id, name, code FROM clans WHERE is_active ORDER BY lower(name)`),
  ]);
  const selectedId = typeof sp.clanId === "string" ? sp.clanId : "";
  const selected = clans.find((clan) => clan.id === selectedId);

  return (
    <>
      {selected ? (
        <form action="/admin/events/new" method="get" className="mb-6 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium text-ink">
            {t.admin.colClan}
            <select
              name="clanId"
              defaultValue={selectedId}
              className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-base outline-none focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
            >
              {clans.map((clan) => <option key={clan.id} value={clan.id}>{clan.name} ({clan.code})</option>)}
            </select>
          </label>
          <button type="submit" className="inline-flex h-11 items-center justify-center rounded-lg border border-line-strong bg-surface px-5 font-semibold text-brand hover:bg-brand-wash">
            {t.reports.apply}
          </button>
        </form>
      ) : (
        <div className="mt-3">
          <PageHeading title={t.events.newTitle} lede={t.admin.chooseClan} />
        </div>
      )}

      {clans.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center text-ink-soft">{t.admin.noClans}</p>
      ) : (
        <>
          {!selected && (
            <form action="/admin/events/new" method="get" className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-end">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium text-ink">
                {t.admin.colClan}
                <select
                  name="clanId"
                  defaultValue=""
                  required
                  className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-base outline-none focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
                >
                  <option value="">{t.admin.chooseClan}</option>
                  {clans.map((clan) => <option key={clan.id} value={clan.id}>{clan.name} ({clan.code})</option>)}
                </select>
              </label>
              <button type="submit" className="inline-flex h-11 items-center justify-center rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-2">
                {t.reports.apply}
              </button>
            </form>
          )}
          {selected && <ReportDeathPage clanId={selected.id} backHref="/admin/events" memberId={null} includeClanId />}
        </>
      )}
    </>
  );
}
