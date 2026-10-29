import "server-only";
import { query, queryOne } from "./db";
import type { JoinStatus } from "./membership";

/** One version of a clan's rules. */
export type PolicyRow = {
  id: string;
  body: string;
  status: JoinStatus;
  note: string | null;
  created_at: Date;
  updated_at: Date;
  decided_at: Date | null;
  decided_by_name: string | null;
};

const COLS = `p.id, p.body, p.status, p.note, p.created_at, p.updated_at, p.decided_at, d.full_name AS decided_by_name`;

/** The rules members follow now: the latest approved version, if any. */
export function currentPolicy(clanId: string) {
  return queryOne<PolicyRow>(
    `SELECT ${COLS} FROM clan_policies p LEFT JOIN users d ON d.id = p.decided_by
      WHERE p.clan_id = $1 AND p.status = 'approved'
      ORDER BY p.decided_at DESC LIMIT 1`,
    [clanId],
  );
}

/** The leader's latest sent version that isn't the current one: waiting, or declined. */
export function latestDraft(clanId: string) {
  return queryOne<PolicyRow>(
    `SELECT ${COLS} FROM clan_policies p LEFT JOIN users d ON d.id = p.decided_by
      WHERE p.clan_id = $1 AND p.status IN ('pending', 'rejected')
        AND p.created_at > COALESCE((SELECT MAX(created_at) FROM clan_policies WHERE clan_id = $1 AND status = 'approved'), '-infinity')
      ORDER BY p.created_at DESC LIMIT 1`,
    [clanId],
  );
}

/** Earlier approved versions, newest first, without the current one. */
export function pastPolicies(clanId: string) {
  return query<PolicyRow>(
    `SELECT ${COLS} FROM clan_policies p LEFT JOIN users d ON d.id = p.decided_by
      WHERE p.clan_id = $1 AND p.status = 'approved'
      ORDER BY p.decided_at DESC OFFSET 1`,
    [clanId],
  );
}

/** Each active member and whether (and when) they agreed to this version. */
export function policyAgreements(clanId: string, policyId: string) {
  return query<{ id: string; full_name: string; agreed_at: Date | null }>(
    `SELECT u.id, u.full_name, a.agreed_at
       FROM users u
       LEFT JOIN clan_policy_agreements a ON a.user_id = u.id AND a.policy_id = $2
      WHERE u.clan_id = $1 AND u.role = 'member' AND u.status = 'active' AND u.deceased_at IS NULL
      ORDER BY a.agreed_at IS NULL DESC, lower(u.full_name)`,
    [clanId, policyId],
  );
}

export async function hasAgreed(policyId: string, userId: string) {
  const r = await queryOne<{ agreed_at: Date }>(`SELECT agreed_at FROM clan_policy_agreements WHERE policy_id = $1 AND user_id = $2`, [
    policyId,
    userId,
  ]);
  return r?.agreed_at ?? null;
}

/** What staff see when deciding: the new text next to the one it replaces. */
export type PendingPolicyRow = {
  id: string;
  clan_id: string;
  clan_name: string;
  clan_code: string;
  body: string;
  submitted_by_name: string | null;
  updated_at: Date;
  current_body: string | null;
};

export function pendingPolicies() {
  return query<PendingPolicyRow>(
    `SELECT p.id, p.clan_id, c.name AS clan_name, c.code AS clan_code, p.body, s.full_name AS submitted_by_name, p.updated_at,
            (SELECT body FROM clan_policies x WHERE x.clan_id = p.clan_id AND x.status = 'approved' ORDER BY x.decided_at DESC LIMIT 1) AS current_body
       FROM clan_policies p
       JOIN clans c ON c.id = p.clan_id
       LEFT JOIN users s ON s.id = p.submitted_by
      WHERE p.status = 'pending'
      ORDER BY p.updated_at`,
  );
}

export function recentPolicyDecisions(limit = 15) {
  return query<{ id: string; clan_id: string; clan_name: string; status: JoinStatus; note: string | null; decided_at: Date; decided_by_name: string | null }>(
    `SELECT p.id, p.clan_id, c.name AS clan_name, p.status, p.note, p.decided_at, d.full_name AS decided_by_name
       FROM clan_policies p JOIN clans c ON c.id = p.clan_id LEFT JOIN users d ON d.id = p.decided_by
      WHERE p.status IN ('approved', 'rejected')
      ORDER BY p.decided_at DESC LIMIT $1`,
    [limit],
  );
}

export async function countPendingPolicies() {
  const r = await queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM clan_policies WHERE status = 'pending'`);
  return Number(r?.n ?? 0);
}
