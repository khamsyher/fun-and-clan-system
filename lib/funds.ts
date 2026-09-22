import "server-only";
import type { PoolClient } from "pg";

/** Platform fee in whole Kip, rounded half up. */
export function feeFor(base: number, percent: number | string) {
  return Math.round((base * Number(percent)) / 100);
}

/** Sum of the clan's ledger: money actually held in the fund. */
export async function fundBalance(db: PoolClient, clanId: string) {
  const r = await db.query<{ balance: string }>(
    `SELECT COALESCE(SUM(amount), 0) AS balance FROM fund_ledger WHERE clan_id = $1`,
    [clanId],
  );
  return Number(r.rows[0].balance);
}

/**
 * Money that can still be promised: the balance minus payouts that are requested or approved
 * but not yet paid (and, for Mode A, the platform fee those payouts will trigger).
 */
export async function availableForPayout(db: PoolClient, clanId: string, excludePayoutId?: string) {
  const balance = await fundBalance(db, clanId);
  const r = await db.query<{ promised: string }>(
    `SELECT COALESCE(SUM(p.amount + CASE WHEN e.fund_mode = 'A' THEN ROUND(p.amount * e.platform_fee_percent / 100) ELSE 0 END), 0) AS promised
       FROM payouts p JOIN death_events e ON e.id = p.event_id
      WHERE p.clan_id = $1 AND p.status IN ('requested', 'approved') AND ($2::uuid IS NULL OR p.id <> $2::uuid)`,
    [clanId, excludePayoutId ?? null],
  );
  return balance - Number(r.rows[0].promised);
}

/** Locks the clan row so money checks and writes for one clan happen one at a time. */
export async function lockClan(db: PoolClient, clanId: string) {
  await db.query(`SELECT 1 FROM clans WHERE id = $1 FOR UPDATE`, [clanId]);
}

export async function audit(
  db: PoolClient,
  clanId: string | null,
  actorId: string,
  action: string,
  targetId: string | null,
  details?: Record<string, unknown>,
) {
  await db.query(`INSERT INTO audit_logs (clan_id, actor_id, action, target_id, details) VALUES ($1, $2, $3, $4, $5)`, [
    clanId,
    actorId,
    action,
    targetId,
    details ? JSON.stringify(details) : null,
  ]);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** YYYY-MM-DD, a real date, not in the future (one day of time-zone slack), from 1900. */
export function isPastDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return date.getTime() <= Date.now() + 24 * 60 * 60 * 1000 && date.getUTCFullYear() >= 1900;
}

/** Parses a whole-Kip amount typed with optional commas/spaces. */
export function parseKip(raw: FormDataEntryValue | null, max = 1_000_000_000) {
  const text = String(raw ?? "").replace(/[\s,]/g, "");
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && n <= max ? n : null;
}

/** Marks every carried debt of a member as paid, one ledger entry per debt (kept per event). */
export async function settleCarried(
  db: PoolClient,
  clanId: string,
  actorId: string,
  memberId: string,
  method: string,
  slipId: string | null = null,
) {
  const debts = await db.query<{ id: string; amount: string; event_id: string }>(
    `UPDATE event_bills SET status = 'settled', paid_at = now(), paid_method = $3, recorded_by = $4
      WHERE member_id = $1 AND clan_id = $2 AND status = 'carried'
      RETURNING id, amount, event_id`,
    [memberId, clanId, method, actorId],
  );
  for (const d of debts.rows) {
    await db.query(
      `INSERT INTO fund_ledger (clan_id, entry_type, amount, event_id, bill_id, slip_id, note, created_by)
       VALUES ($1, 'debt_collection', $2, $3, $4, $5, $6, $7)`,
      [clanId, d.amount, d.event_id, d.id, slipId, method, actorId],
    );
  }
  return debts.rows.reduce((sum, d) => sum + Number(d.amount), 0);
}
