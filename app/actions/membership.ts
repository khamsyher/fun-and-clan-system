"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { clanLeaderId, notify } from "@/lib/notify";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { clanCodeSchema, type FormState } from "@/lib/definitions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A general user asks a clan to take them in. Nothing about the clan changes yet:
 * only the leader's approval turns them into a member, so every clan-scoped query
 * keeps seeing exactly the people who were let in.
 */
export async function requestJoinClan(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("user");
  const t = await getT();
  const values = { clanCode: String(formData.get("clanCode") ?? "") };
  const parsed = clanCodeSchema(t.errors).safeParse(values);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, values };

  const clan = await queryOne<{ id: string; name: string; is_active: boolean }>(
    `SELECT id, name, is_active FROM clans WHERE code = $1`,
    [parsed.data.clanCode],
  );
  if (!clan) return { errors: { clanCode: [t.auth.unknownClan] }, values };
  if (!clan.is_active) return { errors: { clanCode: [t.auth.clanInactive] }, values };

  const result = await transaction(async (db): Promise<FormState> => {
    // One request at a time, so nobody queues up at every clan at once.
    const open = await db.query(`SELECT 1 FROM clan_join_requests WHERE user_id = $1 AND status = 'pending'`, [me.id]);
    if (open.rowCount) return { message: t.account.joinAlready, values };

    const created = await db.query<{ id: string }>(
      `INSERT INTO clan_join_requests (clan_id, user_id) VALUES ($1, $2) RETURNING id`,
      [clan.id, me.id],
    );
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'clan.join_requested', $3)`, [
      clan.id,
      me.id,
      created.rows[0].id,
    ]);
    const leader = await clanLeaderId(db, clan.id);
    if (leader) await notify(db, leader, "join_requested", { name: me.fullName }, "/clan");
    return { success: fmt(t.account.joinSent, { clan: clan.name }) };
  });

  revalidatePath("/account");
  return result;
}

/** The general user takes their own request back, so they can ask a different clan. */
export async function withdrawJoinRequest() {
  const me = await requireRole("user");
  await query(`UPDATE clan_join_requests SET status = 'withdrawn', decided_at = now() WHERE user_id = $1 AND status = 'pending'`, [
    me.id,
  ]);
  revalidatePath("/account");
}

/**
 * The clan leader decides. Approving moves the person into the clan as a member;
 * their role changes, so session_version is bumped and their old session ends —
 * they sign in again and their new token carries the member role.
 * Scoped to the leader's own clan_id, so a forged id can't reach another clan.
 */
export async function decideJoinRequest(formData: FormData) {
  const leader = await requireRole("clan_admin");
  const requestId = String(formData.get("requestId") ?? "");
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  if (!UUID.test(requestId)) return;

  await transaction(async (db) => {
    const row = (
      await db.query<{ user_id: string }>(
        `SELECT user_id FROM clan_join_requests
          WHERE id = $1 AND clan_id = $2 AND status = 'pending' FOR UPDATE`,
        [requestId, leader.clanId],
      )
    ).rows[0];
    if (!row) return;

    await db.query(
      `UPDATE clan_join_requests
          SET status = $2::join_status, note = $3, decided_by = $4, decided_at = now()
        WHERE id = $1`,
      [requestId, approve ? "approved" : "rejected", approve ? null : note, leader.id],
    );

    if (approve) {
      const moved = await db.query(
        `UPDATE users
            SET clan_id = $2, role = 'member', status = 'active', approved_by = $3, approved_at = now(),
                session_version = session_version + 1, updated_at = now()
          WHERE id = $1 AND role = 'user' AND clan_id IS NULL`,
        [row.user_id, leader.clanId, leader.id],
      );
      // Rolls the whole decision back if they are no longer a clanless general user.
      if (!moved.rowCount) throw new Error("This person is no longer waiting to join a clan");
    }

    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, $3, $4)`, [
      leader.clanId,
      leader.id,
      approve ? "clan.join_approved" : "clan.join_rejected",
      row.user_id,
    ]);
    await notify(
      db,
      row.user_id,
      approve ? "join_approved" : "join_rejected",
      { clan: leader.clanName ?? "" },
      approve ? "/login" : "/account",
    );
  });

  revalidatePath("/clan");
}
