import "server-only";
import { query, queryOne } from "./db";
import type { Role, UserStatus } from "./definitions";

/** The kinds of account the Super Admin can filter by. Mapped from the URL, never used as a role directly. */
export const PEOPLE_FILTERS: Record<string, Role> = { leaders: "clan_admin", members: "member", general: "user" };

export type AdminUserRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  village: string | null;
  role: Role;
  status: UserStatus;
  is_treasurer: boolean;
  created_at: Date;
  last_login_at: Date | null;
  clan_name: string | null;
  clan_code: string | null;
};

export type PeopleCounts = { everyone: string; leaders: string; members: string; general: string; waiting: string };

/**
 * How many accounts of each kind there are.
 * Comparing role::text keeps a value that came from the URL out of an enum cast.
 */
export function countPeople() {
  return queryOne<PeopleCounts>(
    `SELECT COUNT(*) AS everyone,
            COUNT(*) FILTER (WHERE role::text = 'clan_admin') AS leaders,
            COUNT(*) FILTER (WHERE role::text = 'member') AS members,
            COUNT(*) FILTER (WHERE role::text = 'user') AS general,
            COUNT(*) FILTER (WHERE status::text = 'pending') AS waiting
       FROM users`,
  );
}

export const USER_LIST_LIMIT = 200;

/** Every account on the platform, newest first, optionally narrowed by kind and by a search. */
export function listUsers({ people = "all", q = "" }: { people?: string; q?: string }) {
  const role = PEOPLE_FILTERS[people] ?? null;
  const waitingOnly = people === "waiting";
  const search = q.trim() ? q.trim() : null;
  return query<AdminUserRow>(
    `SELECT u.id, u.full_name, u.phone, u.email, u.village, u.role, u.status, u.is_treasurer,
            u.created_at, u.last_login_at, c.name AS clan_name, c.code AS clan_code
       FROM users u
       LEFT JOIN clans c ON c.id = u.clan_id
      WHERE ($1::text IS NULL OR u.role::text = $1)
        AND (NOT $2 OR u.status::text = 'pending')
        AND ($3::text IS NULL
             OR u.full_name ILIKE '%' || $3 || '%'
             OR u.phone ILIKE '%' || $3 || '%'
             OR COALESCE(u.email, '') ILIKE '%' || $3 || '%'
             OR COALESCE(c.code, '') ILIKE '%' || $3 || '%')
      ORDER BY u.created_at DESC
      LIMIT ${USER_LIST_LIMIT}`,
    [role, waitingOnly, search],
  );
}

export type AdminUserDetail = AdminUserRow & {
  clan_id: string | null;
  approved_at: Date | null;
  approved_by_name: string | null;
  password_changed_at: Date | null;
  deceased_at: Date | null;
  family: string;
  requests: string;
  donations: string;
  open_bills: string;
  slips: string;
};

/** Everything the Super Admin sees about one account. No money of any clan, only this person's own counts. */
export function getUser(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve(null);
  return queryOne<AdminUserDetail>(
    `SELECT u.id, u.full_name, u.phone, u.email, u.village, u.role, u.status, u.is_treasurer,
            u.created_at, u.last_login_at, u.clan_id, u.approved_at, u.password_changed_at, u.deceased_at,
            c.name AS clan_name, c.code AS clan_code, a.full_name AS approved_by_name,
            (SELECT COUNT(*) FROM dependents d WHERE d.member_id = u.id AND d.is_active) AS family,
            (SELECT COUNT(*) FROM donation_requests r WHERE r.created_by = u.id) AS requests,
            (SELECT COUNT(*) FROM donations dn WHERE dn.donor_id = u.id) AS donations,
            (SELECT COUNT(*) FROM event_bills b WHERE b.member_id = u.id AND b.status IN ('unpaid', 'carried')) AS open_bills,
            (SELECT COUNT(*) FROM payment_slips s WHERE s.member_id = u.id) AS slips
       FROM users u
       LEFT JOIN clans c ON c.id = u.clan_id
       LEFT JOIN users a ON a.id = u.approved_by
      WHERE u.id = $1`,
    [id],
  );
}

export type UserEvent = { id: string; action: string; created_at: Date; actor_name: string | null };

/** What has been done to this account, newest first. */
export function userHistory(id: string, limit = 12) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve([]);
  return query<UserEvent>(
    `SELECT l.id, l.action, l.created_at, a.full_name AS actor_name
       FROM audit_logs l
       LEFT JOIN users a ON a.id = l.actor_id
      WHERE l.target_id = $1
      ORDER BY l.created_at DESC
      LIMIT $2`,
    [id, limit],
  );
}
