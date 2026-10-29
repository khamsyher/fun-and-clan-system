import "server-only";
import type { PoolClient } from "pg";
import { queryOne } from "./db";

type Db = Pick<PoolClient, "query">;

/** How full a clan is. Leaders don't count; only active members do. `limit` null = no limit. */
export type Room = { limit: number | null; active: number; full: boolean };

const SQL = `SELECT c.member_limit AS "limit",
                    (SELECT COUNT(*) FROM users u WHERE u.clan_id = c.id AND u.role = 'member' AND u.status = 'active')::int AS active
               FROM clans c WHERE c.id = $1`;

const room = (r: { limit: number | null; active: number } | undefined | null): Room => {
  const limit = r?.limit ?? null;
  const active = r?.active ?? 0;
  return { limit, active, full: limit !== null && active >= limit };
};

/** For pages: show the count and whether approving is possible. */
export async function clanRoom(clanId: string) {
  return room(await queryOne<{ limit: number | null; active: number }>(SQL, [clanId]));
}

/**
 * For actions, inside their transaction: locks the clan row first, so two approvals clicked at
 * the same moment are counted one after the other and can't both squeeze past the limit.
 */
export async function lockedRoom(db: Db, clanId: string) {
  await db.query(`SELECT 1 FROM clans WHERE id = $1 FOR UPDATE`, [clanId]);
  return room((await db.query<{ limit: number | null; active: number }>(SQL, [clanId])).rows[0]);
}
