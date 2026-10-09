"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { readUpload, type UploadCheck } from "@/lib/files";
import { direct, notify, notifyMany, superAdminIds } from "@/lib/notify";
import { getT } from "@/lib/i18n/server";
import { documentSchema, profileSchema, type FormState } from "@/lib/definitions";
import type { PoolClient } from "pg";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pick(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

/** Everything a profile page can change about the signed-in person, and their own uploads. */
async function storeFile(db: PoolClient, clanId: string | null, userId: string, purpose: string, upload: UploadCheck) {
  if (!upload.ok) return null;
  const r = await db.query<{ id: string }>(
    `INSERT INTO files (clan_id, uploaded_by, purpose, file_name, content_type, size_bytes, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [clanId, userId, purpose, upload.fileName, upload.contentType, upload.size, upload.data],
  );
  return r.rows[0].id;
}

/**
 * Someone fills in their own details. The phone number is not here on purpose: it is how
 * they sign in, so changing it is not a profile edit.
 */
export async function updateProfile(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole();
  const t = await getT();
  const values = pick(formData, [
    "firstName",
    "lastName",
    "dateOfBirth",
    "gender",
    "email",
    "whatsapp",
    "facebook",
    "tiktok",
    "village",
    "district",
    "province",
  ]);
  const parsed = profileSchema(t.errors).safeParse(values);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, values };
  const d = parsed.data;

  if (d.email) {
    const taken = await queryOne(`SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2`, [d.email, me.id]);
    if (taken) return { errors: { email: [t.auth.emailTaken] }, values };
  }

  const photo = await readUpload(formData.get("photo"));
  if (!photo.ok && photo.reason !== "missing") return { errors: { photo: [t.profile.errPhoto] }, values };
  const removePhoto = formData.get("removePhoto") === "on";

  await transaction(async (db) => {
    const photoId = await storeFile(db, me.clanId, me.id, "profile_photo", photo);
    await db.query(
      `UPDATE users
          SET first_name = $2::text, last_name = $3::text, date_of_birth = $4::date, gender = $5::gender,
              email = $6::text, whatsapp = $7::text, facebook = $8::text, tiktok = $9::text,
              village = $10::text, district = $11::text, province = $12::text,
              -- The displayed name follows the two parts once both are given. The casts matter:
              -- without them PostgreSQL sees $2 used as both a varchar column and text, and gives up.
              full_name = CASE WHEN $2::text IS NOT NULL AND $3::text IS NOT NULL THEN $2::text || ' ' || $3::text ELSE full_name END,
              photo_file_id = CASE WHEN $13::uuid IS NOT NULL THEN $13::uuid WHEN $14 THEN NULL ELSE photo_file_id END,
              updated_at = now()
        WHERE id = $1`,
      [
        me.id,
        d.firstName,
        d.lastName,
        d.dateOfBirth,
        d.gender,
        d.email,
        d.whatsapp,
        d.facebook,
        d.tiktok,
        d.village,
        d.district,
        d.province,
        photoId,
        removePhoto,
      ],
    );
    await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'user.profile_updated', $2)`, [
      me.clanId,
      me.id,
    ]);
  });

  // The name and photo appear in the header on every page.
  revalidatePath("/", "layout");
  return { success: t.profile.saved };
}

/** Records one of the person's own identity documents, with an optional photo of it. */
export async function addDocument(_state: FormState, formData: FormData): Promise<FormState> {
  const me = await requireRole();
  const t = await getT();
  const values = pick(formData, ["docType", "docNumber", "issuedOn", "expiresOn", "note"]);
  const parsed = documentSchema(t.errors).safeParse(values);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, values };
  const d = parsed.data;

  const file = await readUpload(formData.get("file"));
  if (!file.ok && file.reason !== "missing") return { errors: { file: [t.profile.errPhoto] }, values };

  try {
    await transaction(async (db) => {
      const fileId = await storeFile(db, me.clanId, me.id, "kyc_document", file);
      await db.query(
        `INSERT INTO user_documents (user_id, doc_type, doc_number, issued_on, expires_on, file_id, note)
         VALUES ($1, $2::id_document, $3, $4, $5, $6, $7)`,
        [me.id, d.docType, d.docNumber, d.issuedOn, d.expiresOn, fileId, d.note],
      );
      await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'user.document_added', $2)`, [
        me.clanId,
        me.id,
      ]);
      // The platform owner is the only one who can approve it, so they are the one told.
      await notifyMany(db, await superAdminIds(db), "kyc_submitted", { name: me.fullName }, "/admin/kyc");
    });
  } catch (err) {
    // 23505 = the same document type and number is already recorded for this person.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
      return { errors: { docNumber: [t.profile.docExists] }, values };
    }
    throw err;
  }

  revalidatePath("/account");
  return { success: t.profile.docAdded };
}

// A document that has been sent in is evidence of an identity check, so nothing deletes
// one: a wrong or unreadable document is turned down by the platform and stays on file.

/**
 * The platform owner decides on an identity document. Only they can: an approved
 * document is what lets someone join a clan and ask for donations, so the decision
 * does not sit with the clan that benefits from it.
 */
export async function reviewDocument(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("super_admin");
  const t = (await getT()).kyc;
  const documentId = String(formData.get("documentId") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  // "revoke" puts an already decided document back in the queue, so a mistake can be undone.
  const decision = String(formData.get("decision") ?? "");
  const next = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : decision === "revoke" ? "pending" : null;
  if (!UUID.test(documentId) || !next) return { message: t.errState };
  // Turning a document down without saying why leaves the person stuck.
  if (next === "rejected" && !note) return { errors: { note: [t.errReason] } };

  const decided = await queryOne<{ user_id: string }>(
    `UPDATE user_documents
        SET status = $2::kyc_status,
            review_note = $3,
            verified_at = CASE WHEN $2::text = 'pending' THEN NULL ELSE now() END,
            verified_by = CASE WHEN $2::text = 'pending' THEN NULL ELSE $4::uuid END
      WHERE id = $1 AND status <> $2::kyc_status
      RETURNING user_id`,
    [documentId, next, next === "rejected" ? note : null, admin.id],
  );
  if (!decided) return { message: t.errState };

  const action = next === "approved" ? "kyc.approved" : next === "rejected" ? "kyc.rejected" : "kyc.revoked";
  await query(`INSERT INTO audit_logs (actor_id, action, target_id) VALUES ($1, $2, $3)`, [admin.id, action, decided.user_id]);
  await notify(
    direct,
    decided.user_id,
    next === "approved" ? "kyc_approved" : next === "rejected" ? "kyc_rejected" : "kyc_revoked",
    { note: note ?? "" },
    "/account",
  );

  revalidatePath("/admin/kyc");
  revalidatePath(`/admin/users/${decided.user_id}`);
  // An approval changes what the person may do, so every page of theirs is stale.
  revalidatePath("/", "layout");
  return { success: next === "approved" ? t.doneApproved : next === "rejected" ? t.doneRejected : t.doneRevoked };
}
