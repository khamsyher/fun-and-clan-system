"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne, transaction } from "@/lib/db";
import { canManageAccount, protectedRoles } from "@/lib/access";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES, adminCreateUserSchema, isStaffRole, type FormState, type Role } from "@/lib/definitions";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { notify } from "@/lib/notify";
import { hashPassword, temporaryPassword } from "@/lib/password";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin");
}

/**
 * Blocks an account or lets it back in. Blocking bumps session_version, so whoever is
 * using it is signed out at once rather than at the end of their week-long cookie.
 * A super admin account is never a target, so the platform can't be locked out of itself;
 * support accounts are left to the super admin.
 */
export async function setUserBlocked(formData: FormData) {
  const admin = await requireRole(...STAFF_ROLES);
  const userId = String(formData.get("userId") ?? "");
  const blocked = formData.get("blocked") === "true";
  if (!UUID.test(userId)) return;

  const updated = await queryOne<{ clan_id: string | null }>(
    `UPDATE users
        SET status = $2::user_status, session_version = session_version + 1, updated_at = now()
      WHERE id = $1 AND role::text <> ALL($4::text[]) AND status = $3::user_status
      RETURNING clan_id`,
    [userId, blocked ? "disabled" : "active", blocked ? "active" : "disabled", protectedRoles(admin)],
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
 * Makes someone a clan leader, or steps a leader back down to member.
 * A member can only lead the clan they are already in — moving them would strand their
 * bills and slips in the old clan. A general user has no clan, so the admin picks one,
 * and any join request they had waiting is withdrawn. The role changes, so
 * session_version is bumped and they sign in again with the new role.
 * The last active leader of a clan can't be stepped down, so no clan is left without one.
 */
export async function setClanLeader(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole(...STAFF_ROLES);
  const t = (await getT()).users;
  const userId = String(formData.get("userId") ?? "");
  const makeLeader = formData.get("leader") === "true";
  const pickedClan = String(formData.get("clanId") ?? "");
  if (!UUID.test(userId)) return { message: t.leaderFailed };

  const result = await transaction(async (db): Promise<FormState> => {
    const target = (
      await db.query<{ full_name: string; role: Role; status: string; clan_id: string | null }>(
        `SELECT full_name, role, status, clan_id FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      )
    ).rows[0];
    // Platform staff run the platform; they don't lead a clan.
    if (!target || isStaffRole(target.role)) return { message: t.leaderFailed };

    if (!makeLeader) {
      if (target.role !== "clan_admin" || !target.clan_id) return { message: t.leaderFailed };
      const others = await db.query(
        `SELECT 1 FROM users WHERE clan_id = $1 AND role = 'clan_admin' AND status = 'active' AND id <> $2`,
        [target.clan_id, userId],
      );
      if (!others.rowCount) return { message: t.leaderLast };
      await db.query(
        `UPDATE users SET role = 'member', session_version = session_version + 1, updated_at = now() WHERE id = $1`,
        [userId],
      );
      await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'user.leader_removed', $3)`, [
        target.clan_id,
        admin.id,
        userId,
      ]);
      return { success: fmt(t.leaderRemoved, { name: target.full_name }) };
    }

    if (target.role === "clan_admin") return { message: t.leaderFailed };
    if (target.status === "disabled") return { message: t.leaderBlocked };
    const clanId = target.clan_id ?? pickedClan;
    if (!UUID.test(clanId)) return { errors: { clanId: [t.leaderPickClan] } };

    const clan = (await db.query<{ name: string; is_active: boolean }>(`SELECT name, is_active FROM clans WHERE id = $1`, [clanId]))
      .rows[0];
    if (!clan) return { errors: { clanId: [t.leaderPickClan] } };
    if (!clan.is_active) return { errors: { clanId: [t.leaderClanInactive] } };

    await db.query(
      `UPDATE users
          SET clan_id = $2, role = 'clan_admin', status = 'active', is_treasurer = false,
              approved_by = COALESCE(approved_by, $3), approved_at = COALESCE(approved_at, now()),
              session_version = session_version + 1, updated_at = now()
        WHERE id = $1`,
      [userId, clanId, admin.id],
    );
    await db.query(
      `UPDATE clan_join_requests SET status = 'withdrawn', decided_at = now() WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    );
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'user.leader_assigned', $3)`, [
      clanId,
      admin.id,
      userId,
    ]);
    await notify(db, userId, "leader_assigned", { clan: clan.name }, "/login");
    return { success: fmt(t.leaderAssigned, { name: target.full_name, clan: clan.name }) };
  });

  refresh(userId);
  revalidatePath("/clan");
  return result;
}

/**
 * Deletes an account for good. Only one that owns no records can go: everything that
 * carries money or history (bills, slips, payouts, events, donations) holds the row with
 * ON DELETE RESTRICT, and PostgreSQL refusing is what this relies on — the answer then is
 * to block the account instead. Their notifications and family entries go with them.
 */
export async function deleteUser(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole(...STAFF_ROLES);
  const t = (await getT()).users;
  const userId = String(formData.get("userId") ?? "");
  if (!UUID.test(userId)) return { message: t.deleteFailed };

  const target = await queryOne<{ full_name: string; role: Role; clan_id: string | null }>(
    `SELECT full_name, role, clan_id FROM users WHERE id = $1`,
    [userId],
  );
  if (!target) return { message: t.deleteFailed };
  if (target.role === "super_admin") return { message: t.deleteSuperAdmin };
  if (!canManageAccount(admin, target.role)) return { message: t.staffOnlySuperAdmin };

  try {
    await transaction(async (db) => {
      await db.query(`DELETE FROM users WHERE id = $1 AND role::text <> ALL($2::text[])`, [userId, protectedRoles(admin)]);
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

/**
 * The super admin makes a general user into support staff, or turns support back into a
 * general user. Only the super admin can: support can do everything else on the platform,
 * so who gets it stays with the owner. Only someone with no clan qualifies, since staff
 * belong to none. The role changes, so they sign in again with it.
 */
export async function setSupport(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("super_admin");
  const t = (await getT()).users;
  const userId = String(formData.get("userId") ?? "");
  const makeSupport = formData.get("support") === "true";
  if (!UUID.test(userId) || userId === admin.id) return { message: t.supportFailed };

  const result = await transaction(async (db): Promise<FormState> => {
    const changed = await db.query<{ full_name: string }>(
      `UPDATE users
          SET role = $2::user_role, status = 'active', session_version = session_version + 1, updated_at = now()
        WHERE id = $1 AND role = $3::user_role AND clan_id IS NULL AND status <> 'disabled'
        RETURNING full_name`,
      [userId, makeSupport ? "support" : "user", makeSupport ? "user" : "support"],
    );
    const person = changed.rows[0];
    if (!person) return { message: t.supportFailed };

    // Staff can't be waiting to join a clan.
    if (makeSupport) {
      await db.query(`UPDATE clan_join_requests SET status = 'withdrawn', decided_at = now() WHERE user_id = $1 AND status = 'pending'`, [
        userId,
      ]);
    }
    await db.query(`INSERT INTO audit_logs (actor_id, action, target_id) VALUES ($1, $2, $3)`, [
      admin.id,
      makeSupport ? "user.support_assigned" : "user.support_removed",
      userId,
    ]);
    return { success: fmt(makeSupport ? t.supportAssigned : t.supportRemoved, { name: person.full_name }) };
  });

  refresh(userId);
  return result;
}

/**
 * Staff create an account for someone, e.g. a person who can't sign up on their own.
 * The account is active straight away; the password is generated and shown once, to be
 * passed on and changed at first sign-in. A member or leader goes into an active clan.
 * Only the super admin can create a Support account.
 */
export async function createUser(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole(...STAFF_ROLES);
  const tt = await getT();
  const t = tt.users;
  const values = Object.fromEntries(["fullName", "phone", "email", "role", "clanId"].map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = adminCreateUserSchema(tt.errors).safeParse(values);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, values };
  const d = parsed.data;

  if (d.role === "support" && admin.role !== "super_admin") return { errors: { role: [t.staffOnlySuperAdmin] }, values };

  const inClan = d.role === "member" || d.role === "clan_admin";
  let clanId: string | null = null;
  if (inClan) {
    if (!d.clanId || !UUID.test(d.clanId)) return { errors: { clanId: [t.leaderPickClan] }, values };
    const clan = await queryOne<{ is_active: boolean }>(`SELECT is_active FROM clans WHERE id = $1`, [d.clanId]);
    if (!clan) return { errors: { clanId: [t.leaderPickClan] }, values };
    if (!clan.is_active) return { errors: { clanId: [t.leaderClanInactive] }, values };
    clanId = d.clanId;
  }

  if (await queryOne(`SELECT 1 FROM users WHERE phone = $1`, [d.phone])) {
    return { errors: { phone: [tt.auth.phoneTaken] }, values };
  }
  if (d.email && (await queryOne(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [d.email]))) {
    return { errors: { email: [tt.auth.emailTaken] }, values };
  }

  const temp = temporaryPassword();
  const created = await queryOne<{ id: string }>(
    `INSERT INTO users (clan_id, role, status, full_name, phone, email, password_hash, approved_by, approved_at)
     VALUES ($1, $2::user_role, 'active', $3, $4, $5, $6, $7, now())
     RETURNING id`,
    [clanId, d.role, d.fullName, d.phone, d.email, await hashPassword(temp), admin.id],
  );
  await query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id, details) VALUES ($1, $2, 'user.created', $3, $4)`, [
    clanId,
    admin.id,
    created!.id,
    JSON.stringify({ role: d.role }),
  ]);

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  if (clanId) revalidatePath("/clan");
  // The password goes back once, in `success`; the id lets the page link to the new account.
  return { success: temp, values: { name: d.fullName, phone: d.phone, id: created!.id } };
}
