"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { queryOne, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { readUpload, type UploadCheck } from "@/lib/files";
import { feeFor, isPastDate, parseKip, UUID_RE } from "@/lib/funds";
import { formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { notify, notifyMany } from "@/lib/notify";
import { canRemind, canSwapRound, isCompleteOrder, isTodayOrLater, makeInviteCode, normalizeInviteCode, shuffled, todayInLaos } from "@/lib/savings-rules";
import { DONOR_ROLES, type FormState } from "@/lib/definitions";

const refresh = () => revalidatePath("/savings", "layout");

type Dict = Awaited<ReturnType<typeof getT>>["savings"];
type Db = Pick<PoolClient, "query">;

/** Savings files belong to no clan: who may open them is decided by the group (see app/files/[id]/route.ts). */
async function storeFile(db: PoolClient, userId: string, purpose: "savings_slip" | "savings_qr", upload: UploadCheck) {
  if (!upload.ok) return null;
  const r = await db.query<{ id: string }>(
    `INSERT INTO files (clan_id, uploaded_by, purpose, file_name, content_type, size_bytes, data)
     VALUES (NULL, $1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, purpose, upload.fileName, upload.contentType, upload.size, upload.data],
  );
  return r.rows[0].id;
}

async function audit(db: Db, actorId: string, action: string, targetId: string, details?: Record<string, unknown>) {
  await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id, details) VALUES (NULL, $1, $2, $3, $4)`, [
    actorId,
    action,
    targetId,
    details ? JSON.stringify(details) : null,
  ]);
}

type LockedGroup = { id: string; organizer_id: string; status: string; name: string; amount: string; period: string; start_date: string };

/** Every action that changes a group takes this lock first, so two people can't act on it at once. */
async function lockGroup(db: PoolClient, groupId: string) {
  const r = await db.query<LockedGroup>(
    `SELECT id, organizer_id, status, name, amount, period, to_char(start_date, 'YYYY-MM-DD') AS start_date
       FROM savings_groups WHERE id = $1 FOR UPDATE`,
    [groupId],
  );
  return r.rows[0] ?? null;
}

/** Where a member receives their pot: an account, a QR image, or both. */
async function readReceiving(formData: FormData, t: Dict, keepsQr = false) {
  const bankName = String(formData.get("bankName") ?? "").trim().slice(0, 100) || null;
  const accountName = String(formData.get("accountName") ?? "").trim().slice(0, 150) || null;
  const accountNumber = String(formData.get("accountNumber") ?? "").trim().slice(0, 50) || null;
  const qr = await readUpload(formData.get("qr"));
  const errors: Record<string, string[]> = {};
  // A QR is shown in an <img>, so a PDF is no use here.
  if ((!qr.ok && qr.reason !== "missing") || (qr.ok && qr.contentType === "application/pdf")) errors.qr = [t.errFile];
  else if (!(accountName && accountNumber) && !qr.ok && !keepsQr) errors.accountNumber = [t.errReceiving];
  return {
    errors,
    qr,
    fields: { bankName, accountName, accountNumber },
    values: { bankName: bankName ?? "", accountName: accountName ?? "", accountNumber: accountNumber ?? "" },
  };
}

function readGroupFields(formData: FormData, t: Dict) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const description = String(formData.get("description") ?? "").trim().slice(0, 1000) || null;
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = parseKip(amountRaw);
  const periodRaw = String(formData.get("period") ?? "");
  const period = periodRaw === "weekly" || periodRaw === "monthly" ? periodRaw : null;
  const startDate = String(formData.get("startDate") ?? "").trim();
  const errors: Record<string, string[]> = {};
  if (name.length < 3) errors.name = [t.errName];
  if (!amount) errors.amount = [t.errAmount];
  if (!period) errors.period = [t.errPeriod];
  if (!isTodayOrLater(startDate, todayInLaos())) errors.startDate = [t.errStartDate];
  return {
    errors,
    fields: { name, description, amount, period, startDate },
    values: { name, description: description ?? "", amount: amountRaw, period: periodRaw, startDate },
  };
}

/** Anyone signed in (not the platform owner) starts a group; they are its first member and take turn 1. */
export async function createGroup(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const group = readGroupFields(formData, t);
  const receiving = await readReceiving(formData, t);
  const values = { ...group.values, ...receiving.values };
  const errors = { ...group.errors, ...receiving.errors };
  if (Object.keys(errors).length) return { errors, values };
  const f = group.fields;
  const r = receiving.fields;

  const id = await transaction(async (db) => {
    let groupId: string | null = null;
    // A clash on the 6-character code is rare; try a few fresh codes before giving up.
    for (let i = 0; i < 5 && !groupId; i++) {
      const g = await db.query<{ id: string }>(
        `INSERT INTO savings_groups (organizer_id, name, description, amount, period, start_date, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (invite_code) DO NOTHING RETURNING id`,
        [me.id, f.name, f.description, f.amount, f.period, f.startDate, makeInviteCode()],
      );
      groupId = g.rows[0]?.id ?? null;
    }
    if (!groupId) throw new Error("Could not create a unique invite code");
    const qrId = await storeFile(db, me.id, "savings_qr", receiving.qr);
    await db.query(
      `INSERT INTO savings_members (group_id, user_id, status, turn_no, bank_name, account_name, account_number, qr_file_id, decided_at)
       VALUES ($1, $2, 'approved', 1, $3, $4, $5, $6, now())`,
      [groupId, me.id, r.bankName, r.accountName, r.accountNumber, qrId],
    );
    await audit(db, me.id, "savings.created", groupId, { amount: f.amount, period: f.period });
    return groupId;
  });

  refresh();
  redirect(`/savings/${id}`);
}

