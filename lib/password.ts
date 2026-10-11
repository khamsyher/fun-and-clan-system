// Password hashing with Node's built-in scrypt (no native dependency).
// Not marked server-only so the setup script can reuse it; it imports node:crypto,
// so it can never end up in a client bundle anyway.
import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** e.g. "KTRW-4827": easy to read out loud, meets the password rules, no look-alike characters. */
export function temporaryPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const word = Array.from({ length: 4 }, () => letters[randomInt(letters.length)]).join("");
  const digits = String(randomInt(1000, 10000));
  return `${word}-${digits}`;
}
