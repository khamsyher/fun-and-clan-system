"use server";

import { revalidatePath } from "next/cache";
import { query, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { audit, lockClan, parseKip, settleCarried, UUID_RE } from "@/lib/funds";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { formatKip } from "@/lib/format";
import type { FormState } from "@/lib/definitions";

/** Money received into the central fund (e.g. Mode A savings, an opening balance). */
export async function recordDeposit(_state: FormState, formData: FormData): Promise<FormState> {
  const leader = await requireRole("clan_admin");
  const t = (await getT()).fund;
  const amount = parseKip(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const values = { amount: String(formData.get("amount") ?? ""), note };

  const errors: Record<string, string[]> = {};
  if (!amount) errors.amount = [t.errAmount];
  if (note.length < 2) errors.note = [t.errNote];
  if (Object.keys(errors).length) return { errors, values };

  await transaction(async (db) => {
    await lockClan(db, leader.clanId!);
    await db.query(
      `INSERT INTO fund_ledger (clan_id, entry_type, amount, note, created_by) VALUES ($1, 'deposit', $2, $3, $4)`,
      [leader.clanId, amount, note, leader.id],
    );
    await audit(db, leader.clanId, leader.id, "fund.deposit", null, { amount });
  });
  revalidatePath("/clan", "layout");
  return { success: fmt(t.deposited, { amount: formatKip(amount!) }) };
}

/** A member pays off debt carried from earlier events. */
export async function settleMemberDebt(_state: FormState, formData: FormData): Promise<FormState> {
  const leader = await requireRole("clan_admin");
  const t = (await getT()).fund;
  const memberId = String(formData.get("memberId") ?? "");
  const method = formData.get("method") === "transfer" ? "transfer" : "cash";
  if (!UUID_RE.test(memberId)) return undefined;

  const result = await transaction(async (db) => {
    await lockClan(db, leader.clanId!);
    const member = (
      await db.query<{ full_name: string }>(`SELECT full_name FROM users WHERE id = $1 AND clan_id = $2 AND role = 'member'`, [
        memberId,
        leader.clanId,
      ])
    ).rows[0];
    if (!member) return null;
    const total = await settleCarried(db, leader.clanId!, leader.id, memberId, method);
    if (!total) return null;
    await audit(db, leader.clanId, leader.id, "debt.settled", memberId, { total, method });
    return { name: member.full_name, total };
  });
  if (!result) return undefined;
  revalidatePath("/clan", "layout");
  revalidatePath("/member", "layout");
  return { success: fmt(t.settled, { name: result.name, amount: formatKip(result.total) }) };
}

/** The leader names (or removes) treasurers: members who give the second approval on payouts. */
export async function setTreasurer(formData: FormData) {
  const leader = await requireRole("clan_admin");
  const memberId = String(formData.get("memberId") ?? "");
  const on = formData.get("on") === "true";
  if (!UUID_RE.test(memberId)) return;
  const updated = await query(
    `UPDATE users SET is_treasurer = $3, updated_at = now()
      WHERE id = $1 AND clan_id = $2 AND role = 'member' AND (NOT $3 OR status = 'active')
      RETURNING id`,
    [memberId, leader.clanId, on],
  );
  if (updated.length) {
    await query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, $3, $4)`, [
      leader.clanId,
      leader.id,
      on ? "treasurer.assigned" : "treasurer.removed",
      memberId,
    ]);
  }
  revalidatePath("/clan", "layout");
}
