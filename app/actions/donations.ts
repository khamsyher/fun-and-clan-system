"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { canAskForHelp } from "@/lib/access";
import { readUpload, type UploadCheck } from "@/lib/files";
import { isPastDate, parseKip, UUID_RE } from "@/lib/funds";
import { clanMemberIds, direct, notify, notifyMany } from "@/lib/notify";
import { formatKip } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { DONOR_ROLES, type FormState } from "@/lib/definitions";
import type { PoolClient } from "pg";

const refresh = () => revalidatePath("/donations", "layout");

/** Saves an optional image/PDF attached to a donation request or donation. `clanId` is null for a general user. */
async function storeFile(db: PoolClient, clanId: string | null, userId: string, purpose: string, upload: UploadCheck) {
  if (!upload.ok) return null;
  const r = await db.query<{ id: string }>(
    `INSERT INTO files (clan_id, uploaded_by, purpose, file_name, content_type, size_bytes, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [clanId, userId, purpose, upload.fileName, upload.contentType, upload.size, upload.data],
  );
  return r.rows[0].id;
}

type Dict = Awaited<ReturnType<typeof getT>>["donations"];

/**
 * Reads and checks the request fields shared by creating and editing.
 * `keepsPayment` is true when the request already has payment details that are being kept.
 */
async function readRequestForm(formData: FormData, t: Dict, keepsPayment = false) {
  const title = String(formData.get("title") ?? "").trim().slice(0, 150);
  const story = String(formData.get("story") ?? "").trim().slice(0, 4000);
  const targetRaw = String(formData.get("target") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim().slice(0, 100) || null;
  const accountName = String(formData.get("accountName") ?? "").trim().slice(0, 150) || null;
  const accountNumber = String(formData.get("accountNumber") ?? "").trim().slice(0, 50) || null;
  const values = {
    title,
    story,
    target: targetRaw,
    deadline,
    bankName: bankName ?? "",
    accountName: accountName ?? "",
    accountNumber: accountNumber ?? "",
  };

  const errors: Record<string, string[]> = {};
  if (title.length < 3) errors.title = [t.errTitle];
  if (story.length < 10) errors.story = [t.errStory];
  const target = targetRaw ? parseKip(targetRaw) : null;
  if (targetRaw && !target) errors.target = [t.errTarget];
  if (deadline && !isFutureDate(deadline)) errors.deadline = [t.errDeadline];

  const photo = await readUpload(formData.get("photo"));
  const qr = await readUpload(formData.get("qr"));
  if (!photo.ok && photo.reason !== "missing") errors.photo = [t.errFile];
  if (!qr.ok && qr.reason !== "missing") errors.qr = [t.errFile];
  // People need somewhere to send the money: either an account or a QR photo.
  if (!(accountName && accountNumber) && !qr.ok && !keepsPayment) errors.accountNumber = [t.errPayment];

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values,
    fields: { title, story, target, deadline: deadline || null, bankName, accountName, accountNumber },
    photo,
    qr,
  };
}

/** A member or clan leader asks for help. It is published to every clan straight away. */
export async function createRequest(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const tt = await getT();
  const t = tt.donations;
  // Money is sent to whoever asks, so only someone the platform has identified may ask.
  if (!canAskForHelp(me)) return { message: tt.kyc.needForRequest };

  const form = await readRequestForm(formData, t);
  const { values, photo, qr } = form;
  const { title, story, target, deadline, bankName, accountName, accountNumber } = form.fields;
  if (!form.ok) return { errors: form.errors, values };

  const id = await transaction(async (db) => {
    const photoId = await storeFile(db, me.clanId, me.id, "donation_photo", photo);
    const qrId = await storeFile(db, me.clanId, me.id, "donation_qr", qr);
    const r = await db.query<{ id: string }>(
      `INSERT INTO donation_requests
         (clan_id, created_by, title, story, target_amount, deadline, bank_name, account_name, account_number, photo_file_id, qr_file_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [me.clanId, me.id, title, story, target, deadline, bankName, accountName, accountNumber, photoId, qrId],
    );
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'donation.requested', $3)`, [
      me.clanId,
      me.id,
      r.rows[0].id,
    ]);
    // Their own clan is told; everyone else finds it on the donations page. A general
    // user has no clan to tell.
    if (me.clanId) {
      await notifyMany(db, await clanMemberIds(db, me.clanId, me.id), "donation_new", { name: me.fullName, title }, `/donations/${r.rows[0].id}`);
    }
    return r.rows[0].id;
  });

  refresh();
  redirect(`/donations/${id}`);
}

/**
 * The person who asked edits their own request later: details, payment information,
 * and the photo / QR (uploading a new one replaces it, or it can be removed).
 * Donations already received are untouched.
 */
export async function updateRequest(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).donations;
  const requestId = String(formData.get("requestId") ?? "");
  if (!UUID_RE.test(requestId)) return { message: t.errState };

  const current = await queryOne<{ qr_file_id: string | null; account_name: string | null; account_number: string | null }>(
    `SELECT qr_file_id, account_name, account_number FROM donation_requests
      WHERE id = $1 AND created_by = $2 AND status <> 'cancelled'`,
    [requestId, me.id],
  );
  if (!current) return { message: t.notYours };

  const removePhoto = formData.get("removePhoto") === "on";
  const removeQr = formData.get("removeQr") === "on";
  // The existing QR still counts as a way to pay, unless it is being removed.
  const keepsQr = Boolean(current.qr_file_id) && !removeQr;
  const form = await readRequestForm(formData, t, keepsQr);
  const { values, photo, qr } = form;
  const { title, story, target, deadline, bankName, accountName, accountNumber } = form.fields;
  if (!form.ok) return { errors: form.errors, values };

  await transaction(async (db) => {
    const photoId = await storeFile(db, me.clanId, me.id, "donation_photo", photo);
    const qrId = await storeFile(db, me.clanId, me.id, "donation_qr", qr);
    await db.query(
      `UPDATE donation_requests
          SET title = $3, story = $4, target_amount = $5, deadline = $6, bank_name = $7, account_name = $8, account_number = $9,
              photo_file_id = CASE WHEN $10::uuid IS NOT NULL THEN $10::uuid WHEN $12 THEN NULL ELSE photo_file_id END,
              qr_file_id   = CASE WHEN $11::uuid IS NOT NULL THEN $11::uuid WHEN $13 THEN NULL ELSE qr_file_id END,
              updated_at = now()
        WHERE id = $1 AND created_by = $2`,
      [requestId, me.id, title, story, target, deadline, bankName, accountName, accountNumber, photoId, qrId, removePhoto, removeQr],
    );
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'donation.updated', $3)`, [
      me.clanId,
      me.id,
      requestId,
    ]);
  });

  refresh();
  redirect(`/donations/${requestId}?saved=1`);
}

