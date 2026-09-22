"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { RELATIONSHIPS, type FormState, type Relationship } from "@/lib/definitions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adds a dependent, or edits one when an id is given. Always scoped to the signed-in member. */
export async function saveDependent(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("member");
  const t = (await getT()).family;

  const id = String(formData.get("id") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim().replace(/\s+/g, " ");
  const relationship = String(formData.get("relationship") ?? "");
  const dob = String(formData.get("dob") ?? "");
  const values = { id, fullName, relationship, dob };

  const errors: Record<string, string[]> = {};
  if (fullName.length < 2 || fullName.length > 150) errors.fullName = [t.nameRequired];
  if (!RELATIONSHIPS.includes(relationship as Relationship)) errors.relationship = [t.relationshipRequired];
  if (dob && !isValidBirthDate(dob)) errors.dob = [t.dobInvalid];
  if (id && !UUID.test(id)) return { message: t.nameRequired, values };
  if (Object.keys(errors).length) return { errors, values };

  if (id) {
    const updated = await queryOne<{ id: string }>(
      `UPDATE dependents SET full_name = $4, relationship = $5, date_of_birth = $6, updated_at = now()
        WHERE id = $1 AND member_id = $2 AND clan_id = $3 AND is_active
        RETURNING id`,
      [id, me.id, me.clanId, fullName, relationship, dob || null],
    );
    if (!updated) return { message: t.nameRequired, values };
    await audit(me.clanId, me.id, "dependent.updated", id);
    revalidatePath("/member", "layout");
    return { success: fmt(t.updated, { name: fullName }) };
  }

  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO dependents (clan_id, member_id, full_name, relationship, date_of_birth)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [me.clanId, me.id, fullName, relationship, dob || null],
  );
  await audit(me.clanId, me.id, "dependent.added", inserted!.id);
  revalidatePath("/member", "layout");
  return { success: fmt(t.added, { name: fullName }) };
}

/** Soft delete: Phase 3 death events may still refer to the person. */
export async function removeDependent(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("member");
  const t = (await getT()).family;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return undefined;

  const removed = await queryOne<{ full_name: string }>(
    `UPDATE dependents SET is_active = FALSE, updated_at = now()
      WHERE id = $1 AND member_id = $2 AND clan_id = $3 AND is_active
      RETURNING full_name`,
    [id, me.id, me.clanId],
  );
  if (!removed) return undefined;
  await audit(me.clanId, me.id, "dependent.removed", id);
  revalidatePath("/member", "layout");
  return { success: fmt(t.removed, { name: removed.full_name }) };
}

function isValidBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return date.getTime() <= Date.now() + 24 * 60 * 60 * 1000 && date.getUTCFullYear() >= 1900;
}

async function audit(clanId: string | null, actorId: string, action: string, targetId: string) {
  await query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, $3, $4)`, [
    clanId,
    actorId,
    action,
    targetId,
  ]);
}
