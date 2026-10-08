import "server-only";
import { query, queryOne } from "./db";

export type RequestStatus = "open" | "closed" | "cancelled";
export type DonationStatus = "pending" | "confirmed" | "rejected";

export type RequestRow = {
  id: string;
  title: string;
  story: string;
  target_amount: string | null;
  deadline: Date | null;
  status: RequestStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  creator_name: string;
  clan_name: string | null; // null when the person who asked is in no clan
  clan_code: string | null;
  photo_file_id: string | null;
  qr_file_id: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  raised: string;
  donors: string;
};

// Donation requests are deliberately not scoped to a clan: every signed-in user sees them all.
const SELECT = `
  SELECT r.id, r.title, r.story, r.target_amount, r.deadline, r.status, r.created_at, r.updated_at, r.created_by,
         u.full_name AS creator_name, c.name AS clan_name, c.code AS clan_code,
         r.photo_file_id, r.qr_file_id, r.bank_name, r.account_name, r.account_number,
         COALESCE((SELECT SUM(d.amount) FROM donations d WHERE d.request_id = r.id AND d.status = 'confirmed'), 0) AS raised,
         (SELECT COUNT(*) FROM donations d WHERE d.request_id = r.id AND d.status = 'confirmed') AS donors
    FROM donation_requests r
    JOIN users u ON u.id = r.created_by
    LEFT JOIN clans c ON c.id = r.clan_id`;

export function listRequests() {
  return query<RequestRow>(`${SELECT} WHERE r.status <> 'cancelled' ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 100`);
}

export function getRequest(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve(null);
  return queryOne<RequestRow>(`${SELECT} WHERE r.id = $1`, [id]);
}

export type DonationRow = {
  id: string;
  amount: string;
  transfer_date: Date;
  message: string | null;
  anonymous: boolean;
  status: DonationStatus;
  review_note: string | null;
  created_at: Date;
  donor_id: string;
  donor_name: string;
  donor_clan: string | null;
  slip_file_id: string;
};

/**
 * Donations on one request. Confirmed ones are public (names hidden if the donor asked);
 * pending and rejected ones are only visible to the person who asked and to that donor.
 */
export function listDonations(requestId: string, viewerId: string, isOwner: boolean) {
  return query<DonationRow>(
    `SELECT d.id, d.amount, d.transfer_date, d.message, d.anonymous, d.status, d.review_note, d.created_at,
            d.donor_id, u.full_name AS donor_name, c.name AS donor_clan, d.slip_file_id
       FROM donations d JOIN users u ON u.id = d.donor_id LEFT JOIN clans c ON c.id = u.clan_id
      WHERE d.request_id = $1 AND (d.status = 'confirmed' OR $3 OR d.donor_id = $2)
      ORDER BY (d.status = 'pending') DESC, d.created_at DESC`,
    [requestId, viewerId, isOwner],
  );
}

/** Everything the signed-in user has given, newest first. */
export function myDonations(userId: string) {
  return query<DonationRow & { request_title: string; request_id: string }>(
    `SELECT d.id, d.amount, d.transfer_date, d.message, d.anonymous, d.status, d.review_note, d.created_at,
            d.donor_id, u.full_name AS donor_name, c.name AS donor_clan, d.slip_file_id,
            r.title AS request_title, r.id AS request_id
       FROM donations d
       JOIN donation_requests r ON r.id = d.request_id
       JOIN users u ON u.id = d.donor_id LEFT JOIN clans c ON c.id = u.clan_id
      WHERE d.donor_id = $1
      ORDER BY d.created_at DESC LIMIT 50`,
    [userId],
  );
}
