import "server-only";
import type { PoolClient } from "pg";
import { pool, query } from "./db";

/**
 * Notification types. The text lives in the dictionaries (notifications.types.*), so each
 * reader sees it in their own language; `params` fills the {placeholders}.
 */
export type NotificationType =
  | "member_approved"
  | "member_rejected"
  | "event_new"
  | "event_debt"
  | "slip_uploaded"
  | "slip_approved"
  | "slip_rejected"
  | "payout_requested"
  | "payout_approved"
  | "payout_rejected"
  | "payout_paid"
  | "period_opened"
  | "donation_new"
  | "donation_received"
  | "donation_confirmed"
  | "donation_rejected"
  | "treasurer_assigned"
  | "join_requested"
  | "join_approved"
  | "join_rejected";

type Params = Record<string, string | number>;
type Db = Pick<PoolClient, "query">;

/** For actions that don't run inside a transaction. */
export const direct: Db = pool;

/** Notifies one person. */
export async function notify(db: Db, userId: string, type: NotificationType, params: Params = {}, link?: string) {
  await db.query(`INSERT INTO notifications (user_id, type, params, link) VALUES ($1, $2, $3, $4)`, [
    userId,
    type,
    JSON.stringify(params),
    link ?? null,
  ]);
}

/** Notifies several people at once (e.g. every member of a clan), skipping an empty list. */
export async function notifyMany(db: Db, userIds: string[], type: NotificationType, params: Params = {}, link?: string) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db.query(
    `INSERT INTO notifications (user_id, type, params, link)
     SELECT id, $2, $3, $4 FROM unnest($1::uuid[]) AS id`,
    [ids, type, JSON.stringify(params), link ?? null],
  );
}

/** Every active member of a clan, optionally excluding one person (usually whoever acted). */
export async function clanMemberIds(db: Db, clanId: string, exceptUserId?: string) {
  const r = await db.query<{ id: string }>(
    `SELECT id FROM users
      WHERE clan_id = $1 AND role = 'member' AND status = 'active' AND deceased_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [clanId, exceptUserId ?? null],
  );
  return r.rows.map((x) => x.id);
}

export async function clanTreasurerIds(db: Db, clanId: string) {
  const r = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE clan_id = $1 AND role = 'member' AND status = 'active' AND is_treasurer`,
    [clanId],
  );
  return r.rows.map((x) => x.id);
}

export async function clanLeaderId(db: Db, clanId: string) {
  const r = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE clan_id = $1 AND role = 'clan_admin' AND status = 'active' ORDER BY created_at LIMIT 1`,
    [clanId],
  );
  return r.rows[0]?.id ?? null;
}

export type NotificationRow = {
  id: string;
  type: NotificationType;
  params: Record<string, string>;
  link: string | null;
  created_at: Date;
  read_at: Date | null;
};

export function listNotifications(userId: string, limit = 50) {
  return query<NotificationRow>(
    `SELECT id, type, params, link, created_at, read_at FROM notifications
      WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [userId, limit],
  );
}

export async function unreadCount(userId: string) {
  const r = await query<{ n: string }>(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [userId]);
  return Number(r[0]?.n ?? 0);
}
