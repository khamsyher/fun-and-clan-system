"use server";

import { revalidatePath } from "next/cache";
import { query, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { audit, lockClan, UUID_RE } from "@/lib/funds";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { FormState } from "@/lib/definitions";

const refresh = () => {
  revalidatePath("/clan", "layout");
  revalidatePath("/member", "layout");
};

/**
 * Opens a Mode A savings period and gives every active member a due at the clan's current
 * approved rate. The amount is copied and locked, like an event's rate.
 */
export async function openPeriod(_state: FormState, formData: FormData): Promise<FormState> {
  const leader = await requireRole("clan_admin");
  const t = (await getT()).contributions;
  const label = String(formData.get("label") ?? "").trim();
  const values = { label };

  const clan = (
    await query<{ fund_mode: "A" | "B"; contribution_amount: string; contribution_period: "monthly" | "yearly" | null; rate_version: number }>(
      `SELECT fund_mode, contribution_amount, contribution_period, rate_version FROM clans WHERE id = $1`,
      [leader.clanId],
    )
  )[0];
  if (clan.fund_mode !== "A" || !clan.contribution_period) return { message: t.errNotModeA, values };

  const valid = clan.contribution_period === "monthly" ? /^\d{4}-(0[1-9]|1[0-2])$/.test(label) : /^\d{4}$/.test(label);
  if (!valid || Number(label.slice(0, 4)) < 2000 || Number(label.slice(0, 4)) > new Date().getFullYear() + 1) {
    return { errors: { label: [clan.contribution_period === "monthly" ? t.errLabelMonth : t.errLabelYear] }, values };
  }

  try {
    const count = await transaction(async (db) => {
      await lockClan(db, leader.clanId!);
      const period = await db.query<{ id: string }>(
        `INSERT INTO contribution_periods (clan_id, label, period_type, amount, rate_version, opened_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [leader.clanId, label, clan.contribution_period, clan.contribution_amount, clan.rate_version, leader.id],
      );
      const dues = await db.query(
        `INSERT INTO contribution_dues (clan_id, period_id, member_id, amount)
         SELECT $1, $2, id, $3 FROM users
          WHERE clan_id = $1 AND role = 'member' AND status = 'active' AND deceased_at IS NULL`,
        [leader.clanId, period.rows[0].id, clan.contribution_amount],
      );
      await audit(db, leader.clanId, leader.id, "contribution.period_opened", period.rows[0].id, { label });
      return dues.rowCount ?? 0;
    });
    refresh();
    return { success: fmt(t.opened, { label, n: count }) };
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "23505") {
      return { errors: { label: [t.errExists] }, values };
    }
    throw err;
  }
}

/** Adds dues for members approved after the period was opened. */
export async function addMissingMembers(formData: FormData) {
  const leader = await requireRole("clan_admin");
  const periodId = String(formData.get("periodId") ?? "");
  if (!UUID_RE.test(periodId)) return;
  await transaction(async (db) => {
    await lockClan(db, leader.clanId!);
    const added = await db.query(
      `INSERT INTO contribution_dues (clan_id, period_id, member_id, amount)
       SELECT p.clan_id, p.id, u.id, p.amount
         FROM contribution_periods p
         JOIN users u ON u.clan_id = p.clan_id AND u.role = 'member' AND u.status = 'active' AND u.deceased_at IS NULL
        WHERE p.id = $1 AND p.clan_id = $2
       ON CONFLICT (period_id, member_id) DO NOTHING`,
      [periodId, leader.clanId],
    );
    if (added.rowCount) await audit(db, leader.clanId, leader.id, "contribution.members_added", periodId, { n: added.rowCount });
  });
  refresh();
}

/** Leader records a contribution paid in cash or by transfer (without a slip). */
export async function recordDuePayment(_state: FormState, formData: FormData): Promise<FormState> {
  const leader = await requireRole("clan_admin");
  const t = (await getT()).events;
  const dueId = String(formData.get("dueId") ?? "");
  const method = formData.get("method") === "transfer" ? "transfer" : "cash";
  if (!UUID_RE.test(dueId)) return { message: t.errState };

  const ok = await transaction(async (db) => {
    await lockClan(db, leader.clanId!);
    const due = (
      await db.query<{ id: string; amount: string }>(
        `UPDATE contribution_dues SET status = 'paid', paid_at = now(), paid_method = $3, recorded_by = $4
          WHERE id = $1 AND clan_id = $2 AND status = 'unpaid'
          RETURNING id, amount`,
        [dueId, leader.clanId, method, leader.id],
      )
    ).rows[0];
    if (!due) return false;
    await db.query(
      `INSERT INTO fund_ledger (clan_id, entry_type, amount, due_id, note, created_by) VALUES ($1, 'contribution', $2, $3, $4, $5)`,
      [leader.clanId, due.amount, due.id, method, leader.id],
    );
    await audit(db, leader.clanId, leader.id, "contribution.paid", due.id, { method });
    return true;
  });
  if (!ok) return { message: t.errState };
  refresh();
  return { success: "ok" };
}

/** Reverses a contribution recorded by mistake (a negative ledger entry; the ledger is append-only). */
export async function undoDuePayment(_state: FormState, formData: FormData): Promise<FormState> {
  const leader = await requireRole("clan_admin");
  const t = (await getT()).events;
  const dueId = String(formData.get("dueId") ?? "");
  if (!UUID_RE.test(dueId)) return { message: t.errState };

  const ok = await transaction(async (db) => {
    await lockClan(db, leader.clanId!);
    // A due paid through an approved slip is not undone here; that would contradict the slip record.
    const due = (
      await db.query<{ id: string; amount: string }>(
        `UPDATE contribution_dues d SET status = 'unpaid', paid_at = NULL, paid_method = NULL, recorded_by = $3
          WHERE d.id = $1 AND d.clan_id = $2 AND d.status = 'paid'
            AND NOT EXISTS (SELECT 1 FROM payment_slips s WHERE s.due_id = d.id AND s.status = 'approved')
          RETURNING d.id, d.amount`,
        [dueId, leader.clanId, leader.id],
      )
    ).rows[0];
    if (!due) return false;
    await db.query(
      `INSERT INTO fund_ledger (clan_id, entry_type, amount, due_id, note, created_by) VALUES ($1, 'adjustment', $2, $3, 'undo contribution', $4)`,
      [leader.clanId, -Number(due.amount), due.id, leader.id],
    );
    await audit(db, leader.clanId, leader.id, "contribution.payment_undone", due.id);
    return true;
  });
  if (!ok) return { message: t.errState };
  refresh();
  return { success: "ok" };
}
