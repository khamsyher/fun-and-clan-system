import "server-only";
import { query } from "./db";
import { INTL_LOCALE, type Locale } from "./i18n/config";

export type Point = { key: string; label: string; full: string; value: number };

const MONTHS = 12;

// Every month of the last year, including empty ones (a quiet month is a 0, not a gap).
const MONTH_SERIES = `generate_series(date_trunc('month', now()) - interval '${MONTHS - 1} months', date_trunc('month', now()), interval '1 month')`;

/** Short and full month names in the reader's language. Intl has no Hmong months, so Hmong shows 10/26. */
function monthLabels(ym: string, locale: Locale) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 15));
  if (locale === "hmn") return { label: `${String(m).padStart(2, "0")}/${String(y).slice(2)}`, full: `${String(m).padStart(2, "0")}/${y}` };
  const tag = INTL_LOCALE[locale];
  return {
    label: new Intl.DateTimeFormat(tag, { month: "short", timeZone: "UTC" }).format(d),
    full: new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }).format(d),
  };
}

function toPoints(rows: { month: string; value: string }[], locale: Locale): Point[] {
  return rows.map((r) => ({ key: r.month, ...monthLabels(r.month, locale), value: Number(r.value) }));
}

/** Money paid into every clan fund, per month (collections, contributions, deposits). Totals only. */
export async function moneyInByMonth(locale: Locale) {
  const rows = await query<{ month: string; value: string }>(
    `SELECT to_char(m, 'YYYY-MM') AS month, COALESCE(SUM(l.amount), 0) AS value
       FROM ${MONTH_SERIES} m
       LEFT JOIN fund_ledger l ON l.amount > 0 AND date_trunc('month', l.created_at) = m
      GROUP BY m ORDER BY m`,
  );
  return toPoints(rows, locale);
}

/** New accounts per month, platform staff left out. */
export async function newAccountsByMonth(locale: Locale) {
  const rows = await query<{ month: string; value: string }>(
    `SELECT to_char(m, 'YYYY-MM') AS month, COUNT(u.id) AS value
       FROM ${MONTH_SERIES} m
       LEFT JOIN users u ON date_trunc('month', u.created_at) = m AND u.role::text NOT IN ('super_admin', 'support')
      GROUP BY m ORDER BY m`,
  );
  return toPoints(rows, locale);
}

/** The largest enabled clans by active members (leaders included). */
export async function membersByClan(limit = 8) {
  const rows = await query<{ id: string; name: string; code: string; value: string }>(
    `SELECT c.id, c.name, c.code, COUNT(u.id) AS value
       FROM clans c
       LEFT JOIN users u ON u.clan_id = c.id AND u.status = 'active' AND u.role IN ('member', 'clan_admin')
      WHERE c.is_active
      GROUP BY c.id
      ORDER BY COUNT(u.id) DESC, lower(c.name)
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ id: r.id, label: r.name, sub: r.code, value: Number(r.value) }));
}
