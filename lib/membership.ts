import "server-only";
import { query, queryOne } from "./db";

export type JoinStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type MyJoinRequest = {
  id: string;
  status: JoinStatus;
  note: string | null;
  created_at: Date;
  decided_at: Date | null;
  clan_name: string;
  clan_code: string;
};

/** The general user's most recent request to join a clan, whatever came of it. */
export function latestJoinRequest(userId: string) {
  return queryOne<MyJoinRequest>(
    `SELECT j.id, j.status, j.note, j.created_at, j.decided_at, c.name AS clan_name, c.code AS clan_code
       FROM clan_join_requests j
       JOIN clans c ON c.id = j.clan_id
      WHERE j.user_id = $1
      ORDER BY j.created_at DESC
      LIMIT 1`,
    [userId],
  );
}

export type JoinRequestRow = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  village: string | null;
  created_at: Date;
};

/** People waiting for this clan's leader to let them in. Scoped to one clan. */
export function pendingJoinRequests(clanId: string) {
  return query<JoinRequestRow>(
    `SELECT j.id, j.user_id, u.full_name, u.phone, u.email, u.village, j.created_at
       FROM clan_join_requests j
       JOIN users u ON u.id = j.user_id
      WHERE j.clan_id = $1 AND j.status = 'pending'
      ORDER BY j.created_at`,
    [clanId],
  );
}