/**
 * The organizer changes the settings while the group is still forming. Once someone else has
 * been approved, they agreed to an amount and a frequency, so those two can no longer change.
 */
export async function updateGroup(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const groupId = String(formData.get("groupId") ?? "");
  const group = readGroupFields(formData, t);
  const values = group.values;
  if (!UUID_RE.test(groupId)) return { message: t.errState, values };
  if (Object.keys(group.errors).length) return { errors: group.errors, values };
  const f = group.fields;

  const refused = await transaction(async (db): Promise<FormState | null> => {
    const g = await lockGroup(db, groupId);
    if (!g || g.organizer_id !== me.id || g.status !== "forming") return { message: t.errState, values };
    const others = (
      await db.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM savings_members WHERE group_id = $1 AND status = 'approved' AND user_id <> $2`,
        [groupId, me.id],
      )
    ).rows[0].n;
    if (others > 0 && (Number(g.amount) !== f.amount || g.period !== f.period)) {
      return { errors: { amount: [t.errTermsLocked] }, values };
    }
    await db.query(`UPDATE savings_groups SET name = $2, description = $3, amount = $4, period = $5, start_date = $6 WHERE id = $1`, [
      groupId,
      f.name,
      f.description,
      f.amount,
      f.period,
      f.startDate,
    ]);
    await audit(db, me.id, "savings.updated", groupId);
    return null;
  });
  if (refused) return refused;
  refresh();
  redirect(`/savings/${groupId}?saved=1`);
}

/** Only while forming: once money has moved, a group runs to the end. */
export async function cancelGroup(formData: FormData) {
  const me = await requireRole(...DONOR_ROLES);
  const groupId = String(formData.get("groupId") ?? "");
  if (!UUID_RE.test(groupId)) return;
  await transaction(async (db) => {
    const g = await lockGroup(db, groupId);
    if (!g || g.organizer_id !== me.id || g.status !== "forming") return;
    await db.query(`UPDATE savings_groups SET status = 'cancelled' WHERE id = $1`, [groupId]);
    const others = await db.query<{ user_id: string }>(
      `SELECT user_id FROM savings_members WHERE group_id = $1 AND status IN ('pending', 'approved') AND user_id <> $2`,
      [groupId, me.id],
    );
    await notifyMany(db, others.rows.map((x) => x.user_id), "savings_cancelled", { group: g.name }, "/savings");
    await audit(db, me.id, "savings.cancelled", groupId);
  });
  refresh();
  redirect("/savings");
}

/** Someone with the code asks to join. A person declined or removed earlier may ask again. */
export async function requestToJoin(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const code = normalizeInviteCode(String(formData.get("code") ?? ""));
  const receiving = await readReceiving(formData, t);
  if (!code) return { message: t.errCode, values: receiving.values };
  if (Object.keys(receiving.errors).length) return { errors: receiving.errors, values: receiving.values };
  const r = receiving.fields;

  const result = await transaction(async (db): Promise<{ ok: true; id: string } | { ok: false; state: FormState }> => {
    const g = (
      await db.query<{ id: string; organizer_id: string; name: string }>(
        `SELECT id, organizer_id, name FROM savings_groups WHERE invite_code = $1 AND status = 'forming' FOR UPDATE`,
        [code],
      )
    ).rows[0];
    if (!g) return { ok: false, state: { message: t.errCode, values: receiving.values } };
    const existing = (
      await db.query<{ id: string; status: string }>(`SELECT id, status FROM savings_members WHERE group_id = $1 AND user_id = $2`, [g.id, me.id])
    ).rows[0];
    if (existing && (existing.status === "pending" || existing.status === "approved")) {
      return { ok: false, state: { message: t.errAlready, values: receiving.values } };
    }
    const qrId = await storeFile(db, me.id, "savings_qr", receiving.qr);
    if (existing) {
      await db.query(
        `UPDATE savings_members SET status = 'pending', turn_no = NULL, bank_name = $2, account_name = $3, account_number = $4,
                qr_file_id = $5, joined_at = now(), decided_at = NULL
          WHERE id = $1`,
        [existing.id, r.bankName, r.accountName, r.accountNumber, qrId],
      );
    } else {
      await db.query(
        `INSERT INTO savings_members (group_id, user_id, bank_name, account_name, account_number, qr_file_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [g.id, me.id, r.bankName, r.accountName, r.accountNumber, qrId],
      );
    }
    await audit(db, me.id, "savings.join_requested", g.id);
    await notify(db, g.organizer_id, "savings_join_request", { name: me.fullName, group: g.name }, `/savings/${g.id}`);
    return { ok: true, id: g.id };
  });

  if (!result.ok) return result.state;
  refresh();
  redirect(`/savings/${result.id}`);
}

