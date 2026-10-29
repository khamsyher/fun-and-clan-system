"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES, type FormState } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import { clanLeaderId, clanMemberIds, notify, notifyMany, superAdminIds } from "@/lib/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLICY_MIN = 10;
const POLICY_MAX = 5000;

const refresh = () => {
  revalidatePath("/clan", "layout");
  revalidatePath("/member", "layout");
  revalidatePath("/admin", "layout");
};

/**
 * The leader sends the clan's rules for approval. A version already waiting is edited in
 * place (so there is only ever one in the queue); otherwise a new version is created.
 * Members keep the current approved rules until staff approve this one.
 */
export async function submitPolicy(_state: FormState, formData: FormData): Promise<FormState> {
  const leader = await requireRole("clan_admin");
  const t = (await getT()).policy;
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  const values = { body };
  if (body.length < POLICY_MIN || body.length > POLICY_MAX) return { errors: { body: [t.errBody] }, values };

  const same = await transaction(async (db) => {
    // One sender at a time per clan, so two quick sends can't both create a waiting version.
    await db.query(`SELECT 1 FROM clans WHERE id = $1 FOR UPDATE`, [leader.clanId]);
    const current = (
      await db.query<{ body: string }>(
        `SELECT body FROM clan_policies WHERE clan_id = $1 AND status = 'approved' ORDER BY decided_at DESC LIMIT 1`,
        [leader.clanId],
      )
    ).rows[0];
    if (current && current.body === body) return true;

    const updated = await db.query<{ id: string }>(
      `UPDATE clan_policies SET body = $2, submitted_by = $3, updated_at = now()
        WHERE clan_id = $1 AND status = 'pending' RETURNING id`,
      [leader.clanId, body, leader.id],
    );
    const id =
      updated.rows[0]?.id ??
      (
        await db.query<{ id: string }>(`INSERT INTO clan_policies (clan_id, body, submitted_by) VALUES ($1, $2, $3) RETURNING id`, [
          leader.clanId,
          body,
          leader.id,
        ])
      ).rows[0].id;
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'policy.submitted', $3)`, [
      leader.clanId,
      leader.id,
      id,
    ]);
    // Only tell staff about a new entry in their queue, not every edit to it.
    if (!updated.rowCount) {
      await notifyMany(db, await superAdminIds(db), "policy_submitted", { clan: leader.clanName ?? "" }, "/admin/clans/rules");
    }
    return false;
  });
  if (same) return { errors: { body: [t.errSame] }, values };

  refresh();
  return { success: t.sent, values };
}

/** The leader takes back the version that is waiting. */
export async function withdrawPolicy() {
  const leader = await requireRole("clan_admin");
  await query(`UPDATE clan_policies SET status = 'withdrawn', decided_at = now() WHERE clan_id = $1 AND status = 'pending'`, [leader.clanId]);
  refresh();
}

/**
 * Staff approve the waiting version (it becomes the clan's rules, and members are asked to
 * agree to it) or decline it with a reason the leader reads.
 */
export async function decidePolicy(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole(...STAFF_ROLES);
  const t = (await getT()).policy;
  const policyId = String(formData.get("policyId") ?? "");
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const values = { note };
  if (!UUID.test(policyId)) return { message: t.errState, values };
  if (!approve && note.length < 3) return { errors: { note: [t.errNote] }, values };

  const result = await transaction(async (db): Promise<FormState> => {
    const p = (
      await db.query<{ clan_id: string; clan_name: string }>(
        `SELECT p.clan_id, c.name AS clan_name FROM clan_policies p JOIN clans c ON c.id = p.clan_id
          WHERE p.id = $1 AND p.status = 'pending' FOR UPDATE OF p`,
        [policyId],
      )
    ).rows[0];
    if (!p) return { message: t.errState, values };

    await db.query(`UPDATE clan_policies SET status = $2, note = $3, decided_by = $4, decided_at = now() WHERE id = $1`, [
      policyId,
      approve ? "approved" : "rejected",
      approve ? null : note,
      admin.id,
    ]);
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id, details) VALUES ($1, $2, $3, $4, $5)`, [
      p.clan_id,
      admin.id,
      approve ? "policy.approved" : "policy.rejected",
      policyId,
      approve ? null : JSON.stringify({ note }),
    ]);
    const leader = await clanLeaderId(db, p.clan_id);
    if (leader) await notify(db, leader, approve ? "policy_approved" : "policy_rejected", { note }, "/clan/rules");
    if (approve) await notifyMany(db, await clanMemberIds(db, p.clan_id), "policy_new", { clan: p.clan_name }, "/member");
    return { success: "decided" };
  });

  if (!result?.success) return result;
  refresh();
  // The decided item leaves the queue, so confirm at the top of the page instead.
  redirect(`/admin/clans/rules?done=${approve ? "approved" : "declined"}`);
}

/** A member agrees to the clan's current rules. Agreeing to an old version does nothing. */
export async function agreePolicy(formData: FormData) {
  const me = await requireRole("member");
  const policyId = String(formData.get("policyId") ?? "");
  if (!UUID.test(policyId)) return;
  await query(
    `INSERT INTO clan_policy_agreements (policy_id, user_id)
     SELECT p.id, $2 FROM clan_policies p
      WHERE p.id = $1 AND p.clan_id = $3 AND p.status = 'approved'
        AND p.id = (SELECT id FROM clan_policies WHERE clan_id = $3 AND status = 'approved' ORDER BY decided_at DESC LIMIT 1)
     ON CONFLICT DO NOTHING`,
    [policyId, me.id, me.clanId],
  );
  revalidatePath("/member", "layout");
  revalidatePath("/clan", "layout");
}
