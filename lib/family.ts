import "server-only";
import { query } from "./db";
import { formatDate } from "./format";
import type { Relationship } from "./definitions";
import type { Locale } from "./i18n/config";

/** One person in a member's household, ready for the list on their account page. */
export type Dependent = {
  id: string;
  fullName: string;
  relationship: Relationship;
  /** YYYY-MM-DD, so the date input can reload it. */
  dob: string;
  dobLabel: string | null;
};

// Household order, not insertion order: the two parents belong together, children last.
const ORDER: Record<Relationship, number> = { spouse: 0, father: 1, mother: 2, child: 3 };

/** Everyone in a person's family list. Their current clan, if any, is what covers them. */
export async function listDependents(memberId: string, locale: Locale): Promise<Dependent[]> {
  const rows = await query<{ id: string; full_name: string; relationship: Relationship; date_of_birth: string | null }>(
    `SELECT id, full_name, relationship, to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth
       FROM dependents
      WHERE member_id = $1 AND is_active
      ORDER BY created_at`,
    [memberId],
  );

  return rows
    .sort((a, b) => ORDER[a.relationship] - ORDER[b.relationship])
    .map((d) => ({
      id: d.id,
      fullName: d.full_name,
      relationship: d.relationship,
      dob: d.date_of_birth ?? "",
      dobLabel: d.date_of_birth ? formatDate(d.date_of_birth, locale) : null,
    }));
}