/** The organizer approves (they get the next turn) or declines a request. */
export async function decideMember(formData: FormData) {
  const me = await requireRole(...DONOR_ROLES);
  const memberId = String(formData.get("memberId") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!UUID_RE.test(memberId)) return;
  await transaction(async (db) => {
    const m = (
      await db.query<{ group_id: string; user_id: string; group_name: string }>(
        `SELECT m.group_id, m.user_id, g.name AS group_name
           FROM savings_members m JOIN savings_groups g ON g.id = m.group_id
          WHERE m.id = $1 AND m.status = 'pending' AND g.organizer_id = $2 AND g.status = 'forming'
          FOR UPDATE OF g, m`,
        [memberId, me.id],
      )
    ).rows[0];
    if (!m) return;
    if (approve) {
      await db.query(
        `UPDATE savings_members SET status = 'approved', decided_at = now(),
                turn_no = (SELECT COALESCE(MAX(turn_no), 0) + 1 FROM savings_members WHERE group_id = $2)
          WHERE id = $1`,
        [memberId, m.group_id],
      );
    } else {
      await db.query(`UPDATE savings_members SET status = 'declined', decided_at = now(), turn_no = NULL WHERE id = $1`, [memberId]);
    }
    await audit(db, me.id, approve ? "savings.member_approved" : "savings.member_declined", memberId);
    await notify(
      db,
      m.user_id,
      approve ? "savings_join_approved" : "savings_join_declined",
      { group: m.group_name },
      approve ? `/savings/${m.group_id}` : "/savings",
    );
  });
  refresh();
}

/** Closes the gaps in the turn numbers after someone leaves the order. */
async function renumber(db: PoolClient, groupId: string) {
  await db.query(
    `UPDATE savings_members m SET turn_no = x.rn
       FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY turn_no NULLS LAST, joined_at) AS rn
               FROM savings_members WHERE group_id = $1 AND status = 'approved') x
      WHERE m.id = x.id`,
    [groupId],
  );
}

/** Takes an approved member out while forming. The organizer cannot remove themself. */
export async function removeMember(formData: FormData) {
  const me = await requireRole(...DONOR_ROLES);
  const memberId = String(formData.get("memberId") ?? "");
  if (!UUID_RE.test(memberId)) return;
  await transaction(async (db) => {
    const m = (
      await db.query<{ group_id: string }>(
        `SELECT m.group_id FROM savings_members m JOIN savings_groups g ON g.id = m.group_id
          WHERE m.id = $1 AND m.status = 'approved' AND m.user_id <> $2 AND g.organizer_id = $2 AND g.status = 'forming'
          FOR UPDATE OF g, m`,
        [memberId, me.id],
      )
    ).rows[0];
    if (!m) return;
    await db.query(`UPDATE savings_members SET status = 'removed', turn_no = NULL, decided_at = now() WHERE id = $1`, [memberId]);
    await renumber(db, m.group_id);
    await audit(db, me.id, "savings.member_removed", memberId);
  });
  refresh();
}

/** Writes turn numbers 1..n in the given order; `ids` must be exactly the approved members. */
async function applyOrder(db: PoolClient, groupId: string, ids: string[]) {
  const current = (await db.query<{ id: string }>(`SELECT id FROM savings_members WHERE group_id = $1 AND status = 'approved'`, [groupId])).rows.map(
    (x) => x.id,
  );
  const same = ids.length === current.length && new Set(ids).size === ids.length && current.every((id) => ids.includes(id));
  if (!same) return false;
  await db.query(
    `UPDATE savings_members m SET turn_no = o.n::int
       FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, n)
      WHERE m.id = o.id AND m.group_id = $1`,
    [groupId, ids],
  );
  return true;
}

export async function saveOrder(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const groupId = String(formData.get("groupId") ?? "");
  const ids = String(formData.get("order") ?? "").split(",").filter(Boolean);
  if (!UUID_RE.test(groupId) || !ids.every((id) => UUID_RE.test(id))) return { message: t.errState };
  const ok = await transaction(async (db) => {
    const g = await lockGroup(db, groupId);
    if (!g || g.organizer_id !== me.id || g.status !== "forming") return false;
    const applied = await applyOrder(db, groupId, ids);
    if (applied) await audit(db, me.id, "savings.order_saved", groupId);
    return applied;
  });
  if (!ok) return { message: t.errState };
  refresh();
  return { success: t.saved };
}

