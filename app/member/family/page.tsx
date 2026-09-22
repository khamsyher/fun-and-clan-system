import type { Metadata } from "next";
import { PageHeading } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import type { Relationship } from "@/lib/definitions";
import { FamilyManager, type DependentView } from "./family-manager";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).family.metaTitle };
}

const ORDER: Record<Relationship, number> = { spouse: 0, father: 1, mother: 2, child: 3 };

export default async function FamilyPage() {
  const me = await requireRole("member");
  const [t, locale] = await Promise.all([getT(), getLocale()]);

  const rows = await query<{ id: string; full_name: string; relationship: Relationship; date_of_birth: string | null }>(
    `SELECT id, full_name, relationship, to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth
       FROM dependents
      WHERE member_id = $1 AND clan_id = $2 AND is_active
      ORDER BY created_at`,
    [me.id, me.clanId],
  );

  const dependents: DependentView[] = rows
    .sort((a, b) => ORDER[a.relationship] - ORDER[b.relationship])
    .map((d) => ({
      id: d.id,
      fullName: d.full_name,
      relationship: d.relationship,
      dob: d.date_of_birth ?? "",
      dobLabel: d.date_of_birth ? formatDate(d.date_of_birth, locale) : null,
    }));

  return (
    <>
      <PageHeading title={t.family.title} lede={t.family.lede} />
      <div className="mt-8">
        <FamilyManager dependents={dependents} />
      </div>
    </>
  );
}
