import type { CurrentUser } from "./dal";

/**
 * What a signed-in person may do, in one place.
 *
 * `requireRole` answers "may they open this area"; these answer "may they do this thing",
 * which is the question that spans areas and changes as rules change. A page and the
 * server action behind it must ask the same question here — the page to decide what to
 * show, the action because the page can be bypassed.
 */

/** Anyone who can take part in donations: everyone except the platform owner. */
export function isDonor(user: CurrentUser) {
  return user.role !== "super_admin";
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
  return user.role === "user" && user.kycApproved;
}

/** Identity decisions rest with the platform, never with the clan that benefits from them. */
export function canReviewKyc(user: CurrentUser) {
  return user.role === "super_admin";
}
