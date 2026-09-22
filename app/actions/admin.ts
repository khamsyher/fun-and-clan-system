"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne, transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { hashPassword } from "@/lib/password";
import { createClanSchema, type FormState } from "@/lib/definitions";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

export async function createClan(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("super_admin");
  const t = await getT();
  const values = Object.fromEntries(
    ["code", "name", "leaderName", "leaderPhone", "leaderPassword"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const echo = { ...values, leaderPassword: "" };
  const parsed = createClanSchema(t.errors).safeParse(values);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, values: echo };
  const d = parsed.data;

  if (await queryOne(`SELECT 1 FROM clans WHERE code = $1`, [d.code])) {
    return { errors: { code: [t.admin.codeTaken] }, values: echo };
  }
  if (await queryOne(`SELECT 1 FROM users WHERE phone = $1`, [d.leaderPhone])) {
    return { errors: { leaderPhone: [t.admin.phoneTaken] }, values: echo };
  }

  const passwordHash = await hashPassword(d.leaderPassword);
  await transaction(async (db) => {
    const clan = await db.query<{ id: string }>(
      `INSERT INTO clans (code, name) VALUES ($1, $2) RETURNING id`,
      [d.code, d.name],
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

  revalidatePath("/admin");
  return { success: fmt(t.admin.clanCreated, { clan: d.name, leader: d.leaderName, phone: d.leaderPhone }) };
}

export async function setClanActive(formData: FormData) {
  const admin = await requireRole("super_admin");
  const clanId = String(formData.get("clanId"));
  const active = formData.get("active") === "true";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clanId)) return;
  await query(`UPDATE clans SET is_active = $2, updated_at = now() WHERE id = $1`, [clanId, active]);
  await query(
    `INSERT INTO audit_logs (clan_id, actor_id, action, target_id) VALUES ($1, $2, $3, $1)`,
    [clanId, admin.id, active ? "clan.enabled" : "clan.disabled"],
  );
  revalidatePath("/admin");
}

export async function updatePlatformFee(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireRole("super_admin");
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
  revalidatePath("/admin");
  return { success: fmt(t.admin.feeSaved, { fee: rounded }) };
}

/** The system owner confirms a platform fee arrived in their account. */
export async function markFeeReceived(formData: FormData) {
  const admin = await requireRole("super_admin");
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
  revalidatePath("/admin");
}