/** Anyone signed in (from any clan) records a donation they transferred, with proof. */
export async function donate(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const tt = await getT();
  const t = tt.donations;

  const requestId = String(formData.get("requestId") ?? "");
  const amount = parseKip(formData.get("amount"));
  const transferDate = String(formData.get("transferDate") ?? "");
  const message = String(formData.get("message") ?? "").trim().slice(0, 500) || null;
  const anonymous = formData.get("anonymous") === "on";
  const values = { amount: String(formData.get("amount") ?? ""), transferDate, message: message ?? "" };
  if (!UUID_RE.test(requestId)) return { message: t.errState, values };

  const errors: Record<string, string[]> = {};
  if (!amount) errors.amount = [t.errAmount];
  if (!isPastDate(transferDate)) errors.transferDate = [t.errDate];
  const slip = await readUpload(formData.get("slip"));
  if (!slip.ok) errors.slip = [slip.reason === "missing" ? t.errSlip : t.errFile];
  if (Object.keys(errors).length) return { errors, values };

  const result = await transaction(async (db): Promise<FormState> => {
    const request = (
      await db.query<{ created_by: string; status: string }>(
        `SELECT created_by, status FROM donation_requests WHERE id = $1 FOR UPDATE`,
        [requestId],
      )
    ).rows[0];
    if (!request) return { message: t.errState, values };
    if (request.status !== "open") return { message: t.errClosed, values };
    if (request.created_by === me.id) return { message: t.errOwn, values };

    const slipId = await storeFile(db, me.clanId, me.id, "donation_slip", slip);
    const d = await db.query<{ id: string }>(
      `INSERT INTO donations (request_id, donor_id, amount, transfer_date, message, anonymous, slip_file_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [requestId, me.id, amount, transferDate, message, anonymous, slipId],
    );
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id, details) VALUES ($1, $2, 'donation.sent', $3, $4)`, [
      me.clanId,
      me.id,
      d.rows[0].id,
      JSON.stringify({ amount, request_id: requestId }),
    ]);
    await notify(db, request.created_by, "donation_received", { name: me.fullName, amount: formatKip(amount!) }, `/donations/${requestId}`);
    return { success: "ok" };
  });

  if (!result?.success) return result;
  refresh();
  redirect(`/donations/${requestId}?sent=1`);
}

