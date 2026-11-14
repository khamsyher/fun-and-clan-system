"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { readUpload } from "@/lib/files";
import { audit, availableForPayout, feeFor, fundBalance, lockClan, parseKip, UUID_RE } from "@/lib/funds";
import { clanLeaderId, clanMemberIds, clanTreasurerIds, notify, notifyMany } from "@/lib/notify";
import { formatKip } from "@/lib/format";
import { isStaffRole, STAFF_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import type { FormState } from "@/lib/definitions";

async function payoutOperator(formData: FormData) {
  const user = await requireRole("clan_admin", ...STAFF_ROLES);
  const clanId = user.role === "clan_admin" ? user.clanId ?? "" : String(formData.get("clanId") ?? "");
  if (!UUID_RE.test(clanId)) return null;
  return { user, clanId };
}

const refresh = () => {
  revalidatePath("/clan", "layout");
  revalidatePath("/member", "layout");
  revalidatePath("/admin/events", "layout");
  revalidatePath("/admin");
};

/** Step 1 — the clan leader asks for a payout to the bereaved family. */
export async function requestPayout(_state: FormState, formData: FormData): Promise<FormState> {
  const scope = await payoutOperator(formData);
  const t = (await getT()).events;
  if (!scope) return { message: t.errState };
  const { user: leader, clanId } = scope;

  const eventId = String(formData.get("eventId") ?? "");
  const amount = parseKip(formData.get("amount"));
  const receiverName = String(formData.get("receiverName") ?? "").trim().replace(/\s+/g, " ").slice(0, 150);
  const receiverPhone = String(formData.get("receiverPhone") ?? "").replace(/[\s-]/g, "").slice(0, 20) || null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  const values = {
    amount: String(formData.get("amount") ?? ""),
    receiverName,
    receiverPhone: receiverPhone ?? "",
    note: note ?? "",
  };
  if (!UUID_RE.test(eventId)) return { message: t.errState, values };

  const errors: Record<string, string[]> = {};
  if (!amount) errors.amount = [t.errAmount];
  if (receiverName.length < 2) errors.receiverName = [t.errReceiver];
  if (Object.keys(errors).length) return { errors, values };

  return transaction(async (db) => {
    await lockClan(db, clanId);
    const treasurers = await db.query(
      `SELECT 1 FROM users WHERE clan_id = $1 AND is_treasurer AND status = 'active' AND role = 'member' LIMIT 1`,
      [clanId],
    );
    if (!treasurers.rowCount) return { message: t.needsTreasurer, values };

    const event = (
      await db.query<{ fund_mode: "A" | "B"; platform_fee_percent: string }>(
        `SELECT fund_mode, platform_fee_percent FROM death_events e
          WHERE id = $1 AND clan_id = $2 AND status = 'awaiting_payout'
            AND NOT EXISTS (SELECT 1 FROM payouts p WHERE p.event_id = e.id AND p.status <> 'rejected')
          FOR UPDATE`,
        [eventId, clanId],
      )
    ).rows[0];
    if (!event) return { message: t.errState, values };

    // Mode A payouts also trigger the platform fee out of the fund, so both must fit.
    const needed = amount! + (event.fund_mode === "A" ? feeFor(amount!, event.platform_fee_percent) : 0);
    if (needed > (await availableForPayout(db, clanId))) return { errors: { amount: [t.errAmount] }, values };

    const payout = await db.query<{ id: string }>(
      `INSERT INTO payouts (clan_id, event_id, amount, receiver_name, receiver_phone, note, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [clanId, eventId, amount, receiverName, receiverPhone, note, leader.id],
    );
    await audit(db, clanId, leader.id, "payout.requested", payout.rows[0].id, { amount, event_id: eventId });
    await notifyMany(db, await clanTreasurerIds(db, clanId), "payout_requested", {
      name: leader.fullName,
      amount: formatKip(amount!),
    }, "/member/approvals");
    refresh();
    return { success: "ok" };
  });
}

/** Step 2 — a treasurer (a different person from the leader) approves or rejects. */
export async function decidePayout(_state: FormState, formData: FormData): Promise<FormState> {
  const treasurer = await requireRole("member", ...STAFF_ROLES);
  const t = (await getT()).approvals;
  const clanId = isStaffRole(treasurer.role) ? String(formData.get("clanId") ?? "") : treasurer.clanId ?? "";
  if (!UUID_RE.test(clanId)) return { message: t.errFunds };
  if (treasurer.role === "member" && !treasurer.isTreasurer) return { message: t.errFunds };

  const payoutId = String(formData.get("payoutId") ?? "");
  const decision = formData.get("decision") === "approve" ? "approved" : "rejected";
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!UUID_RE.test(payoutId)) return { message: t.errFunds };
  if (decision === "rejected" && !note) return { errors: { note: [t.errNote] }, values: { note: "" } };

  const result = await transaction(async (db): Promise<FormState | { eventId: string }> => {
    await lockClan(db, clanId);
    const payout = (
      await db.query<{ id: string; amount: string; event_id: string; fund_mode: "A" | "B"; platform_fee_percent: string }>(
        `SELECT p.id, p.amount, p.event_id, e.fund_mode, e.platform_fee_percent
           FROM payouts p JOIN death_events e ON e.id = p.event_id
          WHERE p.id = $1 AND p.clan_id = $2 AND p.status = 'requested' AND p.requested_by <> $3
          FOR UPDATE OF p`,
        [payoutId, clanId, treasurer.id],
      )
    ).rows[0];
    if (!payout) return { message: t.errFunds };

    if (decision === "approved") {
      const amount = Number(payout.amount);
      const needed = amount + (payout.fund_mode === "A" ? feeFor(amount, payout.platform_fee_percent) : 0);
      if (needed > (await availableForPayout(db, clanId, payout.id))) return { message: t.errFunds };
    }

    await db.query(
      `UPDATE payouts SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1`,
      [payout.id, decision, treasurer.id, note],
    );
    await audit(db, clanId, treasurer.id, `payout.${decision}`, payout.id, note ? { note } : undefined);
    const leaderId = await clanLeaderId(db, clanId);
    if (leaderId) {
      await notify(
        db,
        leaderId,
        decision === "approved" ? "payout_approved" : "payout_rejected",
        decision === "approved" ? { name: treasurer.fullName, amount: formatKip(payout.amount) } : { name: treasurer.fullName, note: note ?? "" },
        `/clan/events/${payout.event_id}`,
      );
    }
    return { eventId: payout.event_id };
  });
  if (!result || !("eventId" in result)) return result;
  refresh();
  // The decided payout leaves the waiting list, so confirm on the page itself.
  if (isStaffRole(treasurer.role)) redirect(`/admin/events/${result.eventId}?done=${decision}`);
  redirect(`/member/approvals?done=${decision}`);
}

/** Step 3 — the leader records that the approved amount was handed to the family. */
export async function markPayoutPaid(_state: FormState, formData: FormData): Promise<FormState> {
  const scope = await payoutOperator(formData);
  const tt = await getT();
  const t = tt.events;
  if (!scope) return { message: t.errState };
  const { user: leader, clanId } = scope;

  const payoutId = String(formData.get("payoutId") ?? "");
  const method = formData.get("method") === "transfer" ? "transfer" : "cash";
  if (!UUID_RE.test(payoutId)) return { message: t.errState };

  const file = formData.get("proof");
  const hasFile = file && typeof file !== "string" && file.size > 0;
  const upload = hasFile ? await readUpload(file) : null;
  if (upload && !upload.ok) {
    return { errors: { proof: [upload.reason === "size" ? tt.settings.minutesSize : tt.settings.minutesType] } };
  }

  return transaction(async (db) => {
    await lockClan(db, clanId);
    const payout = (
      await db.query<{ id: string; amount: string; event_id: string; fund_mode: "A" | "B"; platform_fee_percent: string }>(
        `SELECT p.id, p.amount, p.event_id, e.fund_mode, e.platform_fee_percent
           FROM payouts p JOIN death_events e ON e.id = p.event_id
          WHERE p.id = $1 AND p.clan_id = $2 AND p.status = 'approved' AND e.status = 'awaiting_payout'
          FOR UPDATE OF p`,
        [payoutId, clanId],
      )
    ).rows[0];
    if (!payout) return { message: t.errState };

    const amount = Number(payout.amount);
    const fee = payout.fund_mode === "A" ? feeFor(amount, payout.platform_fee_percent) : 0;
    if (amount + fee > (await fundBalance(db, clanId))) return { message: t.errAmount };

    let proofId: string | null = null;
    if (upload?.ok) {
      proofId = (
        await db.query<{ id: string }>(
          `INSERT INTO files (clan_id, uploaded_by, purpose, file_name, content_type, size_bytes, data)
           VALUES ($1, $2, 'payout_proof', $3, $4, $5, $6) RETURNING id`,
          [clanId, leader.id, upload.fileName, upload.contentType, upload.size, upload.data],
        )
      ).rows[0].id;
    }

    await db.query(
      `UPDATE payouts SET status = 'paid', paid_by = $2, paid_at = now(), paid_method = $3, proof_file_id = $4 WHERE id = $1`,
      [payout.id, leader.id, method, proofId],
    );
    await db.query(
      `INSERT INTO fund_ledger (clan_id, entry_type, amount, event_id, payout_id, note, created_by)
       VALUES ($1, 'payout', $2, $3, $4, $5, $6)`,
      [clanId, -amount, payout.event_id, payout.id, method, leader.id],
    );
    // Mode A: the platform fee is taken on the amount paid out of the central fund.
    if (payout.fund_mode === "A") {
      await db.query(
        `INSERT INTO platform_fees (clan_id, event_id, percent, base_amount, fee_amount) VALUES ($1, $2, $3, $4, $5)`,
        [clanId, payout.event_id, payout.platform_fee_percent, amount, fee],
      );
      if (fee > 0) {
        await db.query(
          `INSERT INTO fund_ledger (clan_id, entry_type, amount, event_id, note, created_by)
           VALUES ($1, 'platform_fee', $2, $3, $4, $5)`,
          [clanId, -fee, payout.event_id, `${payout.platform_fee_percent}%`, leader.id],
        );
      }
      await db.query(`UPDATE death_events SET fee_amount = $2 WHERE id = $1`, [payout.event_id, fee]);
    }
    await db.query(`UPDATE death_events SET status = 'completed', completed_at = now() WHERE id = $1`, [payout.event_id]);
    await audit(db, clanId, leader.id, "payout.paid", payout.id, { amount, fee, method });
    // Everyone who contributed can see where the money went.
    const receiver = (await db.query<{ receiver_name: string }>(`SELECT receiver_name FROM payouts WHERE id = $1`, [payout.id])).rows[0];
    await notifyMany(db, await clanMemberIds(db, clanId), "payout_paid", {
      amount: formatKip(amount),
      receiver: receiver.receiver_name,
    }, `/member/events/${payout.event_id}`);
    refresh();
    return { success: "ok" };
  });
}
