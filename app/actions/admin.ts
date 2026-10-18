"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { HEX_COLOR } from "@/lib/branding";
import { readUpload } from "@/lib/files";
import { notify } from "@/lib/notify";
import { hashPassword } from "@/lib/password";
import { STAFF_ROLES, createClanSchema, type FormState } from "@/lib/definitions";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

/**
 * Creates a clan with its first leader. The leader is either an existing account — a
 * general user whose identity the platform has verified, who moves into the new clan — or
 * a brand-new account made here with a temporary password.
 */
export async function createClan(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole(...STAFF_ROLES);
  const t = await getT();
  const values = Object.fromEntries(
    ["code", "name", "clanTypeId", "leaderMode", "leaderId", "leaderName", "leaderPhone", "leaderPassword"].map((k) => [
      k,
      String(formData.get(k) ?? ""),
    ]),
  );
  const echo = { ...values, leaderPassword: "" };
  const existing = values.leaderMode === "existing";
  // An existing leader brings their own name, phone and password, so only the clan fields are checked.
  const full = createClanSchema(t.errors);
  const parsed = existing ? full.pick({ code: true, name: true }).safeParse(values) : full.safeParse(values);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, values: echo };
  const { code, name } = parsed.data;
  const clanTypeId = UUID.test(values.clanTypeId) ? values.clanTypeId : null;
  if (clanTypeId && !(await queryOne(`SELECT 1 FROM clan_types WHERE id = $1 AND is_active`, [clanTypeId]))) {
    return { errors: { clanTypeId: [t.clanTypes.pick] }, values: echo };
  }
  if (await queryOne(`SELECT 1 FROM clans WHERE code = $1`, [code])) {
    return { errors: { code: [t.admin.codeTaken] }, values: echo };
  }

  if (existing) {
    if (!UUID.test(values.leaderId)) return { errors: { leaderId: [t.admin.leaderPick] }, values: echo };
    const result = await transaction(async (db): Promise<FormState> => {
      // Still a verified general user with no clan, checked under a lock so nothing changes it meanwhile.
      const leader = (
        await db.query<{ full_name: string; phone: string }>(
          `SELECT full_name, phone FROM users u
            WHERE id = $1 AND role = 'user' AND clan_id IS NULL AND status = 'active'
              AND EXISTS (SELECT 1 FROM user_documents d WHERE d.user_id = u.id AND d.status = 'approved')
            FOR UPDATE`,
          [values.leaderId],
        )
      ).rows[0];
      if (!leader) return { errors: { leaderId: [t.admin.leaderNotEligible] }, values: echo };

      const clan = await db.query<{ id: string }>(
        `INSERT INTO clans (code, name, clan_type_id) VALUES ($1, $2, $3) RETURNING id`,
        [code, name, clanTypeId],
      );
      const clanId = clan.rows[0].id;
      // Their role changes, so their session ends and they sign in again as leader.
      await db.query(
        `UPDATE users
            SET clan_id = $2, role = 'clan_admin', approved_by = $3, approved_at = now(),
                session_version = session_version + 1, updated_at = now()
          WHERE id = $1`,
        [values.leaderId, clanId, admin.id],
      );
      await db.query(`UPDATE clan_join_requests SET status = 'withdrawn', decided_at = now() WHERE user_id = $1 AND status = 'pending'`, [
        values.leaderId,
      ]);
      await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'clan.created', $1)`, [clanId, admin.id]);
      await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'user.leader_assigned', $3)`, [
        clanId,
        admin.id,
        values.leaderId,
      ]);
      await notify(db, values.leaderId, "leader_assigned", { clan: name }, "/login");
      return { success: fmt(t.admin.clanCreated, { clan: name, leader: leader.full_name, phone: leader.phone }) };
    });
    if (result?.success) revalidatePath("/admin", "layout");
    return result;
  }

  // Already checked against the full schema above, so this can't fail; it just gives the leader fields their types.
  const d = full.parse(values);
  if (await queryOne(`SELECT 1 FROM users WHERE phone = $1`, [d.leaderPhone])) {
    return { errors: { leaderPhone: [t.admin.phoneTaken] }, values: echo };
  }

  const passwordHash = await hashPassword(d.leaderPassword);
  await transaction(async (db) => {
    const clan = await db.query<{ id: string }>(
      `INSERT INTO clans (code, name, clan_type_id) VALUES ($1, $2, $3) RETURNING id`,
      [code, name, clanTypeId],
    );
    const clanId = clan.rows[0].id;
    await db.query(
      `INSERT INTO users (clan_id, role, status, full_name, phone, password_hash, approved_by, approved_at)
       VALUES ($1, 'clan_admin', 'active', $2, $3, $4, $5, now())`,
      [clanId, d.leaderName, d.leaderPhone, passwordHash, admin.id],
    );
    await db.query(
      `INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'clan.created', $1)`,
      [clanId, admin.id],
    );
  });

  revalidatePath("/admin", "layout");
  return { success: fmt(t.admin.clanCreated, { clan: name, leader: d.leaderName, phone: d.leaderPhone }) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setClanActive(formData: FormData) {
  const admin = await requireRole(...STAFF_ROLES);
  const clanId = String(formData.get("clanId"));
  const active = formData.get("active") === "true";
  if (!UUID.test(clanId)) return;
  await query(`UPDATE clans SET is_active = $2, updated_at = now() WHERE id = $1`, [clanId, active]);
  await query(
    `INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, $3, $1)`,
    [clanId, admin.id, active ? "clan.enabled" : "clan.disabled"],
  );
  revalidatePath("/admin", "layout");
}

export async function updatePlatformFee(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole(...STAFF_ROLES);
  const t = await getT();
  const raw = String(formData.get("fee") ?? "").trim();
  const fee = Number(raw);
  if (raw === "" || !Number.isFinite(fee) || fee < 0 || fee > 100) {
    return { errors: { fee: [t.errors.feeRange] }, values: { fee: raw } };
  }
  const rounded = Math.round(fee * 100) / 100;
  await query(`UPDATE platform_settings SET platform_fee_percent = $1, updated_at = now() WHERE id = 1`, [rounded]);
  await query(
    `INSERT INTO audit_logs (actor_id, action, details) VALUES ($1, 'platform.fee_updated', $2)`,
    [admin.id, JSON.stringify({ platform_fee_percent: rounded })],
  );
  revalidatePath("/admin", "layout");
  return { success: fmt(t.admin.feeSaved, { fee: rounded }) };
}

/** The system owner confirms a platform fee arrived in their account. */
export async function markFeeReceived(formData: FormData) {
  const admin = await requireRole(...STAFF_ROLES);
  const feeId = String(formData.get("feeId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(feeId)) return;
  const updated = await query<{ clan_id: string }>(
    `UPDATE platform_fees SET status = 'received', received_at = now(), received_by = $2
      WHERE id = $1 AND status = 'owed' RETURNING clan_id`,
    [feeId, admin.id],
  );
  if (updated[0]) {
    await query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, 'platform.fee_received', $3)`, [
      updated[0].clan_id,
      admin.id,
      feeId,
    ]);
  }
  revalidatePath("/admin", "layout");
}

const MAX_LOGO_BYTES = 1024 * 1024;

/**
 * The platform's name, colours and (optionally) a new logo. The whole app re-renders
 * with them, sign-in page included. The logo must really be a PNG, JPG or WebP image.
 */
export async function updateBranding(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole(...STAFF_ROLES);
  const t = (await getT()).branding;
  const values = {
    appName: String(formData.get("appName") ?? "").trim(),
    primaryColor: String(formData.get("primaryColor") ?? "").trim().toLowerCase(),
    accentColor: String(formData.get("accentColor") ?? "").trim().toLowerCase(),
  };
  const errors: Record<string, string[]> = {};
  if (values.appName.length < 2 || values.appName.length > 60) errors.appName = [t.nameInvalid];
  if (!HEX_COLOR.test(values.primaryColor)) errors.primaryColor = [t.colorInvalid];
  if (!HEX_COLOR.test(values.accentColor)) errors.accentColor = [t.colorInvalid];

  const upload = await readUpload(formData.get("logo"));
  if (!upload.ok && upload.reason !== "missing") errors.logo = [t.logoInvalid];
  if (upload.ok && (!upload.contentType.startsWith("image/") || upload.size > MAX_LOGO_BYTES)) errors.logo = [t.logoInvalid];
  if (Object.keys(errors).length) return { errors, values };

  await query(
    `UPDATE platform_settings SET app_name = $1, primary_color = $2, accent_color = $3, updated_at = now() WHERE id = 1`,
    [values.appName, values.primaryColor, values.accentColor],
  );
  if (upload.ok) {
    await query(`UPDATE platform_settings SET logo_data = $1, logo_type = $2, updated_at = now() WHERE id = 1`, [
      upload.data,
      upload.contentType,
    ]);
  }
  await query(`INSERT INTO audit_logs (actor_id, action, details) VALUES ($1, 'platform.branding_updated', $2)`, [
    admin.id,
    JSON.stringify({ ...values, logo: upload.ok }),
  ]);

  revalidatePath("/", "layout");
  return { success: t.saved, values };
}

/** Back to the built-in mark. */
export async function removeLogo() {
  const admin = await requireRole(...STAFF_ROLES);
  await query(`UPDATE platform_settings SET logo_data = NULL, logo_type = NULL, updated_at = now() WHERE id = 1`);
  await query(`INSERT INTO audit_logs (actor_id, action) VALUES ($1, 'platform.logo_removed')`, [admin.id]);
  revalidatePath("/", "layout");
}

/** Back to the original name and colours. The logo is kept; it has its own remove button. */
export async function resetBranding() {
  const admin = await requireRole(...STAFF_ROLES);
  await query(
    `UPDATE platform_settings SET app_name = DEFAULT, primary_color = DEFAULT, accent_color = DEFAULT, updated_at = now() WHERE id = 1`,
  );
  await query(`INSERT INTO audit_logs (actor_id, action) VALUES ($1, 'platform.branding_reset')`, [admin.id]);
  revalidatePath("/", "layout");
}

/** Adds a clan type. Names are unique regardless of case. */
export async function createClanType(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole(...STAFF_ROLES);
  const t = (await getT()).clanTypes;
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
  };
  if (values.name.length < 2 || values.name.length > 80) return { errors: { name: [t.nameInvalid] }, values };
  if (values.description.length > 300) return { errors: { description: [t.descriptionTooLong] }, values };
  if (await queryOne(`SELECT 1 FROM clan_types WHERE lower(name) = lower($1)`, [values.name])) {
    return { errors: { name: [t.nameTaken] }, values };
  }

  const created = await queryOne<{ id: string }>(
    `INSERT INTO clan_types (name, description) VALUES ($1, $2) RETURNING id`,
    [values.name, values.description || null],
  );
  await query(`INSERT INTO audit_logs (actor_id, action, target_id, details) VALUES ($1, 'clan_type.created', $2, $3)`, [
    admin.id,
    created!.id,
    JSON.stringify(values),
  ]);
  revalidatePath("/admin/clans/types");
  revalidatePath("/admin", "layout");
  return { success: fmt(t.created, { name: values.name }) };
}

/** Renames a clan type, or retires / restores it. A retired type stays on clans that have it but can't be picked again. */
export async function updateClanType(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole(...STAFF_ROLES);
  const t = (await getT()).clanTypes;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { message: t.failed };
  const name = String(formData.get("name") ?? "").trim();
  const active = formData.get("active") === "true";
  if (name.length < 2 || name.length > 80) return { errors: { name: [t.nameInvalid] }, values: { name } };
  if (await queryOne(`SELECT 1 FROM clan_types WHERE lower(name) = lower($1) AND id <> $2`, [name, id])) {
    return { errors: { name: [t.nameTaken] }, values: { name } };
  }

  const updated = await queryOne(`UPDATE clan_types SET name = $2, is_active = $3 WHERE id = $1 RETURNING id`, [id, name, active]);
  if (!updated) return { message: t.failed };
  await query(`INSERT INTO audit_logs (actor_id, action, target_id, details) VALUES ($1, 'clan_type.updated', $2, $3)`, [
    admin.id,
    id,
    JSON.stringify({ name, is_active: active }),
  ]);
  revalidatePath("/admin/clans/types");
  revalidatePath("/admin", "layout");
  return { success: t.saved };
}

/** Deletes a clan type that no clan uses. One in use is refused by the database; retire it instead. */
export async function deleteClanType(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole(...STAFF_ROLES);
  const t = (await getT()).clanTypes;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { message: t.failed };
  try {
    const gone = await queryOne<{ name: string }>(`DELETE FROM clan_types WHERE id = $1 RETURNING name`, [id]);
    if (!gone) return { message: t.failed };
    await query(`INSERT INTO audit_logs (actor_id, action, target_id, details) VALUES ($1, 'clan_type.deleted', $2, $3)`, [
      admin.id,
      id,
      JSON.stringify(gone),
    ]);
  } catch (err) {
    const code = typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
    if (code === "23001" || code === "23503") return { message: t.inUse };
    throw err;
  }
  revalidatePath("/admin/clans/types");
  revalidatePath("/admin", "layout");
  return { success: t.deleted };
}

/** Sets (or clears) the type of an existing clan from the clan list. */
export async function setClanType(formData: FormData) {
  const admin = await requireRole(...STAFF_ROLES);
  const clanId = String(formData.get("clanId") ?? "");
  const typeId = String(formData.get("clanTypeId") ?? "");
  if (!UUID.test(clanId)) return;
  if (typeId && !UUID.test(typeId)) return;
  // A retired type can stay where it is but can't be newly given to a clan.
  if (typeId && !(await queryOne(`SELECT 1 FROM clan_types WHERE id = $1 AND is_active`, [typeId]))) return;

  await query(`UPDATE clans SET clan_type_id = $2, updated_at = now() WHERE id = $1`, [clanId, typeId || null]);
  await query(`INSERT INTO audit_logs (clan_id, actor_id, action, details) VALUES ($1, $2, 'clan.type_changed', $3)`, [
    clanId,
    admin.id,
    JSON.stringify({ clan_type_id: typeId || null }),
  ]);
  revalidatePath("/admin", "layout");
}

/** The savings group fee is separate from the funeral fee; each group keeps the rate it started with. */
export async function updateSavingsFee(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("super_admin");
  const t = await getT();
  const raw = String(formData.get("fee") ?? "").trim();
  const fee = Number(raw);
  if (raw === "" || !Number.isFinite(fee) || fee < 0 || fee > 100) {
    return { errors: { fee: [t.errors.feeRange] }, values: { fee: raw } };
  }
  const rounded = Math.round(fee * 100) / 100;
  await query(`UPDATE platform_settings SET savings_fee_percent = $1, updated_at = now() WHERE id = 1`, [rounded]);
  await query(`INSERT INTO audit_logs (actor_id, action, details) VALUES ($1, 'platform.savings_fee_updated', $2)`, [
    admin.id,
    JSON.stringify({ savings_fee_percent: rounded }),
  ]);
  revalidatePath("/admin", "layout");
  return { success: fmt(t.admin.savingsFeeSaved, { fee: rounded }) };
}

/** The system owner confirms a savings round's fee arrived. */
export async function markSavingsFeeReceived(formData: FormData) {
  const admin = await requireRole("super_admin");
  const feeId = String(formData.get("feeId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(feeId)) return;
  const updated = await query<{ id: string }>(
    `UPDATE savings_fees SET status = 'received', received_at = now(), received_by = $2
      WHERE id = $1 AND status = 'owed' RETURNING id`,
    [feeId, admin.id],
  );
  if (updated[0]) {
    await query(`INSERT INTO audit_logs (actor_id, action, target_id) VALUES ($1, 'platform.savings_fee_received', $2)`, [admin.id, feeId]);
  }
  revalidatePath("/admin", "layout");
}
