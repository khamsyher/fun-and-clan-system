"use server";

import { randomInt } from "node:crypto";
import * as z from "zod";
import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import type { FormState } from "@/lib/definitions";

export async function changePassword(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole();
  const tt = await getT();
  const t = tt.account;
  const e = tt.errors;

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const nextCheck = z
    .string()
    .min(8, { error: e.passwordMin })
    .regex(/[a-zA-Z]/, { error: e.passwordLetter })
    .regex(/[0-9]/, { error: e.passwordNumber })
    .safeParse(next);

  const errors: Record<string, string[]> = {};
  if (!current) errors.current = [e.passwordRequired];
  if (!nextCheck.success) errors.next = nextCheck.error.issues.map((i) => i.message);
  if (next !== confirm) errors.confirm = [e.passwordsMismatch];
  if (Object.keys(errors).length) return { errors };

  const row = await queryOne<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
  if (!row || !(await verifyPassword(current, row.password_hash))) return { errors: { current: [t.wrongCurrent] } };
  if (current === next) return { errors: { next: [t.same] } };

  const updated = await queryOne<{ session_version: number }>(
    `UPDATE users SET password_hash = $2, password_changed_at = now(), session_version = session_version + 1, updated_at = now()
      WHERE id = $1 RETURNING session_version`,
    [user.id, await hashPassword(next)],
  );
  await query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'user.password_changed', $2)`, [
    user.clanId,
    user.id,
  ]);
  // Every older session is now invalid (see lib/dal.ts); keep this device signed in with a fresh one.
  await createSession(user.id, user.role, user.clanId, updated!.session_version);
  return { success: t.changed };
}

/**
 * Gives someone a new temporary password when they are locked out.
 * A clan leader can reset members of their own clan; the super admin can reset anyone but another super admin.
 */
export async function resetPassword(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireRole("clan_admin", "super_admin");
  const userId = String(formData.get("userId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return undefined;

  const temp = temporaryPassword();
  const target =
    actor.role === "clan_admin"
      ? await queryOne<{ full_name: string; clan_id: string }>(
          `UPDATE users SET password_hash = $3, password_changed_at = now(), session_version = session_version + 1, updated_at = now()
            WHERE id = $1 AND clan_id = $2 AND role = 'member'
            RETURNING full_name, clan_id`,
          [userId, actor.clanId, await hashPassword(temp)],
        )
      : await queryOne<{ full_name: string; clan_id: string }>(
          `UPDATE users SET password_hash = $2, password_changed_at = now(), session_version = session_version + 1, updated_at = now()
            WHERE id = $1 AND role <> 'super_admin'
            RETURNING full_name, clan_id`,
          [userId, await hashPassword(temp)],
        );
  if (!target) return undefined;

  await query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'user.password_reset', $3)`, [
    target.clan_id,
    actor.id,
    userId,
  ]);
  if (actor.role === "clan_admin") {
    revalidatePath("/clan");
  } else {
    revalidatePath("/admin");
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
  }
  return { success: temp, values: { name: target.full_name } };
}

/** e.g. "KTRW-4827": easy to read out loud, meets the password rules, no look-alike characters. */
function temporaryPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const word = Array.from({ length: 4 }, () => letters[randomInt(letters.length)]).join("");
  const digits = String(randomInt(1000, 10000));
  return `${word}-${digits}`;
}
