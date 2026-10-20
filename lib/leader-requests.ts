import "server-only";
import { query, queryOne } from "./db";
import type { JoinStatus } from "./membership";

/** A general user's latest request to lead a new clan, whatever became of it. */
export type MyLeaderRequest = {
  id: string;
  clan_name: string;
  status: JoinStatus;
  note: string | null;
  created_at: Date;
  clan_code: string | null;
};

export function latestLeaderRequest(userId: string) {
  return queryOne<MyLeaderRequest>(
    `SELECT r.id, r.clan_name, r.status, r.note, r.created_at, c.code AS clan_code
       FROM clan_leader_requests r LEFT JOIN clans c ON c.id = r.clan_id
      WHERE r.user_id = $1 AND r.status <> 'withdrawn'
      ORDER BY r.created_at DESC LIMIT 1`,
    [userId],
  );
}

/** What staff see when deciding: the proposal, and enough about the person to judge it. */
export type LeaderRequestRow = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  kyc_approved: boolean;
  clan_name: string;
  description: string | null;
  reason: string | null;
  status: JoinStatus;
  note: string | null;
  clan_id: string | null;
  clan_code: string | null;
  decided_by_name: string | null;
  decided_at: Date | null;
  created_at: Date;
};

const SELECT = `
  SELECT r.id, r.user_id, u.full_name, u.phone,
         EXISTS (SELECT 1 FROM user_documents d WHERE d.user_id = u.id AND d.status = 'approved') AS kyc_approved,
         r.clan_name, r.description, r.reason, r.status, r.note, r.clan_id, c.code AS clan_code,
         s.full_name AS decided_by_name, r.decided_at, r.created_at
    FROM clan_leader_requests r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN clans c ON c.id = r.clan_id
    LEFT JOIN users s ON s.id = r.decided_by`;

/** Waiting requests, oldest first, so nobody is left at the back of the queue. */
export function pendingLeaderRequests() {
  return query<LeaderRequestRow>(`${SELECT} WHERE r.status = 'pending' ORDER BY r.created_at`);
}

export function recentLeaderDecisions(limit = 20) {
  return query<LeaderRequestRow>(`${SELECT} WHERE r.status IN ('approved', 'rejected') ORDER BY r.decided_at DESC LIMIT $1`, [limit]);
}

export async function countPendingLeaderRequests() {
  const r = await queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM clan_leader_requests WHERE status = 'pending'`);
  return Number(r?.n ?? 0);
}
