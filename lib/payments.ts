import "server-only";
import { query } from "./db";

export type OpenItem = {
  kind: "bill" | "debt" | "due";
  id: string;
  amount: string;
  carried_in: string; // earlier debt shown on an open bill
  event_no: number | null;
  deceased_name: string | null;
  label: string | null; // contribution period
  pending_slip: boolean;
  last_rejection: string | null;
};

/** Everything a member can still pay: open bills, debts carried from closed events, and unpaid dues. */
export function memberOpenItems(clanId: string, memberId: string) {
  return query<OpenItem>(
    `SELECT CASE WHEN b.status = 'carried' THEN 'debt' ELSE 'bill' END AS kind, b.id, b.amount, b.carried_in,
            e.event_no, e.deceased_name, NULL AS label,
            EXISTS (SELECT 1 FROM payment_slips s WHERE s.bill_id = b.id AND s.status = 'pending') AS pending_slip,
            (SELECT s.review_note FROM payment_slips s WHERE s.bill_id = b.id AND s.status = 'rejected'
              ORDER BY s.reviewed_at DESC LIMIT 1) AS last_rejection
       FROM event_bills b JOIN death_events e ON e.id = b.event_id
      WHERE b.clan_id = $1 AND b.member_id = $2
        AND (b.status = 'carried' OR (b.status = 'unpaid' AND e.status = 'collecting'))
     UNION ALL
     SELECT 'due', d.id, d.amount, 0, NULL, NULL, p.label,
            EXISTS (SELECT 1 FROM payment_slips s WHERE s.due_id = d.id AND s.status = 'pending'),
            (SELECT s.review_note FROM payment_slips s WHERE s.due_id = d.id AND s.status = 'rejected'
              ORDER BY s.reviewed_at DESC LIMIT 1)
       FROM contribution_dues d JOIN contribution_periods p ON p.id = d.period_id
      WHERE d.clan_id = $1 AND d.member_id = $2 AND d.status = 'unpaid'
      ORDER BY 1, 5 NULLS LAST, 7`,
    [clanId, memberId],
  );
}

export type SlipRow = {
  id: string;
  member_id: string;
  member_name: string;
  member_phone: string;
  status: "pending" | "approved" | "rejected";
  amount_claimed: string;
  transfer_date: Date;
  note: string | null;
  review_note: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  file_id: string;
  content_type: string;
  include_debt: boolean;
  bill_status: string | null;
  event_no: number | null;
  deceased_name: string | null;
  label: string | null;
  expected: string; // what the slip should cover
  debt: string; // earlier debt covered when include_debt
};

const SLIP_SELECT = `
  SELECT s.id, s.member_id, u.full_name AS member_name, u.phone AS member_phone, s.status, s.amount_claimed,
         s.transfer_date, s.note, s.review_note, s.reviewed_at, s.created_at, s.file_id, f.content_type,
         s.include_debt, b.status AS bill_status, e.event_no, e.deceased_name, p.label,
         COALESCE(b.amount, d.amount) AS expected,
         CASE WHEN s.include_debt THEN
           (SELECT COALESCE(SUM(x.amount), 0) FROM event_bills x WHERE x.member_id = s.member_id AND x.status = 'carried' AND x.id <> s.bill_id)
         ELSE 0 END AS debt
    FROM payment_slips s
    JOIN users u ON u.id = s.member_id
    JOIN files f ON f.id = s.file_id
    LEFT JOIN event_bills b ON b.id = s.bill_id
    LEFT JOIN death_events e ON e.id = b.event_id
    LEFT JOIN contribution_dues d ON d.id = s.due_id
    LEFT JOIN contribution_periods p ON p.id = d.period_id`;

export function clanSlips(clanId: string, status: "pending" | "reviewed") {
  return query<SlipRow>(
    `${SLIP_SELECT}
      WHERE s.clan_id = $1 AND ${status === "pending" ? "s.status = 'pending'" : "s.status <> 'pending'"}
      ORDER BY ${status === "pending" ? "s.created_at" : "s.reviewed_at DESC"}
      LIMIT 100`,
    [clanId],
  );
}

export function memberSlips(clanId: string, memberId: string) {
  return query<SlipRow>(`${SLIP_SELECT} WHERE s.clan_id = $1 AND s.member_id = $2 ORDER BY s.created_at DESC LIMIT 50`, [
    clanId,
    memberId,
  ]);
}

export type HistoryRow = {
  kind: "bill" | "debt" | "due";
  paid_at: Date;
  amount: string;
  method: "cash" | "transfer" | null;
  via_slip: boolean;
  event_no: number | null;
  deceased_name: string | null;
  label: string | null;
};

/** Every payment a member has made: event bills, debts paid later, and contributions. */
export function memberHistory(clanId: string, memberId: string) {
  return query<HistoryRow>(
    `SELECT CASE WHEN b.status = 'settled' THEN 'debt' ELSE 'bill' END AS kind, b.paid_at, b.amount, b.paid_method AS method,
            EXISTS (SELECT 1 FROM fund_ledger l WHERE l.bill_id = b.id AND l.slip_id IS NOT NULL) AS via_slip,
            e.event_no, e.deceased_name, NULL AS label
       FROM event_bills b JOIN death_events e ON e.id = b.event_id
      WHERE b.clan_id = $1 AND b.member_id = $2 AND b.status IN ('paid', 'settled')
     UNION ALL
     SELECT 'due', d.paid_at, d.amount, d.paid_method,
            EXISTS (SELECT 1 FROM fund_ledger l WHERE l.due_id = d.id AND l.slip_id IS NOT NULL),
            NULL, NULL, p.label
       FROM contribution_dues d JOIN contribution_periods p ON p.id = d.period_id
      WHERE d.clan_id = $1 AND d.member_id = $2 AND d.status = 'paid'
      ORDER BY 2 DESC`,
    [clanId, memberId],
  );
}