/** The person who asked confirms the money arrived, or rejects the slip with a reason. */
export async function reviewDonation(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole(...DONOR_ROLES);
  const t = (await getT()).donations;
  const donationId = String(formData.get("donationId") ?? "");
  const decision = formData.get("decision") === "confirm" ? "confirmed" : "rejected";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  if (!UUID_RE.test(donationId)) return { message: t.errState };
  if (decision === "rejected" && !note) return { errors: { note: [t.errReason] } };

  const updated = await queryOne<{ id: string; request_id: string }>(
    `UPDATE donations d SET status = $3, review_note = $4, reviewed_at = now()
       FROM donation_requests r
      WHERE d.id = $1 AND d.status = 'pending' AND r.id = d.request_id AND r.created_by = $2
      RETURNING d.id, d.request_id`,
    [donationId, me.id, decision, note],
  );
  if (!updated) return { message: t.errState };

  await query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, $3, $4)`, [
    me.clanId,
    me.id,
    `donation.${decision}`,
    donationId,
  ]);
  const donation = await queryOne<{ donor_id: string; amount: string }>(`SELECT donor_id, amount FROM donations WHERE id = $1`, [donationId]);
  if (donation) {
    await notify(
      direct,
      donation.donor_id,
      decision === "confirmed" ? "donation_confirmed" : "donation_rejected",
      decision === "confirmed" ? { name: me.fullName, amount: formatKip(donation.amount) } : { name: me.fullName, note: note ?? "" },
      `/donations/${updated.request_id}`,
    );
  }
  refresh();
  return { success: decision === "confirmed" ? t.confirmed : t.rejected };
}

/** The person who asked closes their request when they have enough (or reopens it). */
export async function setRequestOpen(formData: FormData) {
  const me = await requireRole(...DONOR_ROLES);
  const requestId = String(formData.get("requestId") ?? "");
  const open = formData.get("open") === "true";
  if (!UUID_RE.test(requestId)) return;
  await query(
    `UPDATE donation_requests SET status = $3::donation_request_status, closed_at = CASE WHEN $3 = 'open' THEN NULL ELSE now() END,
            updated_at = now()
      WHERE id = $1 AND created_by = $2 AND status <> 'cancelled'`,
    [requestId, me.id, open ? "open" : "closed"],
  );
  refresh();
}

/** Today or later, used for the optional "needed by" date. */
function isFutureDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Vientiane" }));
  return date.getTime() >= today.getTime() && date.getUTCFullYear() <= today.getUTCFullYear() + 5;
}
