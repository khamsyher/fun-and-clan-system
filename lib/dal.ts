import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { queryOne } from "./db";
import { readSession } from "./session";
import { ROLE_HOME, type Role, type UserStatus } from "./definitions";

export type CurrentUser = {
  id: string;
  role: Role;
  status: UserStatus;
  fullName: string;
  phone: string;
  email: string | null;
  clanId: string | null;
  clanName: string | null;
  clanCode: string | null;
  clanActive: boolean | null;
  sessionVersion: number;
  isTreasurer: boolean;
  clanFundMode: "A" | "B" | null;
  photoFileId: string | null;
  /** True once the platform owner has approved one of their identity documents. */
  kycApproved: boolean;
  /** The name of their clan while it is disabled; they act as a general user until it's back. */
  suspendedClan: string | null;
};

/**
 * Loads the signed-in user from the database on every request, so a disabled
 * account or clan loses access immediately even while its cookie is still valid.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const user = await queryOne<Omit<CurrentUser, "suspendedClan">>(
    `SELECT u.id, u.role, u.status, u.full_name AS "fullName", u.phone, u.email,
            u.clan_id AS "clanId", c.name AS "clanName", c.code AS "clanCode",
            c.is_active AS "clanActive", u.session_version AS "sessionVersion",
            u.is_treasurer AS "isTreasurer", c.fund_mode AS "clanFundMode",
            u.photo_file_id AS "photoFileId",
            EXISTS (SELECT 1 FROM user_documents d WHERE d.user_id = u.id AND d.status = 'approved') AS "kycApproved"
       FROM users u
       LEFT JOIN clans c ON c.id = u.clan_id
      WHERE u.id = $1`,
    [session.userId],
  );

  if (!user || user.status !== "active") return null;
  // A password change or reset bumps the version, ending every older session.
  if (user.sessionVersion !== session.sessionVersion) return null;
  return withoutDisabledClan(user);
});

/**
 * While their clan is disabled, its leader and members still sign in, but as general users
 * with no clan: the clan's pages, money and files are closed to them, donations and savings
 * groups stay open. Nothing is changed in the database, so enabling the clan again gives
 * everyone their role and clan back at once.
 */
export function withoutDisabledClan<U extends Omit<CurrentUser, "suspendedClan">>(user: U): CurrentUser {
  if (!user.clanId || user.clanActive) return { ...user, suspendedClan: null };
  return {
    ...user,
    role: "user",
    clanId: null,
    clanName: null,
    clanCode: null,
    clanActive: null,
    clanFundMode: null,
    isTreasurer: false,
    suspendedClan: user.clanName,
  };
}

/** Guard for pages and server actions: redirects unless the user has one of the roles (none = any signed-in user). */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // Via /auth/signout so a stale cookie is cleared; plain /login would loop with proxy.ts.
  if (!user) redirect("/auth/signout");
  if (roles.length && !roles.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}
