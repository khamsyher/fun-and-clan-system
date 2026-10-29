import "server-only";
import { query, queryOne } from "./db";

export type GroupStatus = "forming" | "active" | "completed" | "cancelled";
export type SavingsPeriod = "weekly" | "monthly";
export type MemberStatus = "pending" | "approved" | "declined" | "removed";
export type RoundStatus = "upcoming" | "collecting" | "done";
export type PaymentStatus = "unpaid" | "pending" | "confirmed" | "rejected";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GroupRow = {
  id: string;
  organizer_id: string;
  organizer_name: string;
  name: string;
  description: string | null;
  rules: string | null;
  rules_file_id: string | null;
  rules_updated_at: Date | null;
  amount: string;
  period: SavingsPeriod;
  start_date: string; // YYYY-MM-DD
  invite_code: string;
  fee_percent: string | null;
  status: GroupStatus;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  members: string; // approved members
};

// Savings groups cross clans: access is decided by membership in the group, never by clan.
const GROUP_SELECT = `
  SELECT g.id, g.organizer_id, o.full_name AS organizer_name, g.name, g.description, g.rules, g.rules_file_id, g.rules_updated_at, g.amount, g.period,
         to_char(g.start_date, 'YYYY-MM-DD') AS start_date, g.invite_code, g.fee_percent, g.status,
         g.created_at, g.started_at, g.completed_at,
         (SELECT COUNT(*) FROM savings_members m WHERE m.group_id = g.id AND m.status = 'approved') AS members
    FROM savings_groups g JOIN users o ON o.id = g.organizer_id`;

/** The page checks the viewer's membership before showing anything beyond the name. */
export function getGroup(id: string) {
  if (!UUID.test(id)) return Promise.resolve(null);
  return queryOne<GroupRow>(`${GROUP_SELECT} WHERE g.id = $1`, [id]);
}

/** Only a group still taking members can be found by its code. */
export function getFormingGroupByCode(code: string) {
  return queryOne<GroupRow>(`${GROUP_SELECT} WHERE g.invite_code = $1 AND g.status = 'forming'`, [code]);
}

export type MyGroupRow = {
  id: string;
  name: string;
  amount: string;
  period: SavingsPeriod;
  status: GroupStatus;
  organizer_id: string;
  organizer_name: string;
  my_status: MemberStatus;
  my_turn: number | null;
  members: string;
  current_round: number | null;
  invite_code: string;
};

/** Groups the person belongs to or has asked to join; finished ones last. */
export function myGroups(userId: string) {
  return query<MyGroupRow>(
    `SELECT g.id, g.name, g.amount, g.period, g.status, g.organizer_id, o.full_name AS organizer_name, g.invite_code,
            me.status AS my_status, me.turn_no AS my_turn,
            (SELECT COUNT(*) FROM savings_members m WHERE m.group_id = g.id AND m.status = 'approved') AS members,
            (SELECT r.round_no FROM savings_rounds r WHERE r.group_id = g.id AND r.status = 'collecting') AS current_round
       FROM savings_members me
       JOIN savings_groups g ON g.id = me.group_id
       JOIN users o ON o.id = g.organizer_id
      WHERE me.user_id = $1 AND me.status IN ('pending', 'approved') AND g.status <> 'cancelled'
      ORDER BY (g.status = 'completed'), g.created_at DESC`,
    [userId],
  );
}

export type OrderRow = {
  group_id: string;
  turn: number;
  full_name: string;
  user_id: string;
  due_date: string; // YYYY-MM-DD
  status: RoundStatus;
};

/**
 * Who receives in which round, for several groups at once. A started group reads its rounds;
 * a forming group reads the current turn order, with dates worked out from the start date.
 */
export function receivingOrders(groupIds: string[]) {
  if (groupIds.length === 0) return Promise.resolve([] as OrderRow[]);
  return query<OrderRow>(
    `SELECT r.group_id, r.round_no AS turn, u.full_name, m.user_id, to_char(r.due_date, 'YYYY-MM-DD') AS due_date, r.status
       FROM savings_rounds r
       JOIN savings_members m ON m.id = r.receiver_member_id
       JOIN users u ON u.id = m.user_id
      WHERE r.group_id = ANY($1::uuid[])
     UNION ALL
     SELECT m.group_id, m.turn_no, u.full_name, m.user_id,
            to_char(CASE WHEN g.period = 'weekly' THEN g.start_date + (m.turn_no - 1) * 7
                         ELSE (g.start_date + (m.turn_no - 1) * interval '1 month')::date END, 'YYYY-MM-DD'),
            'upcoming'::savings_round_status
       FROM savings_members m
       JOIN savings_groups g ON g.id = m.group_id
       JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ANY($1::uuid[]) AND g.status = 'forming' AND m.status = 'approved' AND m.turn_no IS NOT NULL
      ORDER BY 1, 2`,
    [groupIds],
  );
}

