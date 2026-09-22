import "server-only";
import { query, queryOne } from "./db";

export type EventStatus = "collecting" | "awaiting_payout" | "completed" | "cancelled";
export type BillStatus = "unpaid" | "paid" | "carried" | "settled" | "void";
export type PayoutStatus = "requested" | "approved" | "rejected" | "paid";

export type EventRow = {
  id: string;
  event_no: number;
  deceased_name: string;
  deceased_relationship: "spouse" | "child" | "father" | "mother" | null;
  family_name: string;
  family_member_id: string;
  date_of_death: Date;
  note: string | null;
  fund_mode: "A" | "B";
  rate_version: number;
  rate_amount: string;
  platform_fee_percent: string;
  status: EventStatus;
  gross_collected: string | null;
  fee_amount: string | null;
  reported_at: Date;
  closed_at: Date | null;
  completed_at: Date | null;
  // Collection totals (Mode B), void bills excluded
  bills_total: string;
  bills_paid: string;
  raised: string;
  expected: string;
};

const EVENT_SELECT = `
  SELECT e.id, e.event_no, e.deceased_name, e.deceased_relationship, f.full_name AS family_name, e.family_member_id,
         e.date_of_death, e.note, e.fund_mode, e.rate_version, e.rate_amount, e.platform_fee_percent, e.status,
         e.gross_collected, e.fee_amount, e.reported_at, e.closed_at, e.completed_at,
         COUNT(b.id) FILTER (WHERE b.status <> 'void') AS bills_total,
         COUNT(b.id) FILTER (WHERE b.status IN ('paid')) AS bills_paid,
         COALESCE(SUM(b.amount) FILTER (WHERE b.status = 'paid'), 0) AS raised,
         COALESCE(SUM(b.amount) FILTER (WHERE b.status <> 'void'), 0) AS expected
    FROM death_events e
    JOIN users f ON f.id = e.family_member_id
    LEFT JOIN event_bills b ON b.event_id = e.id`;

/** All events of one clan, newest first. */
export function listEvents(clanId: string) {
  return query<EventRow>(`${EVENT_SELECT} WHERE e.clan_id = $1 GROUP BY e.id, f.full_name ORDER BY e.event_no DESC`, [clanId]);
}

/** One event, only if it belongs to the clan. */
export function getEvent(clanId: string, eventId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return Promise.resolve(null);
  return queryOne<EventRow>(`${EVENT_SELECT} WHERE e.clan_id = $1 AND e.id = $2 GROUP BY e.id, f.full_name`, [clanId, eventId]);
}

export type PayoutRow = {
  id: string;
  amount: string;
  receiver_name: string;
  receiver_phone: string | null;
  note: string | null;
  status: PayoutStatus;
  requested_by_name: string;
  requested_at: Date;
  decided_by_name: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  paid_at: Date | null;
  paid_method: "cash" | "transfer" | null;
  proof_file_id: string | null;
};

/** Every payout attempt for an event (rejected ones included), newest first. */
export function listPayouts(clanId: string, eventId: string) {
  return query<PayoutRow>(
    `SELECT p.id, p.amount, p.receiver_name, p.receiver_phone, p.note, p.status,
            r.full_name AS requested_by_name, p.requested_at,
            d.full_name AS decided_by_name, p.decided_at, p.decision_note,
            p.paid_at, p.paid_method, p.proof_file_id
       FROM payouts p
       JOIN users r ON r.id = p.requested_by
       LEFT JOIN users d ON d.id = p.decided_by
      WHERE p.clan_id = $1 AND p.event_id = $2
      ORDER BY p.requested_at DESC`,
    [clanId, eventId],
  );
}

/** What a member owes: unpaid bills of open collections and unpaid savings dues, plus debt carried from closed events. */
export async function memberDebt(clanId: string, memberId: string) {
  const row = await queryOne<{ open: string; carried: string }>(
    `SELECT (SELECT COALESCE(SUM(b.amount), 0) FROM event_bills b JOIN death_events e ON e.id = b.event_id
              WHERE b.clan_id = $1 AND b.member_id = $2 AND b.status = 'unpaid' AND e.status = 'collecting')
          + (SELECT COALESCE(SUM(amount), 0) FROM contribution_dues WHERE clan_id = $1 AND member_id = $2 AND status = 'unpaid') AS open,
            (SELECT COALESCE(SUM(amount), 0) FROM event_bills WHERE clan_id = $1 AND member_id = $2 AND status = 'carried') AS carried`,
    [clanId, memberId],
  );
  return { open: Number(row?.open ?? 0), carried: Number(row?.carried ?? 0) };
}

export async function clanBalance(clanId: string) {
  const row = await queryOne<{ balance: string; promised: string }>(
    `SELECT (SELECT COALESCE(SUM(amount), 0) FROM fund_ledger WHERE clan_id = $1) AS balance,
            (SELECT COALESCE(SUM(p.amount + CASE WHEN e.fund_mode = 'A' THEN ROUND(p.amount * e.platform_fee_percent / 100) ELSE 0 END), 0)
               FROM payouts p JOIN death_events e ON e.id = p.event_id
              WHERE p.clan_id = $1 AND p.status IN ('requested', 'approved')) AS promised`,
    [clanId],
  );
  const balance = Number(row?.balance ?? 0);
  const promised = Number(row?.promised ?? 0);
  return { balance, promised, available: balance - promised };
}