/** A random draw, for groups that want luck to decide. */
export async function shuffleOrder(formData: FormData) {
  const me = await requireRole(...DONOR_ROLES);
  const groupId = String(formData.get("groupId") ?? "");
  if (!UUID_RE.test(groupId)) return;
  await transaction(async (db) => {
    const g = await lockGroup(db, groupId);
    if (!g || g.organizer_id !== me.id || g.status !== "forming") return;
    const ids = (await db.query<{ id: string }>(`SELECT id FROM savings_members WHERE group_id = $1 AND status = 'approved'`, [groupId])).rows.map(
      (x) => x.id,
    );
    await applyOrder(db, groupId, shuffled(ids));
    await audit(db, me.id, "savings.order_shuffled", groupId);
  });
  refresh();
}

/** Tells the round's payers who to pay, and the receiver that it is their turn. */
async function announceRound(db: PoolClient, groupId: string, roundNo: number) {
  const r = (
    await db.query<{ id: string; receiver_user_id: string; receiver_name: string; group_name: string; amount: string; pot: string }>(
      `SELECT r.id, m.user_id AS receiver_user_id, u.full_name AS receiver_name, g.name AS group_name, g.amount,
              (SELECT COALESCE(SUM(p.amount), 0) FROM savings_payments p WHERE p.round_id = r.id) AS pot
         FROM savings_rounds r
         JOIN savings_groups g ON g.id = r.group_id
         JOIN savings_members m ON m.id = r.receiver_member_id
         JOIN users u ON u.id = m.user_id
        WHERE r.group_id = $1 AND r.round_no = $2`,
      [groupId, roundNo],
    )
  ).rows[0];
  if (!r) return;
  const payers = await db.query<{ user_id: string }>(
    `SELECT m.user_id FROM savings_payments p JOIN savings_members m ON m.id = p.payer_member_id WHERE p.round_id = $1`,
    [r.id],
  );
  const link = `/savings/${groupId}`;
  await notifyMany(
    db,
    payers.rows.map((x) => x.user_id),
    "savings_round_open",
    { group: r.group_name, round: roundNo, receiver: r.receiver_name, amount: formatKip(r.amount) },
    link,
  );
  await notify(db, r.receiver_user_id, "savings_your_turn", { group: r.group_name, round: roundNo, pot: formatKip(r.pot) }, link);
}

/** Locks the order, creates every round and payment, and opens round 1. */
export async function startGroup(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const groupId = String(formData.get("groupId") ?? "");
  if (!UUID_RE.test(groupId)) return { message: t.errState };

  const result = await transaction(async (db): Promise<FormState> => {
    const g = await lockGroup(db, groupId);
    if (!g || g.organizer_id !== me.id || g.status !== "forming") return { message: t.errState };
    if (!isTodayOrLater(g.start_date, todayInLaos())) return { message: t.errStartPast };

    const members = (
      await db.query<{ id: string; turn_no: number | null; full_name: string; can_receive: boolean }>(
        `SELECT m.id, m.turn_no, u.full_name,
                ((m.account_name IS NOT NULL AND m.account_number IS NOT NULL) OR m.qr_file_id IS NOT NULL) AS can_receive
           FROM savings_members m JOIN users u ON u.id = m.user_id
          WHERE m.group_id = $1 AND m.status = 'approved'`,
        [groupId],
      )
    ).rows;
    if (members.length < 2) return { message: t.errTooFew };
    if (!isCompleteOrder(members.map((m) => m.turn_no))) return { message: t.errOrder };
    const missing = members.filter((m) => !m.can_receive).map((m) => m.full_name);
    if (missing.length) return { message: fmt(t.errMissingReceiving, { names: missing.join(", ") }) };

    const fee = (await db.query<{ p: string }>(`SELECT savings_fee_percent AS p FROM platform_settings WHERE id = 1`)).rows[0]?.p ?? "1.00";

    // Round k goes to the member with turn k, due k-1 periods after the start date.
    await db.query(
      `INSERT INTO savings_rounds (group_id, round_no, receiver_member_id, due_date, status, opened_at)
       SELECT $1, m.turn_no, m.id,
              CASE WHEN $2 = 'weekly' THEN $3::date + (m.turn_no - 1) * 7
                   ELSE ($3::date + (m.turn_no - 1) * interval '1 month')::date END,
              CASE WHEN m.turn_no = 1 THEN 'collecting'::savings_round_status ELSE 'upcoming'::savings_round_status END,
              CASE WHEN m.turn_no = 1 THEN now() END
         FROM savings_members m WHERE m.group_id = $1 AND m.status = 'approved'`,
      [groupId, g.period, g.start_date],
    );
    // Everyone pays every round except the one they receive.
    await db.query(
      `INSERT INTO savings_payments (round_id, payer_member_id, amount)
       SELECT r.id, m.id, $2
         FROM savings_rounds r
         JOIN savings_members m ON m.group_id = r.group_id AND m.status = 'approved' AND m.id <> r.receiver_member_id
        WHERE r.group_id = $1`,
      [groupId, g.amount],
    );
    await db.query(`UPDATE savings_groups SET status = 'active', fee_percent = $2, started_at = now() WHERE id = $1`, [groupId, fee]);

    // Requests still waiting can no longer be approved.
    const late = await db.query<{ user_id: string }>(
      `UPDATE savings_members SET status = 'declined', decided_at = now() WHERE group_id = $1 AND status = 'pending' RETURNING user_id`,
      [groupId],
    );
    await notifyMany(db, late.rows.map((x) => x.user_id), "savings_join_declined", { group: g.name }, "/savings");

    await audit(db, me.id, "savings.started", groupId, { members: members.length, fee_percent: fee });
    await announceRound(db, groupId, 1);
    return { success: "ok" };
  });

  if (result?.success) refresh();
  return result;
}

