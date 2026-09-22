import "server-only";
import { query, queryOne } from "./db";

/** Day boundaries follow Laos time, so "1 Jan" means midnight in Vientiane, not UTC. */
const TZ = "Asia/Vientiane";
const START = `($2::date)::timestamp AT TIME ZONE '${TZ}'`;
const END = `(($3::date) + 1)::timestamp AT TIME ZONE '${TZ}'`;

export type LedgerType = "deposit" | "collection" | "debt_collection" | "contribution" | "platform_fee" | "payout" | "adjustment";
export const INCOME_TYPES: LedgerType[] = ["collection", "debt_collection", "contribution", "deposit"];
export const EXPENSE_TYPES: LedgerType[] = ["payout", "platform_fee"];

export type Range = { from: string; to: string };

/** Reads ?from=&to= (YYYY-MM-DD), defaulting to this calendar year up to today. */
export function parseRange(sp: { from?: string | string[]; to?: string | string[] }): Range & { valid: boolean } {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  const from = isDate(sp.from) ? sp.from : `${today.slice(0, 4)}-01-01`;
  const to = isDate(sp.to) ? sp.to : today;
  return { from, to, valid: from <= to };
}

export type ClanReport = Awaited<ReturnType<typeof getClanReport>>;

export async function getClanReport(clanId: string, { from, to }: Range) {
  const [clan, opening, byType, events, contributions, outstanding, ledger] = await Promise.all([
    queryOne<{ name: string; code: string; fund_mode: "A" | "B" }>(`SELECT name, code, fund_mode FROM clans WHERE id = $1`, [clanId]),
    queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM fund_ledger WHERE clan_id = $1 AND created_at < ${START}`,
      [clanId, from],
    ),
    query<{ entry_type: LedgerType; total: string; n: string }>(
      `SELECT entry_type, SUM(amount) AS total, COUNT(*) AS n FROM fund_ledger
        WHERE clan_id = $1 AND created_at >= ${START} AND created_at < ${END}
        GROUP BY entry_type`,
      [clanId, from, to],
    ),
    // Events reported in the range, or with money moving in it.
    query<{
      event_no: number;
      deceased_name: string;
      date_of_death: Date;
      status: "collecting" | "awaiting_payout" | "completed" | "cancelled";
      fund_mode: "A" | "B";
      bills_total: string;
      bills_paid: string;
      collected: string;
      fee: string;
      payout: string;
    }>(
      `SELECT e.event_no, e.deceased_name, e.date_of_death, e.status, e.fund_mode,
              (SELECT COUNT(*) FROM event_bills b WHERE b.event_id = e.id AND b.status <> 'void') AS bills_total,
              (SELECT COUNT(*) FROM event_bills b WHERE b.event_id = e.id AND b.status IN ('paid', 'settled')) AS bills_paid,
              (SELECT COALESCE(SUM(l.amount), 0) FROM fund_ledger l
                WHERE l.event_id = e.id AND l.entry_type IN ('collection', 'debt_collection', 'adjustment')) AS collected,
              COALESCE((SELECT f.fee_amount FROM platform_fees f WHERE f.event_id = e.id), 0) AS fee,
              (SELECT COALESCE(SUM(p.amount), 0) FROM payouts p WHERE p.event_id = e.id AND p.status = 'paid') AS payout
         FROM death_events e
        WHERE e.clan_id = $1 AND e.status <> 'cancelled'
          AND ((e.reported_at >= ${START} AND e.reported_at < ${END})
               OR EXISTS (SELECT 1 FROM fund_ledger l WHERE l.event_id = e.id AND l.created_at >= ${START} AND l.created_at < ${END}))
        ORDER BY e.event_no`,
      [clanId, from, to],
    ),
    query<{ label: string; members: string; paid: string; collected: string; expected: string }>(
      `SELECT p.label, COUNT(d.id) FILTER (WHERE d.status <> 'void') AS members,
              COUNT(d.id) FILTER (WHERE d.status = 'paid') AS paid,
              COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'paid'), 0) AS collected,
              COALESCE(SUM(d.amount) FILTER (WHERE d.status <> 'void'), 0) AS expected
         FROM contribution_periods p LEFT JOIN contribution_dues d ON d.period_id = p.id
        WHERE p.clan_id = $1 AND p.opened_at >= ${START} AND p.opened_at < ${END}
        GROUP BY p.id ORDER BY p.label`,
      [clanId, from, to],
    ),
    // What is owed right now (not limited to the range).
    queryOne<{ total: string; members: string }>(
      `WITH owed AS (
         SELECT b.member_id, b.amount FROM event_bills b JOIN death_events e ON e.id = b.event_id
          WHERE b.clan_id = $1 AND (b.status = 'carried' OR (b.status = 'unpaid' AND e.status = 'collecting'))
         UNION ALL
         SELECT member_id, amount FROM contribution_dues WHERE clan_id = $1 AND status = 'unpaid')
       SELECT COALESCE(SUM(amount), 0) AS total, COUNT(DISTINCT member_id) AS members FROM owed`,
      [clanId],
    ),
    query<{
      created_at: Date;
      entry_type: LedgerType;
      amount: string;
      note: string | null;
      created_by_name: string | null;
      event_no: number | null;
      deceased_name: string | null;
      member_name: string | null;
      period_label: string | null;
    }>(
      `SELECT l.created_at, l.entry_type, l.amount, l.note, c.full_name AS created_by_name,
              e.event_no, e.deceased_name, COALESCE(bm.full_name, dm.full_name) AS member_name, cp.label AS period_label
         FROM fund_ledger l
         LEFT JOIN users c ON c.id = l.created_by
         LEFT JOIN death_events e ON e.id = l.event_id
         LEFT JOIN event_bills b ON b.id = l.bill_id
         LEFT JOIN users bm ON bm.id = b.member_id
         LEFT JOIN contribution_dues cd ON cd.id = l.due_id
         LEFT JOIN contribution_periods cp ON cp.id = cd.period_id
         LEFT JOIN users dm ON dm.id = cd.member_id
        WHERE l.clan_id = $1 AND l.created_at >= ${START} AND l.created_at < ${END}
        ORDER BY l.created_at, l.id`,
      [clanId, from, to],
    ),
  ]);

  const totals = Object.fromEntries(byType.map((r) => [r.entry_type, Number(r.total)])) as Partial<Record<LedgerType, number>>;
  const sum = (types: LedgerType[]) => types.reduce((s, k) => s + (totals[k] ?? 0), 0);
  const openingBalance = Number(opening?.total ?? 0);
  const income = sum(INCOME_TYPES);
  const expenses = sum(EXPENSE_TYPES); // negative numbers
  const corrections = totals.adjustment ?? 0;

  return {
    clan: clan!,
    from,
    to,
    openingBalance,
    totals,
    income,
    expenses,
    corrections,
    closingBalance: openingBalance + income + expenses + corrections,
    events,
    contributions,
    outstanding: { total: Number(outstanding?.total ?? 0), members: Number(outstanding?.members ?? 0) },
    ledger,
  };
}

export type PlatformReport = Awaited<ReturnType<typeof getPlatformReport>>;

/** Totals only, per clan and per month — the super admin never sees individual members' payments. */
export async function getPlatformReport({ from, to }: Range) {
  const [clans, months] = await Promise.all([
    query<{
      name: string;
      code: string;
      fund_mode: "A" | "B";
      is_active: boolean;
      members: string;
      events: string;
      collected: string;
      paid_out: string;
      fees_owed: string;
      fees_received: string;
    }>(
      `SELECT c.name, c.code, c.fund_mode, c.is_active,
              (SELECT COUNT(*) FROM users u WHERE u.clan_id = c.id AND u.role = 'member' AND u.status = 'active') AS members,
              (SELECT COUNT(*) FROM death_events e WHERE e.clan_id = c.id AND e.status <> 'cancelled'
                  AND e.reported_at >= ${START} AND e.reported_at < ${END}) AS events,
              (SELECT COALESCE(SUM(l.amount), 0) FROM fund_ledger l WHERE l.clan_id = c.id
                  AND l.entry_type IN ('collection', 'debt_collection', 'contribution', 'deposit', 'adjustment')
                  AND l.created_at >= ${START} AND l.created_at < ${END}) AS collected,
              (SELECT COALESCE(-SUM(l.amount), 0) FROM fund_ledger l WHERE l.clan_id = c.id AND l.entry_type = 'payout'
                  AND l.created_at >= ${START} AND l.created_at < ${END}) AS paid_out,
              (SELECT COALESCE(SUM(f.fee_amount), 0) FROM platform_fees f WHERE f.clan_id = c.id AND f.status = 'owed'
                  AND f.created_at >= ${START} AND f.created_at < ${END}) AS fees_owed,
              (SELECT COALESCE(SUM(f.fee_amount), 0) FROM platform_fees f WHERE f.clan_id = c.id AND f.status = 'received'
                  AND f.created_at >= ${START} AND f.created_at < ${END}) AS fees_received
         FROM clans c
        WHERE $1::int = 1
        ORDER BY c.name`,
      [1, from, to],
    ),
    query<{ month: string; fees: string; received: string; events: string }>(
      `SELECT to_char(f.created_at AT TIME ZONE '${TZ}', 'YYYY-MM') AS month,
              SUM(f.fee_amount) AS fees,
              COALESCE(SUM(f.fee_amount) FILTER (WHERE f.status = 'received'), 0) AS received,
              COUNT(*) AS events
         FROM platform_fees f
        WHERE $1::int = 1 AND f.created_at >= ${START} AND f.created_at < ${END}
        GROUP BY 1 ORDER BY 1`,
      [1, from, to],
    ),
  ]);

  const n = (rows: Record<string, string | number | boolean>[], k: string) => rows.reduce((s, r) => s + Number(r[k]), 0);
  return {
    from,
    to,
    clans,
    months,
    totals: {
      members: n(clans, "members"),
      events: n(clans, "events"),
      collected: n(clans, "collected"),
      paidOut: n(clans, "paid_out"),
      feesOwed: n(clans, "fees_owed"),
      feesReceived: n(clans, "fees_received"),
    },
  };
}
