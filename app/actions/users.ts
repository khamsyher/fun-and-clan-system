"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { getT } from "@/lib/i18n/server";
import type { FormState, Role } from "@/lib/definitions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin");
}

/**
 * Blocks an account or lets it back in. Blocking bumps session_version, so whoever is
 * using it is signed out at once rather than at the end of their week-long cookie.
 * A super admin account is never a target, so the platform can't be locked out of itself.
 */
export async function setUserBlocked(formData: FormData) {
  const admin = await requireRole("super_admin");
  const userId = String(formData.get("userId") ?? "");
  const blocked = formData.get("blocked") === "true";
  if (!UUID.test(userId)) return;

  const updated = await queryOne<{ clan_id: string | null }>(
    `UPDATE users
        SET status = $2::user_status, session_version = session_version + 1, updated_at = now()
      WHERE id = $1 AND role <> 'super_admin' AND status = $3::user_status
      RETURNING clan_id`,
    [userId, blocked ? "disabled" : "active", blocked ? "active" : "disabled"],
  );
  if (!updated) return;

  await query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, $3, $4)`, [
    updated.clan_id,
    admin.id,
    blocked ? "user.blocked" : "user.unblocked",
    userId,
  ]);
  refresh(userId);
}

/**
 * Deletes an account for good. Only one that owns no records can go: everything that
 * carries money or history (bills, slips, payouts, events, donations) holds the row with
 * ON DELETE RESTRICT, and PostgreSQL refusing is what this relies on — the answer then is
 * to block the account instead. Their notifications and family entries go with them.
 */
export async function deleteUser(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("super_admin");
  const t = (await getT()).users;
  const userId = String(formData.get("userId") ?? "");
  if (!UUID.test(userId)) return { message: t.deleteFailed };

  const target = await queryOne<{ full_name: string; role: Role; clan_id: string | null }>(
    `SELECT full_name, role, clan_id FROM users WHERE id = $1`,
    [userId],
  );
  if (!target) return { message: t.deleteFailed };
  if (target.role === "super_admin") return { message: t.deleteSuperAdmin };

  try {
    await transaction(async (db) => {
      await db.query(`DELETE FROM users WHERE id = $1 AND role <> 'super_admin'`, [userId]);
      // Written after the delete, so a refusal rolls the note back with it.
      await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id, details) VALUES ($1, $2, 'user.deleted', $3, $4)`, [
        target.clan_id,
        admin.id,
        userId,
        JSON.stringify({ full_name: target.full_name, role: target.role }),
      ]);
    });
  } catch (err) {
    // 23001 is what ON DELETE RESTRICT raises, 23503 a plain foreign key violation:
    // either way this person is referenced by records that must be kept.
    const code = typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
    if (code === "23001" || code === "23503") {
      return { message: t.deleteBlocked };
    }
    throw err;
  }

  refresh(userId);
  redirect("/admin/users?done=deleted");
}
