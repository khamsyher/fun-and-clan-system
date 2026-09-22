"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/dal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DECISIONS = {
  approve: { from: ["pending", "rejected"], to: "active", action: "member.approved" },
  reject: { from: ["pending"], to: "rejected", action: "member.rejected" },
  disable: { from: ["active"], to: "disabled", action: "member.disabled" },
  enable: { from: ["disabled"], to: "active", action: "member.enabled" },
} as const;

/**
 * Changes a member's status. Scoped to the leader's own clan_id, so a leader can
 * never touch another clan's members even with a forged member id.
 */
export async function decideMember(formData: FormData) {
  const leader = await requireRole("clan_admin");
  const memberId = String(formData.get("memberId"));
  const decision = DECISIONS[String(formData.get("decision")) as keyof typeof DECISIONS];
  if (!decision || !UUID.test(memberId)) return;

  const updated = await query<{ id: string }>(
    `UPDATE users
        SET status = $3::user_status,
            approved_by = CASE WHEN $3::user_status = 'active' THEN $4::uuid ELSE approved_by END,
            approved_at = CASE WHEN $3::user_status = 'active' THEN now() ELSE approved_at END,
            updated_at = now()
      WHERE id = $1 AND clan_id = $2 AND role = 'member' AND status = ANY($5::user_status[])
      RETURNING id`,
    [memberId, leader.clanId, decision.to, leader.id, decision.from],
  );

  if (updated.length) {
    await query(
      `INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, $3, $4)`,
      [leader.clanId, leader.id, decision.action, memberId],
    );
  }
  revalidatePath("/clan");
}
