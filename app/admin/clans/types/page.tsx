import type { Metadata } from "next";
import { PageHeading, Section } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { query } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/definitions";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { ClanTabs } from "../clan-tabs";
import { ClanTypeRow, NewClanTypeForm, type ClanTypeItem } from "./forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).clanTypes.title };
}

/** The list clans are grouped by. A type in use can be retired but not deleted. */
export default async function ClanTypesPage() {
  await requireRole(...STAFF_ROLES);
  const [t, types] = await Promise.all([
    getT(),
    query<ClanTypeItem>(
      `SELECT ct.id, ct.name, ct.description, ct.is_active, COUNT(c.id) AS clans
         FROM clan_types ct LEFT JOIN clans c ON c.clan_type_id = ct.id
        GROUP BY ct.id ORDER BY ct.is_active DESC, lower(ct.name)`,
    ),
  ]);
  const ct = t.clanTypes;

  return (
    <>
      <PageHeading title={t.clansAdmin.title} lede={t.clansAdmin.lede} />
      <ClanTabs t={t} />

      <Section title={ct.title} aside={fmt(t.admin.total, { n: types.length })}>
        <p className="-mt-2 mb-4 max-w-[65ch] text-sm text-ink-soft">{ct.lede}</p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {types.length === 0 ? (
            <p className="h-fit rounded-xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-ink-soft">
              {ct.empty}
            </p>
          ) : (
            <ul className="h-fit divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {types.map((type) => (
                <ClanTypeRow key={type.id} type={type} />
              ))}
            </ul>
          )}
          <div className="h-fit rounded-xl border border-line bg-surface p-5">
            <NewClanTypeForm />
          </div>
        </div>
      </Section>
    </>
  );
}
