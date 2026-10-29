"use server";

import { revalidatePath } from "next/cache";
import { transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import type { FormState } from "@/lib/definitions";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { lockedRoom } from "@/lib/member-limit";
import { direct, notify } from "@/lib/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DECISIONS = {
  approve: { from: ["pending", "rejected"], to: "active", action: "member.approved" },
  reject: { from: ["pending"], to: "rejected", action: "member.rejected" },
  disable: { from: ["active"], to: "disabled", action: "member.disabled" },
  enable: { from: ["disabled"], to: "active", action: "member.enabled" },
} as const;

/**
 * Changes a member's status. Scoped to the leader's own clan_id, so a leader can
 * never touch another clan's members even with a forged member id. Making someone active
 * (approving, re-enabling) respects the clan's member limit, counted under a lock.
 */
export async function decideMember(formData: FormData) {
  const leader = await requireRole("clan_admin");
  const memberId = String(formData.get("memberId"));
  const decision = DECISIONS[String(formData.get("decision")) as keyof typeof DECISIONS];
  if (!decision || !UUID.test(memberId)) return;

  const done = await transaction(async (db) => {
    // The page hides these buttons when the clan is full; this is the check that counts.
    if (decision.to === "active" && (await lockedRoom(db, leader.clanId!)).full) return false;

    const updated = await db.query<{ id: string }>(
      `UPDATE users
          SET status = $3::user_status,
              approved_by = CASE WHEN $3::user_status = 'active' THEN $4::uuid ELSE approved_by END,
              approved_at = CASE WHEN $3::user_status = 'active' THEN now() ELSE approved_at END,
              updated_at = now()
        WHERE id = $1 AND clan_id = $2 AND role = 'member' AND status = ANY($5::user_status[])
        RETURNING id`,
      [memberId, leader.clanId, decision.to, leader.id, decision.from],
    );
    if (!updated.rowCount) return false;
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, $3, $4)`, [
      leader.clanId,
      leader.id,
      decision.action,
      memberId,
    ]);
    return true;
  });

  if (done) {
    if (decision.action === "member.approved") {
      await notify(direct, memberId, "member_approved", { clan: leader.clanName ?? "" }, "/member");
    } else if (decision.action === "member.rejected") {
      await notify(direct, memberId, "member_rejected", {}, "/login");
    }
  }
  revalidatePath("/clan", "layout");
}

/**
 * The leader caps how many members the clan takes, or removes the cap (empty). A limit below
 * today's count is allowed — nobody is removed; new people just can't be approved until the
 * number drops below it.
 */
export async function setMemberLimit(_state: FormState, formData: FormData): Promise<FormState> {
  const leader = await requireRole("clan_admin");
  const t = (await getT()).clanMembers;
  const raw = String(formData.get("limit") ?? "").trim().replace(/[\s,]/g, "");
  const values = { limit: raw };
  const limit = raw === "" ? null : Number(raw);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100000)) return { errors: { limit: [t.limitErr] }, values };

  const active = await transaction(async (db) => {
    const room = await lockedRoom(db, leader.clanId!);
    await db.query(`UPDATE clans SET member_limit = $2, updated_at = now() WHERE id = $1`, [leader.clanId, limit]);
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, details) VALUES ($1, $2, 'clan.member_limit', $3)`, [
      leader.clanId,
      leader.id,
      JSON.stringify({ from: room.limit, to: limit }),
    ]);
    return room.active;
  });

  revalidatePath("/clan", "layout");
  revalidatePath("/admin", "layout");
  if (limit === null) return { success: t.limitRemoved, values: { limit: "" } };
  return { success: active > limit ? fmt(t.limitBelow, { n: active, limit }) : fmt(t.limitSaved, { limit }), values };
}