/** A member changes where they receive, until their own round has opened. */
export async function updateMyReceivingDetails(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const groupId = String(formData.get("groupId") ?? "");
  if (!UUID_RE.test(groupId)) return { message: t.errState };

  const current = await queryOne<{ id: string; qr_file_id: string | null; group_status: string; my_round_status: string | null }>(
    `SELECT m.id, m.qr_file_id, g.status AS group_status,
            (SELECT r.status FROM savings_rounds r WHERE r.receiver_member_id = m.id) AS my_round_status
       FROM savings_members m JOIN savings_groups g ON g.id = m.group_id
      WHERE m.group_id = $1 AND m.user_id = $2 AND m.status = 'approved'`,
    [groupId, me.id],
  );
  const editable =
    current && (current.group_status === "forming" || (current.group_status === "active" && current.my_round_status === "upcoming"));
  if (!current || !editable) return { message: t.errState };

  const receiving = await readReceiving(formData, t, Boolean(current.qr_file_id));
  if (Object.keys(receiving.errors).length) return { errors: receiving.errors, values: receiving.values };
  const r = receiving.fields;

  await transaction(async (db) => {
    const qrId = await storeFile(db, me.id, "savings_qr", receiving.qr);
    await db.query(
      `UPDATE savings_members SET bank_name = $2, account_name = $3, account_number = $4, qr_file_id = COALESCE($5, qr_file_id)
        WHERE id = $1`,
      [current.id, r.bankName, r.accountName, r.accountNumber, qrId],
    );
    await audit(db, me.id, "savings.receiving_updated", current.id);
  });
  refresh();
  return { success: t.saved, values: receiving.values };
}

/** A payer records the transfer they made to this round's receiver. */
export async function uploadSlip(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const paymentId = String(formData.get("paymentId") ?? "");
  const transferDate = String(formData.get("transferDate") ?? "");
  const values = { transferDate };
  if (!UUID_RE.test(paymentId)) return { message: t.errState, values };

  const errors: Record<string, string[]> = {};
  if (!isPastDate(transferDate)) errors.transferDate = [t.errDate];
  const slip = await readUpload(formData.get("slip"));
  if (!slip.ok) errors.slip = [slip.reason === "missing" ? t.errSlip : t.errSlipFile];
  if (Object.keys(errors).length) return { errors, values };

  const result = await transaction(async (db): Promise<FormState> => {
    const p = (
      await db.query<{ status: string; round_status: string; group_id: string; group_name: string; amount: string; receiver_user_id: string; receiver_name: string }>(
        `SELECT p.status, r.status AS round_status, r.group_id, g.name AS group_name, p.amount,
                rm.user_id AS receiver_user_id, ru.full_name AS receiver_name
           FROM savings_payments p
           JOIN savings_members pm ON pm.id = p.payer_member_id
           JOIN savings_rounds r ON r.id = p.round_id
           JOIN savings_groups g ON g.id = r.group_id
           JOIN savings_members rm ON rm.id = r.receiver_member_id
           JOIN users ru ON ru.id = rm.user_id
          WHERE p.id = $1 AND pm.user_id = $2
          FOR UPDATE OF p`,
        [paymentId, me.id],
      )
    ).rows[0];
    if (!p || p.round_status !== "collecting" || !(p.status === "unpaid" || p.status === "rejected")) return { message: t.errState, values };

    const slipId = await storeFile(db, me.id, "savings_slip", slip);
    await db.query(
      `UPDATE savings_payments SET status = 'pending', slip_file_id = $2, transfer_date = $3, submitted_at = now(),
              review_note = NULL, reviewed_at = NULL
        WHERE id = $1`,
      [paymentId, slipId, transferDate],
    );
    await audit(db, me.id, "savings.slip_uploaded", paymentId);
    await notify(db, p.receiver_user_id, "savings_slip_uploaded", { name: me.fullName, amount: formatKip(p.amount), group: p.group_name }, `/savings/${p.group_id}`);
    return { success: fmt(t.slipSent, { name: p.receiver_name }) };
  });

  if (result?.success) refresh();
  return result;
}

/**
 * When every payment of the round is confirmed: closes it, records the receiver's fee, and opens
 * the next round, or finishes the group after the last one. Runs inside the caller's transaction,
 * which already holds the group lock.
 */
