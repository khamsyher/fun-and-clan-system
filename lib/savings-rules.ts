/**
 * Rules for rotating savings groups that need no database, kept apart so they can be unit
 * tested (`npm test`). Everything that reads or writes rows lives in lib/savings.ts and
 * app/actions/savings.ts.
 */

// No 0/O or 1/I/L: codes are read aloud and typed on phones.
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_LENGTH = 6;

const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export function makeInviteCode(rand: () => number = secureRandom) {
  let code = "";
  for (let i = 0; i < INVITE_LENGTH; i++) code += INVITE_ALPHABET[Math.floor(rand() * INVITE_ALPHABET.length)];
  return code;
}

/** Uppercases and drops spaces/dashes; null unless it could be a real code. */
export function normalizeInviteCode(raw: string) {
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== INVITE_LENGTH) return null;
  return [...code].every((c) => INVITE_ALPHABET.includes(c)) ? code : null;
}

/** What one round's receiver gets: everyone else pays them once. */
export const potFor = (amount: number, members: number) => amount * (members - 1);

/** Turn numbers are exactly 1..n, n ≥ 2, in any order. */
export function isCompleteOrder(turns: (number | null)[]) {
  if (turns.length < 2) return false;
  const sorted = [...turns].sort((a, b) => (a ?? 0) - (b ?? 0));
  return sorted.every((t, i) => t === i + 1);
}

/** Fisher–Yates on a copy. */
export function shuffled<T>(items: readonly T[], rand: () => number = secureRandom): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const DAY = 24 * 60 * 60 * 1000;

/** The organizer may nudge unpaid members at most once a day per round. */
export const canRemind = (last: Date | null, now: Date) => !last || now.getTime() - last.getTime() >= DAY;

/** Today's date in Laos as YYYY-MM-DD, whatever the server's time zone. */
export function todayInLaos(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Vientiane" });
}

/** A real YYYY-MM-DD date from `today` up to five years ahead. */
export function isTodayOrLater(value: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return value >= today && Number(value.slice(0, 4)) <= Number(today.slice(0, 4)) + 5;
}

/**
 * Two members may trade turns only while neither has received any money: their round is still
 * to come, or it is being collected but every payment in it is still unpaid.
 */
export function canSwapRound(status: "upcoming" | "collecting" | "done", payments: readonly string[]) {
  if (status === "upcoming") return true;
  return status === "collecting" && payments.every((p) => p === "unpaid");
}
