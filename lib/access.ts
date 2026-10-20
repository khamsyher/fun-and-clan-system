import type { CurrentUser } from "./dal";
import { isStaffRole, type Role } from "./definitions";

/**
 * What a signed-in person may do, in one place.
 *
 * `requireRole` answers "may they open this area"; these answer "may they do this thing",
 * which is the question that spans areas and changes as rules change. A page and the
 * server action behind it must ask the same question here — the page to decide what to
 * show, the action because the page can be bypassed.
 */

/** Platform staff: the super admin and support. */
export function isStaff(user: CurrentUser) {
  return isStaffRole(user.role);
}

/** Anyone who can take part in donations: everyone except platform staff. */
export function isDonor(user: CurrentUser) {
  return !isStaff(user);
}

/**
 * Asking for money needs an identity the platform has approved; giving does not, so that
 * help is never held up by paperwork.
 */
export function canAskForHelp(user: CurrentUser) {
  return isDonor(user) && user.kycApproved;
}

/** Joining a clan puts a real person on a clan's roll, so the platform checks them first. */
export function canJoinClan(user: CurrentUser) {
  // Someone whose clan is only switched off still belongs to it, so they can't ask for another.
  return user.role === "user" && user.kycApproved && !user.suspendedClan;
}

/**
 * Anyone can keep a family list except platform staff: it belongs to the person, not to a
 * clan. Which clan covers it is decided by the clan they are in now — so a general user's
 * family is covered the day they join one, and nothing is lost if they move.
 */
export function canManageFamily(user: CurrentUser) {
  return isDonor(user);
}

/** Identity decisions rest with the platform, never with the clan that benefits from them. */
export function canReviewKyc(user: CurrentUser) {
  return isStaff(user);
}

/**
 * Handing out a temporary password lets someone into another person's account, so on the
 * platform side it stays with the super admin alone — support can do everything else.
 */
export function canResetPasswords(user: CurrentUser) {
  return user.role === "super_admin";
}

/**
 * Staff accounts are only managed by the super admin: support can't block, delete or change
 * the role of a super admin or another support account. No one can touch a super admin.
 */
export function canManageAccount(actor: CurrentUser, targetRole: Role) {
  if (targetRole === "super_admin") return false;
  if (targetRole === "support") return actor.role === "super_admin";
  return isStaff(actor);
}

/** Roles an actor may not act on, for use in SQL guards (`role::text <> ALL($n)`). */
export function protectedRoles(actor: CurrentUser): Role[] {
  return actor.role === "super_admin" ? ["super_admin"] : ["super_admin", "support"];
}
