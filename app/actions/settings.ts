"use server";

import { revalidatePath } from "next/cache";
import { transaction } from "@/lib/db";
import { requireRole } from "@/lib/dal";
import { readUpload } from "@/lib/files";
import { fmt } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import type { FormState } from "@/lib/definitions";

const MIN_AMOUNT = 1_000;
const MAX_AMOUNT = 100_000_000;

/**
 * Records a fund mode / rate change approved at a joint meeting. The minutes file,
 * the change row and the new clan setting are written in one transaction; the
 * database trigger rejects any rate change that doesn't come with such a row.
 */
export async function changeFundSettings(_state: FormState, formData: FormData): Promise<FormState> {
  const leader = await requireRole("clan_admin");
  const t = (await getT()).settings;

  const mode = formData.get("mode") === "A" ? "A" : "B";
  const amountRaw = String(formData.get("amount") ?? "").replace(/[\s,]/g, "");
  const period = mode === "A" ? String(formData.get("period") ?? "") : "";
  const meetingDate = String(formData.get("meetingDate") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  const values = { mode, amount: amountRaw, period, meetingDate, note: note ?? "" };

  const errors: Record<string, string[]> = {};
  const amount = Number(amountRaw);
  if (!/^\d+$/.test(amountRaw) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) errors.amount = [t.amountInvalid];
  if (mode === "A" && period !== "monthly" && period !== "yearly") errors.period = [t.periodRequired];
  if (!isPastOrToday(meetingDate)) errors.meetingDate = [t.meetingDateInvalid];
  const upload = await readUpload(formData.get("minutes"));
  if (!upload.ok) {
    errors.minutes = [upload.reason === "size" ? t.minutesSize : upload.reason === "type" ? t.minutesType : t.minutesRequired];
  }
  if (Object.keys(errors).length || !upload.ok) return { errors, values };

  const newPeriod = mode === "A" ? period : null;
  const result = await transaction(async (db) => {
    const current = (
      await db.query<{ fund_mode: "A" | "B"; contribution_amount: string; contribution_period: string | null; rate_version: number }>(
        `SELECT fund_mode, contribution_amount, contribution_period, rate_version FROM clans WHERE id = $1 FOR UPDATE`,
        [leader.clanId],
      )
    ).rows[0];

    if (current.fund_mode === mode && Number(current.contribution_amount) === amount && current.contribution_period === newPeriod) {
      return { unchanged: true as const };
    }

    const version = current.rate_version + 1;
    const file = await db.query<{ id: string }>(
      `INSERT INTO files (clan_id, uploaded_by, purpose, file_name, content_type, size_bytes, data)
       VALUES ($1, $2, 'meeting_minutes', $3, $4, $5, $6) RETURNING id`,
      [leader.clanId, leader.id, upload.fileName, upload.contentType, upload.size, upload.data],
    );
    await db.query(
      `INSERT INTO clan_rate_changes
         (clan_id, changed_by, version, old_fund_mode, new_fund_mode, old_amount, new_amount,
          old_period, new_period, meeting_date, note, minutes_file_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::contribution_period, $9::contribution_period, $10, $11, $12)`,
      [
        leader.clanId, leader.id, version, current.fund_mode, mode, current.contribution_amount, amount,
        current.contribution_period, newPeriod, meetingDate, note, file.rows[0].id,
      ],
    );
    await db.query(
      `UPDATE clans
          SET fund_mode = $2, contribution_amount = $3, contribution_period = $4::contribution_period,
              rate_version = $5, updated_at = now()
        WHERE id = $1`,
      [leader.clanId, mode, amount, newPeriod, version],
    );
    await db.query(
      `INSERT INTO audit_logs (clan_id, actor_id, action, target_id, details) VALUES ($1, $2, 'clan.rate_changed', $1, $3)`,
      [leader.clanId, leader.id, JSON.stringify({ version, mode, amount, period: newPeriod })],
    );
    return { unchanged: false as const, version };
  });

  if (result.unchanged) return { message: t.noChange, values };
  revalidatePath("/clan", "layout");
  return { success: fmt(t.saved, { n: result.version }) };
}

/** YYYY-MM-DD that is a real date, not in the future (one day of slack for time zones), and after 2000. */
function isPastOrToday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return date.getTime() <= Date.now() + 24 * 60 * 60 * 1000 && date.getUTCFullYear() >= 2000;
}