async function completeRoundIfPaid(db: PoolClient, roundId: string) {
  const left = (await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM savings_payments WHERE round_id = $1 AND status <> 'confirmed'`, [roundId]))
    .rows[0].n;
  if (Number(left) > 0) return;

  const r = (
    await db.query<{ group_id: string; round_no: number; group_name: string; fee_percent: string | null; receiver_user_id: string; pot: string }>(
      `UPDATE savings_rounds r SET status = 'done', done_at = now()
         FROM savings_groups g, savings_members m
        WHERE r.id = $1 AND r.status = 'collecting' AND g.id = r.group_id AND m.id = r.receiver_member_id
        RETURNING r.group_id, r.round_no, g.name AS group_name, g.fee_percent, m.user_id AS receiver_user_id,
                  (SELECT COALESCE(SUM(p.amount), 0) FROM savings_payments p WHERE p.round_id = r.id) AS pot`,
      [roundId],
    )
  ).rows[0];
  if (!r) return; // already closed by someone else

  const pot = Number(r.pot);
  const percent = r.fee_percent ?? "0";
  const fee = feeFor(pot, percent);
  await db.query(
    `INSERT INTO savings_fees (round_id, payer_user_id, percent, base_amount, fee_amount)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (round_id) DO NOTHING`,
    [roundId, r.receiver_user_id, percent, pot, fee],
  );
  const link = `/savings/${r.group_id}`;
  await notify(db, r.receiver_user_id, "savings_round_done", { group: r.group_name, round: r.round_no, pot: formatKip(pot), fee: formatKip(fee) }, link);

  const next = await db.query(
    `UPDATE savings_rounds SET status = 'collecting', opened_at = now() WHERE group_id = $1 AND round_no = $2 AND status = 'upcoming'`,
    [r.group_id, r.round_no + 1],
  );
  if (next.rowCount) {
    await announceRound(db, r.group_id, r.round_no + 1);
    return;
  }
  await db.query(`UPDATE savings_groups SET status = 'completed', completed_at = now() WHERE id = $1`, [r.group_id]);
  const everyone = await db.query<{ user_id: string }>(`SELECT user_id FROM savings_members WHERE group_id = $1 AND status = 'approved'`, [r.group_id]);
  await notifyMany(db, everyone.rows.map((x) => x.user_id), "savings_completed", { group: r.group_name }, link);
}

/**
 * The round's receiver decides: `confirm` or `reject` a slip, or `cash` for money handed over in
 * person (no slip needed).
 */
export async function reviewPayment(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const paymentId = String(formData.get("paymentId") ?? "");
  const decisionRaw = String(formData.get("decision") ?? "");
  const decision = decisionRaw === "confirm" || decisionRaw === "reject" || decisionRaw === "cash" ? decisionRaw : null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  if (!UUID_RE.test(paymentId) || !decision) return { message: t.errState };
  if (decision === "reject" && !note) return { errors: { note: [t.errReason] } };

  const result = await transaction(async (db): Promise<FormState> => {
    const p = (
      await db.query<{ status: string; round_id: string; round_status: string; amount: string; group_id: string; group_name: string; payer_user_id: string }>(
        `SELECT p.status, p.round_id, r.status AS round_status, p.amount, r.group_id, g.name AS group_name, pm.user_id AS payer_user_id
           FROM savings_payments p
           JOIN savings_rounds r ON r.id = p.round_id
           JOIN savings_groups g ON g.id = r.group_id
           JOIN savings_members rm ON rm.id = r.receiver_member_id
           JOIN savings_members pm ON pm.id = p.payer_member_id
          WHERE p.id = $1 AND rm.user_id = $2
          FOR UPDATE OF g, r, p`,
        [paymentId, me.id],
      )
    ).rows[0];
    if (!p || p.round_status !== "collecting") return { message: t.errState };
    const allowed = decision === "cash" ? p.status === "unpaid" || p.status === "rejected" : p.status === "pending";
    if (!allowed) return { message: t.errState };

    if (decision === "reject") {
      await db.query(`UPDATE savings_payments SET status = 'rejected', review_note = $2, reviewed_at = now() WHERE id = $1`, [paymentId, note]);
    } else {
      await db.query(
        `UPDATE savings_payments SET status = 'confirmed', review_note = NULL, reviewed_at = now(),
                confirmed_without_slip = $2
          WHERE id = $1`,
        [paymentId, decision === "cash"],
      );
    }
    await audit(db, me.id, `savings.payment_${decision}`, paymentId);
    const link = `/savings/${p.group_id}`;
    if (decision === "reject") {
      await notify(db, p.payer_user_id, "savings_slip_rejected", { name: me.fullName, group: p.group_name, note: note ?? "" }, link);
    } else {
      await notify(db, p.payer_user_id, "savings_slip_confirmed", { name: me.fullName, amount: formatKip(p.amount), group: p.group_name }, link);
      await completeRoundIfPaid(db, p.round_id);
    }
    return { success: decision === "reject" ? t.rejectedMsg : t.confirmedMsg };
  });

  if (result?.success) refresh();
  return result;
}

/** The organizer nudges everyone who has not sent a slip for the current round (once a day). */
export async function remindUnpaid(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const groupId = String(formData.get("groupId") ?? "");
  if (!UUID_RE.test(groupId)) return { message: t.errState };

  return transaction(async (db): Promise<FormState> => {
    const r = (
      await db.query<{ id: string; round_no: number; last_reminder_at: Date | null; group_name: string; amount: string; receiver_name: string }>(
        `SELECT r.id, r.round_no, r.last_reminder_at, g.name AS group_name, g.amount, u.full_name AS receiver_name
           FROM savings_rounds r
           JOIN savings_groups g ON g.id = r.group_id
           JOIN savings_members m ON m.id = r.receiver_member_id
           JOIN users u ON u.id = m.user_id
          WHERE r.group_id = $1 AND r.status = 'collecting' AND g.organizer_id = $2
          FOR UPDATE OF r`,
        [groupId, me.id],
      )
    ).rows[0];
    if (!r) return { message: t.errState };
    if (!canRemind(r.last_reminder_at, new Date())) return { message: t.errRemindedToday };

    const unpaid = await db.query<{ user_id: string }>(
      `SELECT m.user_id FROM savings_payments p JOIN savings_members m ON m.id = p.payer_member_id
        WHERE p.round_id = $1 AND p.status IN ('unpaid', 'rejected')`,
      [r.id],
    );
    if (unpaid.rows.length === 0) return { message: t.nobodyToRemind };
    await notifyMany(
      db,
      unpaid.rows.map((x) => x.user_id),
      "savings_reminder",
      { group: r.group_name, round: r.round_no, receiver: r.receiver_name, amount: formatKip(r.amount) },
      `/savings/${groupId}`,
    );
    await db.query(`UPDATE savings_rounds SET last_reminder_at = now() WHERE id = $1`, [r.id]);
    return { success: fmt(t.reminded, { n: unpaid.rows.length }) };
  });
}

type SwapRound = { id: string; round_no: number; status: "upcoming" | "collecting" | "done"; pays: string[] };

/** The round a member receives in, if they may still trade it (nobody has paid them anything). */
async function swappableRound(db: PoolClient, memberId: string) {
  const r = (
    await db.query<SwapRound>(
      `SELECT r.id, r.round_no, r.status, COALESCE(array_agg(p.status::text) FILTER (WHERE p.id IS NOT NULL), '{}') AS pays
         FROM savings_rounds r LEFT JOIN savings_payments p ON p.round_id = r.id
        WHERE r.receiver_member_id = $1
        GROUP BY r.id`,
      [memberId],
    )
  ).rows[0];
  return r && canSwapRound(r.status, r.pays) ? r : null;
}

/** Payments of a round nobody has paid yet are rebuilt for its (new) receiver. */
async function rebuildPayments(db: PoolClient, roundId: string, groupId: string, amount: string, receiverMemberId: string) {
  await db.query(`DELETE FROM savings_payments WHERE round_id = $1`, [roundId]);
  await db.query(
    `INSERT INTO savings_payments (round_id, payer_member_id, amount)
     SELECT $1, m.id, $3 FROM savings_members m WHERE m.group_id = $2 AND m.status = 'approved' AND m.id <> $4`,
    [roundId, groupId, amount, receiverMemberId],
  );
}

/** A member asks someone else who has not received yet to trade turns with them. */
export async function requestSwap(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const groupId = String(formData.get("groupId") ?? "");
  const toMemberId = String(formData.get("toMemberId") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  if (!UUID_RE.test(groupId) || !UUID_RE.test(toMemberId)) return { message: t.errState };

  const result = await transaction(async (db): Promise<FormState> => {
    const g = await lockGroup(db, groupId);
    if (!g || g.status !== "active") return { message: t.errState };
    const mine = (
      await db.query<{ id: string }>(`SELECT id FROM savings_members WHERE group_id = $1 AND user_id = $2 AND status = 'approved'`, [groupId, me.id])
    ).rows[0];
    const other = (
      await db.query<{ id: string; user_id: string; full_name: string }>(
        `SELECT m.id, m.user_id, u.full_name FROM savings_members m JOIN users u ON u.id = m.user_id
          WHERE m.id = $1 AND m.group_id = $2 AND m.status = 'approved'`,
        [toMemberId, groupId],
      )
    ).rows[0];
    if (!mine || !other || mine.id === other.id) return { message: t.errState };
    if (!(await swappableRound(db, mine.id)) || !(await swappableRound(db, other.id))) return { message: t.errSwap };
    const open = await db.query(`SELECT 1 FROM savings_swaps WHERE from_member_id = $1 AND status = 'pending'`, [mine.id]);
    if (open.rowCount) return { message: t.errSwapOpen };

    const s = await db.query<{ id: string }>(
      `INSERT INTO savings_swaps (group_id, from_member_id, to_member_id, message) VALUES ($1, $2, $3, $4) RETURNING id`,
      [groupId, mine.id, other.id, note],
    );
    await audit(db, me.id, "savings.swap_requested", s.rows[0].id);
    await notify(
      db,
      other.user_id,
      note ? "savings_swap_requested_note" : "savings_swap_requested",
      { name: me.fullName, group: g.name, note: note ?? "" },
      `/savings/${groupId}`,
    );
    return { success: fmt(t.swapAsked, { name: other.full_name }) };
  });

  if (result?.success) refresh();
  return result;
}

/** The person asked accepts (the two turns swap at once) or declines. */
export async function respondSwap(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).savings;
  const swapId = String(formData.get("swapId") ?? "");
  const accept = formData.get("decision") === "accept";
  if (!UUID_RE.test(swapId)) return { message: t.errState };
  const found = await queryOne<{ group_id: string }>(`SELECT group_id FROM savings_swaps WHERE id = $1`, [swapId]);
  if (!found) return { message: t.errState };

  const result = await transaction(async (db): Promise<FormState> => {
    // Group first, like every other action, then the request itself.
    const g = await lockGroup(db, found.group_id);
    const sw = (
      await db.query<{ from_member_id: string; to_member_id: string; from_user_id: string; from_name: string }>(
        `SELECT s.from_member_id, s.to_member_id, fm.user_id AS from_user_id, fu.full_name AS from_name
           FROM savings_swaps s
           JOIN savings_members tm ON tm.id = s.to_member_id
           JOIN savings_members fm ON fm.id = s.from_member_id
           JOIN users fu ON fu.id = fm.user_id
          WHERE s.id = $1 AND s.status = 'pending' AND tm.user_id = $2
          FOR UPDATE OF s`,
        [swapId, me.id],
      )
    ).rows[0];
    if (!g || g.status !== "active" || !sw) return { message: t.errState };
    const link = `/savings/${found.group_id}`;

    if (!accept) {
      await db.query(`UPDATE savings_swaps SET status = 'declined', decided_at = now() WHERE id = $1`, [swapId]);
      await notify(db, sw.from_user_id, "savings_swap_declined", { name: me.fullName, group: g.name }, link);
      await audit(db, me.id, "savings.swap_declined", swapId);
      return { success: t.swapDeclinedMsg };
    }

    const a = await swappableRound(db, sw.from_member_id);
    const b = await swappableRound(db, sw.to_member_id);
    if (!a || !b) {
      // Money has started moving in one of the rounds since the request was made.
      await db.query(`UPDATE savings_swaps SET status = 'cancelled', decided_at = now() WHERE id = $1`, [swapId]);
      return { message: t.errSwap };
    }

    await db.query(
      `UPDATE savings_rounds SET receiver_member_id = CASE id WHEN $1::uuid THEN $3::uuid ELSE $4::uuid END WHERE id IN ($1, $2)`,
      [a.id, b.id, sw.to_member_id, sw.from_member_id],
    );
    await rebuildPayments(db, a.id, found.group_id, g.amount, sw.to_member_id);
    await rebuildPayments(db, b.id, found.group_id, g.amount, sw.from_member_id);
    await db.query(`UPDATE savings_members SET turn_no = CASE id WHEN $1::uuid THEN $3::int ELSE $4::int END WHERE id IN ($1, $2)`, [
      sw.from_member_id,
      sw.to_member_id,
      b.round_no,
      a.round_no,
    ]);
    await db.query(`UPDATE savings_swaps SET status = 'accepted', decided_at = now() WHERE id = $1`, [swapId]);
    // Other open requests that involve either person were made against the old turns.
    await db.query(
      `UPDATE savings_swaps SET status = 'cancelled', decided_at = now()
        WHERE group_id = $1 AND status = 'pending'
          AND (from_member_id IN ($2, $3) OR to_member_id IN ($2, $3))`,
      [found.group_id, sw.from_member_id, sw.to_member_id],
    );

    const everyone = await db.query<{ user_id: string }>(`SELECT user_id FROM savings_members WHERE group_id = $1 AND status = 'approved'`, [
      found.group_id,
    ]);
    await notifyMany(
      db,
      everyone.rows.map((x) => x.user_id),
      "savings_swap_done",
      { group: g.name, a: sw.from_name, b: me.fullName, ra: b.round_no, rb: a.round_no },
      link,
    );
    // If the round being collected changed hands, tell its payers where to send the money now.
    const collecting = [a, b].find((r) => r.status === "collecting");
    if (collecting) await announceRound(db, found.group_id, collecting.round_no);
    await audit(db, me.id, "savings.swap_accepted", swapId, { rounds: [a.round_no, b.round_no] });
    return { success: t.swapDone };
  });

  if (result?.success) refresh();
  return result;
}

/** The person who asked withdraws their request. */
export async function cancelSwap(formData: FormData) {
  const me = await requireRole(...DONOR_ROLES);
  const swapId = String(formData.get("swapId") ?? "");
  if (!UUID_RE.test(swapId)) return;
  await queryOne(
    `UPDATE savings_swaps s SET status = 'cancelled', decided_at = now()
       FROM savings_members m
      WHERE s.id = $1 AND s.status = 'pending' AND m.id = s.from_member_id AND m.user_id = $2
      RETURNING s.id`,
    [swapId, me.id],
  );
  refresh();
}
