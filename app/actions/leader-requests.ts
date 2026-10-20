"use server";

import { revalidatePath } from "next/cache";
import { query, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { canJoinClan } from "@/lib/access";
import { STAFF_ROLES, type FormState } from "@/lib/definitions";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { notify, notifyMany, superAdminIds } from "@/lib/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A general user asks to set up and lead a clan that isn't on the platform yet. Only someone
 * whose identity the platform has approved may ask, as with joining a clan: a leader handles
 * other people's money. Staff are told; nothing is created until they approve.
 */
export async function requestToLeadClan(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("user");
  const tt = await getT();
  const t = tt.leaderRequests;
  const values = {
    clanName: String(formData.get("clanName") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    reason: String(formData.get("reason") ?? "").trim(),
  };
  if (!canJoinClan(me)) return { message: tt.kyc.needForClan, values };

  const errors: Record<string, string[]> = {};
  if (values.clanName.length < 2 || values.clanName.length > 150) errors.clanName = [t.errName];
  if (values.description.length > 500) errors.description = [t.errTooLong];
  if (values.reason.length < 10 || values.reason.length > 500) errors.reason = [t.errReason];
  if (Object.keys(errors).length) return { errors, values };

  const result = await transaction(async (db): Promise<FormState> => {
    // One open request at a time (the unique index enforces it too).
    const open = await db.query(`SELECT 1 FROM clan_leader_requests WHERE user_id = $1 AND status = 'pending'`, [me.id]);
    if (open.rowCount) return { message: t.errAlready, values };

    const created = await db.query<{ id: string }>(
      `INSERT INTO clan_leader_requests (user_id, clan_name, description, reason) VALUES ($1, $2, $3, $4) RETURNING id`,
      [me.id, values.clanName, values.description || null, values.reason],
    );
    await db.query(`INSERT INTO audit_logs (actor_id, action, target_id, details) VALUES ($1, 'clan.leader_requested', $2, $3)`, [
      me.id,
      created.rows[0].id,
      JSON.stringify({ clan_name: values.clanName }),
    ]);
    await notifyMany(db, await superAdminIds(db), "leader_requested", { name: me.fullName, clan: values.clanName }, "/admin/clans/requests");
    return { success: fmt(t.sent, { clan: values.clanName }) };
  });

  revalidatePath("/account");
  revalidatePath("/admin", "layout");
  return result;
}

/** The person takes their request back, e.g. to change the clan's name and ask again. */
export async function withdrawLeaderRequest() {
  const me = await requireRole("user");
  await query(`UPDATE clan_leader_requests SET status = 'withdrawn', decided_at = now() WHERE user_id = $1 AND status = 'pending'`, [me.id]);
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
}

/**
 * Staff decide. Approving needs the clan code staff choose (it must be unique), creates the
 * clan, and makes the person its leader — checked again under a lock, so someone who has
 * since joined another clan or lost their verification can't be approved by a stale page.
 * Their role changes, so their session ends and they sign in again as leader.
 * Declining needs a reason, which they see on their account page.
 */
export async function decideLeaderRequest(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole(...STAFF_ROLES);
  const tt = await getT();
  const t = tt.leaderRequests;
  const requestId = String(formData.get("requestId") ?? "");
  const approve = formData.get("decision") === "approve";
  const values = {
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    clanTypeId: String(formData.get("clanTypeId") ?? ""),
    note: String(formData.get("note") ?? "").trim().slice(0, 300),
  };
  if (!UUID.test(requestId)) return { message: t.errState, values };

  if (approve) {
    if (!/^[A-Z0-9-]{2,20}$/.test(values.code)) return { errors: { code: [tt.errors.clanCodeFormat] }, values };
  } else if (values.note.length < 3) {
    return { errors: { note: [t.errNote] }, values };
  }
  const clanTypeId = UUID.test(values.clanTypeId) ? values.clanTypeId : null;

  const result = await transaction(async (db): Promise<FormState> => {
    const req = (
      await db.query<{ user_id: string; clan_name: string; description: string | null }>(
        `SELECT user_id, clan_name, description FROM clan_leader_requests WHERE id = $1 AND status = 'pending' FOR UPDATE`,
        [requestId],
      )
    ).rows[0];
    if (!req) return { message: t.errState, values };

    if (!approve) {
      await db.query(
        `UPDATE clan_leader_requests SET status = 'rejected', note = $2, decided_by = $3, decided_at = now() WHERE id = $1`,
        [requestId, values.note, admin.id],
      );
      await db.query(`INSERT INTO audit_logs (actor_id, action, target_id, details) VALUES ($1, 'clan.leader_request_rejected', $2, $3)`, [
        admin.id,
        requestId,
        JSON.stringify({ note: values.note }),
      ]);
      await notify(db, req.user_id, "leader_request_rejected", { clan: req.clan_name, note: values.note }, "/account");
      return { success: fmt(t.declined, { clan: req.clan_name }) };
    }

    // Still a verified general user with no clan?
    const person = (
      await db.query<{ full_name: string }>(
        `SELECT full_name FROM users u
          WHERE id = $1 AND role = 'user' AND clan_id IS NULL AND status = 'active'
            AND EXISTS (SELECT 1 FROM user_documents d WHERE d.user_id = u.id AND d.status = 'approved')
          FOR UPDATE`,
        [req.user_id],
      )
    ).rows[0];
    if (!person) return { message: t.errNotEligible, values };
    if ((await db.query(`SELECT 1 FROM clans WHERE code = $1`, [values.code])).rowCount) {
      return { errors: { code: [tt.admin.codeTaken] }, values };
    }
    if (clanTypeId && !(await db.query(`SELECT 1 FROM clan_types WHERE id = $1 AND is_active`, [clanTypeId])).rowCount) {
      return { errors: { clanTypeId: [tt.clanTypes.pick] }, values };
    }

    const clanId = (
      await db.query<{ id: string }>(
        `INSERT INTO clans (code, name, description, clan_type_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [values.code, req.clan_name, req.description, clanTypeId],
      )
    ).rows[0].id;
    await db.query(
      `UPDATE users
          SET clan_id = $2, role = 'clan_admin', approved_by = $3, approved_at = now(),
              session_version = session_version + 1, updated_at = now()
        WHERE id = $1`,
      [req.user_id, clanId, admin.id],
    );
    // A leader can't also be waiting to join some other clan.
    await db.query(`UPDATE clan_join_requests SET status = 'withdrawn', decided_at = now() WHERE user_id = $1 AND status = 'pending'`, [
      req.user_id,
    ]);
    await db.query(
      `UPDATE clan_leader_requests SET status = 'approved', clan_id = $2, decided_by = $3, decided_at = now() WHERE id = $1`,
      [requestId, clanId, admin.id],
    );
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'clan.created', $1)`, [clanId, admin.id]);
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'user.leader_assigned', $3)`, [
      clanId,
      admin.id,
      req.user_id,
    ]);
    await notify(db, req.user_id, "leader_request_approved", { clan: req.clan_name, code: values.code }, "/login");
    return { success: fmt(t.approved, { clan: req.clan_name, name: person.full_name, code: values.code }) };
  });

  revalidatePath("/admin", "layout");
  revalidatePath("/account");
  return result;
}
