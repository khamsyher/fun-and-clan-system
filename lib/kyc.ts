import "server-only";
import { query, queryOne } from "./db";
import type { KycStatus, UserDocument } from "./profile";

/** A document waiting for the platform owner, with the person it belongs to. */
export type ReviewRow = UserDocument & {
  user_id: string;
  full_name: string;
  phone: string;
  clan_name: string | null;
  clan_code: string | null;
};

export const KYC_FILTERS: Record<string, KycStatus> = { pending: "pending", approved: "approved", rejected: "rejected" };

/**
 * The review queue, across every clan. Oldest first while waiting, so nobody is
 * left at the back; newest first once decided.
 */
export function listForReview(filter: string) {
  const status = KYC_FILTERS[filter] ?? null;
  return query<ReviewRow>(
    `SELECT d.id, d.doc_type, d.doc_number, d.issued_on, d.expires_on, d.file_id, d.note,
            d.status, d.review_note, d.verified_at, v.full_name AS verified_by_name, d.created_at,
            d.user_id, u.full_name, u.phone, c.name AS clan_name, c.code AS clan_code
       FROM user_documents d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN clans c ON c.id = u.clan_id
       LEFT JOIN users v ON v.id = d.verified_by
      WHERE ($1::text IS NULL OR d.status::text = $1)
      ORDER BY (d.status = 'pending') DESC,
               CASE WHEN d.status = 'pending' THEN d.created_at END ASC,
               d.created_at DESC
      LIMIT 200`,
    [status],
  );
}

export type KycCounts = { pending: string; approved: string; rejected: string; everyone: string };

export function countForReview() {
  return queryOne<KycCounts>(
    `SELECT COUNT(*) FILTER (WHERE status::text = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status::text = 'approved') AS approved,
            COUNT(*) FILTER (WHERE status::text = 'rejected') AS rejected,
            COUNT(*) AS everyone
       FROM user_documents`,
  );
}

/** Whether this person has an approved identity document. */
export async function isVerified(userId: string) {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM user_documents WHERE user_id = $1 AND status = 'approved') AS ok`,
    [userId],
  );
  return Boolean(row?.ok);
}

/** How many documents are waiting, for the badge on the platform owner's Identity tab. */
export async function countPendingKyc() {
  const row = await queryOne<{ n: string }>(`SELECT COUNT(*) AS n FROM user_documents WHERE status = 'pending'`);
  return Number(row?.n ?? 0);
}
