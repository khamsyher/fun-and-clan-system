"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { readUpload } from "@/lib/files";
import { audit, isPastDate, lockClan, parseKip, settleCarried, UUID_RE } from "@/lib/funds";
import { getT } from "@/lib/i18n/server";
import type { FormState } from "@/lib/definitions";

const refresh = () => {
  revalidatePath("/clan", "layout");
  revalidatePath("/member", "layout");
};

/**
 * A member uploads proof of a transfer for one of their own bills (unpaid or carried as debt)
 * or one of their own contribution dues. It waits for the leader's review.
 */
export async function uploadSlip(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole("member");
  const tt = await getT();
  const t = tt.slips;

  const target = String(formData.get("target") ?? "");
  const [kind, targetId] = target.split(":");
  const includeDebt = formData.get("includeDebt") === "on";
  const amount = parseKip(formData.get("amount"));
  const transferDate = String(formData.get("transferDate") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  const values = { target, amount: String(formData.get("amount") ?? ""), transferDate, note: note ?? "" };

  if (!["b", "d"].includes(kind) || !UUID_RE.test(targetId ?? "")) return { message: t.errTarget, values };
  const errors: Record<string, string[]> = {};
  if (!amount) errors.amount = [t.errAmount];
  if (!isPastDate(transferDate)) errors.transferDate = [t.errDate];
  const upload = await readUpload(formData.get("slip"));
  if (!upload.ok) {
    errors.slip = [upload.reason === "size" ? tt.settings.minutesSize : upload.reason === "type" ? tt.settings.minutesType : t.errFile];
  }
  if (Object.keys(errors).length || !upload.ok) return { errors, values };

  try {
    const ok = await transaction(async (db) => {
      // The target must be the member's own and still payable.
      const payable =
        kind === "b"
          ? await db.query(
              `SELECT 1 FROM event_bills b JOIN death_events e ON e.id = b.event_id
                WHERE b.id = $1 AND b.member_id = $2 AND b.clan_id = $3
                  AND (b.status = 'carried' OR (b.status = 'unpaid' AND e.status = 'collecting'))`,
              [targetId, me.id, me.clanId],
            )
          : await db.query(`SELECT 1 FROM contribution_dues WHERE id = $1 AND member_id = $2 AND clan_id = $3 AND status = 'unpaid'`, [
              targetId,
              me.id,
              me.clanId,
            ]);
      if (!payable.rowCount) return false;

      const file = await db.query<{ id: string }>(
        `INSERT INTO files (clan_id, uploaded_by, purpose, file_name, content_type, size_bytes, data)
         VALUES ($1, $2, 'slip', $3, $4, $5, $6) RETURNING id`,
        [me.clanId, me.id, upload.fileName, upload.contentType, upload.size, upload.data],
      );
      const slip = await db.query<{ id: string }>(
        `INSERT INTO payment_slips (clan_id, member_id, bill_id, due_id, include_debt, amount_claimed, transfer_date, note, file_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          me.clanId, me.id, kind === "b" ? targetId : null, kind === "d" ? targetId : null,
          kind === "b" && includeDebt, amount, transferDate, note, file.rows[0].id,
        ],
      );
      await audit(db, me.clanId, me.id, "slip.uploaded", slip.rows[0].id, { amount });
      return true;
    });
    if (!ok) return { message: t.errTarget, values };
  } catch (err) {
    // payment_slips_one_pending_*: a slip for this item is already waiting.
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "23505") return { message: t.errPending, values };
    throw err;
  }

  refresh();
  // The item switches to "slip waiting", so confirm at the top of the page instead.
  redirect("/member/payments?sent=1");
}

/** The leader approves a slip (which records the payment) or rejects it with a reason. */
export async function reviewSlip(_state: FormState, formData: FormData): Promise<FormState> {
  const leader = await requireRole("clan_admin");
  const t = (await getT()).slips;
  const slipId = String(formData.get("slipId") ?? "");
  const decision = formData.get("decision") === "approve" ? "approved" : "rejected";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  if (!UUID_RE.test(slipId)) return { message: t.errState };
  if (decision === "rejected" && !note) return { errors: { note: [t.errReason] } };

  const result = await transaction(async (db): Promise<FormState> => {
    await lockClan(db, leader.clanId!);
    const slip = (
      await db.query<{ id: string; member_id: string; bill_id: string | null; due_id: string | null; include_debt: boolean }>(
        `SELECT id, member_id, bill_id, due_id, include_debt FROM payment_slips
          WHERE id = $1 AND clan_id = $2 AND status = 'pending' FOR UPDATE`,
        [slipId, leader.clanId],
      )
    ).rows[0];
    if (!slip) return { message: t.errState };

    if (decision === "approved") {
      if (slip.bill_id) {
        const bill = (
          await db.query<{ id: string; amount: string; event_id: string; status: string; event_status: string }>(
            `SELECT b.id, b.amount, b.event_id, b.status, e.status AS event_status
               FROM event_bills b JOIN death_events e ON e.id = b.event_id
              WHERE b.id = $1 FOR UPDATE OF b`,
            [slip.bill_id],
          )
        ).rows[0];
        if (bill.status === "unpaid" && bill.event_status === "collecting") {
          await db.query(`UPDATE event_bills SET status = 'paid', paid_at = now(), paid_method = 'transfer', recorded_by = $2 WHERE id = $1`, [
            bill.id,
            leader.id,
          ]);
          await db.query(
            `INSERT INTO fund_ledger (clan_id, entry_type, amount, event_id, bill_id, slip_id, note, created_by)
             VALUES ($1, 'collection', $2, $3, $4, $5, 'slip', $6)`,
            [leader.clanId, bill.amount, bill.event_id, bill.id, slip.id, leader.id],
          );
          if (slip.include_debt) await settleCarried(db, leader.clanId!, leader.id, slip.member_id, "transfer", slip.id);
        } else if (bill.status === "carried" || (bill.status === "unpaid" && bill.event_status !== "collecting")) {
          // The collection closed after the upload: the bill is (or becomes) debt, so settle it as debt.
          if (bill.status === "unpaid") await db.query(`UPDATE event_bills SET status = 'carried' WHERE id = $1`, [bill.id]);
          await settleCarried(db, leader.clanId!, leader.id, slip.member_id, "transfer", slip.id);
        } else {
          return { message: t.errAlreadyPaid };
        }
      } else {
        const due = (
          await db.query<{ id: string; amount: string }>(
            `UPDATE contribution_dues SET status = 'paid', paid_at = now(), paid_method = 'transfer', recorded_by = $2
              WHERE id = $1 AND status = 'unpaid' RETURNING id, amount`,
            [slip.due_id, leader.id],
          )
        ).rows[0];
        if (!due) return { message: t.errAlreadyPaid };
        await db.query(
          `INSERT INTO fund_ledger (clan_id, entry_type, amount, due_id, slip_id, note, created_by)
           VALUES ($1, 'contribution', $2, $3, $4, 'slip', $5)`,
          [leader.clanId, due.amount, due.id, slip.id, leader.id],
        );
      }
    }

    await db.query(`UPDATE payment_slips SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4 WHERE id = $1`, [
      slip.id,
      decision,
      leader.id,
      note,
    ]);
    await audit(db, leader.clanId, leader.id, `slip.${decision}`, slip.id, note ? { note } : undefined);
    return { success: decision === "approved" ? t.approved : t.rejected };
  });

  if (result?.success) refresh();
  return result;
}
