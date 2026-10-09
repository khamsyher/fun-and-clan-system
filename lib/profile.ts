import "server-only";
import { query, queryOne } from "./db";
// The lists themselves live in definitions.ts, which the forms can import too.
import type { DocumentType, Gender } from "./definitions";
import type { Dictionary } from "./i18n/config";

/** Everything someone keeps about themself, beyond the name and phone they signed up with. */
export type Profile = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: Date | null;
  gender: Gender | null;
  photo_file_id: string | null;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  facebook: string | null;
  tiktok: string | null;
  village: string | null;
  district: string | null;
  province: string | null;
};

export const PROFILE_COLUMNS = `u.id, u.full_name, u.first_name, u.last_name, u.date_of_birth, u.gender, u.photo_file_id,
            u.phone, u.email, u.whatsapp, u.facebook, u.tiktok, u.village, u.district, u.province`;

export function getProfile(userId: string) {
  return queryOne<Profile>(`SELECT ${PROFILE_COLUMNS} FROM users u WHERE u.id = $1`, [userId]);
}

export type KycStatus = "pending" | "approved" | "rejected";

export type UserDocument = {
  id: string;
  doc_type: DocumentType;
  doc_number: string;
  issued_on: Date | null;
  expires_on: Date | null;
  file_id: string | null;
  note: string | null;
  status: KycStatus;
  review_note: string | null;
  verified_at: Date | null;
  verified_by_name: string | null;
  created_at: Date;
};

export function listDocuments(userId: string) {
  return query<UserDocument>(
    `SELECT d.id, d.doc_type, d.doc_number, d.issued_on, d.expires_on, d.file_id, d.note,
            d.status, d.review_note, d.verified_at, v.full_name AS verified_by_name, d.created_at
       FROM user_documents d
       LEFT JOIN users v ON v.id = d.verified_by
      WHERE d.user_id = $1
      ORDER BY d.created_at DESC`,
    [userId],
  );
}

/** Whole years, worked out now rather than stored, so it is never out of date. */
export function ageFrom(dateOfBirth: Date | null): number | null {
  if (!dateOfBirth) return null;
  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const beforeBirthday =
    now.getMonth() < dateOfBirth.getMonth() ||
    (now.getMonth() === dateOfBirth.getMonth() && now.getDate() < dateOfBirth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

/**
 * A link for a social handle. A full http(s) address is used as given; anything else is
 * treated as a username. Nothing else becomes a link, so a stored value can never be
 * turned into a javascript: or data: URL.
 */
export function socialLink(network: "facebook" | "tiktok", value: string | null) {
  if (!value) return null;
  const handle = value.trim();
  if (!handle) return null;
  if (/^https?:\/\//i.test(handle)) return { href: handle, label: handle.replace(/^https?:\/\/(www\.)?/i, "") };
  const name = handle.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{2,80}$/.test(name)) return { href: null, label: handle };
  return network === "facebook"
    ? { href: `https://www.facebook.com/${name}`, label: `@${name}` }
    : { href: `https://www.tiktok.com/@${name}`, label: `@${name}` };
}

/** Shows only the last four characters of an identity number: enough to recognise, not to copy. */
export function maskNumber(value: string) {
  const clean = value.trim();
  if (clean.length <= 4) return "•".repeat(clean.length);
  return `${"•".repeat(Math.min(8, clean.length - 4))}${clean.slice(-4)}`;
}

/** Document type names in the reader's language. */
export function documentLabel(t: Dictionary, type: DocumentType) {
  return t.profile.docTypes[type];
}

/**
 * A DATE column as a date input wants it. Built from the local parts on purpose:
 * toISOString() would move the day back for timezones ahead of UTC, such as Vientiane.
 */
export function toDateInput(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