export async function myMembership(groupId: string, userId: string) {
  const r = await queryOne<{ status: MemberStatus }>(`SELECT status FROM savings_members WHERE group_id = $1 AND user_id = $2`, [groupId, userId]);
  return r?.status ?? null;
}

export type MemberRow = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string; // shown only to the organizer, when deciding on a request
  clan_name: string | null;
  status: MemberStatus;
  turn_no: number | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  qr_file_id: string | null;
  joined_at: Date;
};

/** Approved members in turn order, then people waiting for approval. */
export function listMembers(groupId: string) {
  return query<MemberRow>(
    `SELECT m.id, m.user_id, u.full_name, u.phone, c.name AS clan_name, m.status, m.turn_no,
            m.bank_name, m.account_name, m.account_number, m.qr_file_id, m.joined_at
       FROM savings_members m JOIN users u ON u.id = m.user_id LEFT JOIN clans c ON c.id = u.clan_id
      WHERE m.group_id = $1 AND m.status IN ('pending', 'approved')
      ORDER BY (m.status = 'pending'), m.turn_no NULLS LAST, m.joined_at`,
    [groupId],
  );
}

export type RoundRow = {
  id: string;
  round_no: number;
  due_date: string; // YYYY-MM-DD
  status: RoundStatus;
  last_reminder_at: Date | null;
  receiver_member_id: string;
  receiver_user_id: string;
  receiver_name: string;
  paid: string;
  total: string;
  pot: string;
};

export function listRounds(groupId: string) {
  return query<RoundRow>(
    `SELECT r.id, r.round_no, to_char(r.due_date, 'YYYY-MM-DD') AS due_date, r.status, r.last_reminder_at,
            r.receiver_member_id, m.user_id AS receiver_user_id, u.full_name AS receiver_name,
            COUNT(p.id) FILTER (WHERE p.status = 'confirmed') AS paid, COUNT(p.id) AS total,
            COALESCE(SUM(p.amount), 0) AS pot
       FROM savings_rounds r
       JOIN savings_members m ON m.id = r.receiver_member_id
       JOIN users u ON u.id = m.user_id
       LEFT JOIN savings_payments p ON p.round_id = r.id
      WHERE r.group_id = $1
      GROUP BY r.id, m.user_id, u.full_name
      ORDER BY r.round_no`,
    [groupId],
  );
}

export type PaymentRow = {
  id: string;
  payer_member_id: string;
  payer_user_id: string;
  payer_name: string;
  amount: string;
  status: PaymentStatus;
  slip_file_id: string | null;
  transfer_date: string | null;
  confirmed_without_slip: boolean;
  review_note: string | null;
};

/** Slips to check first. */
export function listPayments(roundId: string) {
  return query<PaymentRow>(
    `SELECT p.id, p.payer_member_id, m.user_id AS payer_user_id, u.full_name AS payer_name, p.amount, p.status,
            p.slip_file_id, to_char(p.transfer_date, 'YYYY-MM-DD') AS transfer_date, p.confirmed_without_slip, p.review_note
       FROM savings_payments p JOIN savings_members m ON m.id = p.payer_member_id JOIN users u ON u.id = m.user_id
      WHERE p.round_id = $1
      ORDER BY (p.status = 'pending') DESC, u.full_name`,
    [roundId],
  );
}

export type SwapRow = {
  id: string;
  from_member_id: string;
  to_member_id: string;
  from_name: string;
  to_name: string;
  message: string | null;
};

/** Requests to trade turns that are still waiting for an answer. */
export function pendingSwaps(groupId: string) {
  return query<SwapRow>(
    `SELECT s.id, s.from_member_id, s.to_member_id, fu.full_name AS from_name, tu.full_name AS to_name, s.message
       FROM savings_swaps s
       JOIN savings_members fm ON fm.id = s.from_member_id
       JOIN users fu ON fu.id = fm.user_id
       JOIN savings_members tm ON tm.id = s.to_member_id
       JOIN users tu ON tu.id = tm.user_id
      WHERE s.group_id = $1 AND s.status = 'pending'
      ORDER BY s.created_at`,
    [groupId],
  );
}
