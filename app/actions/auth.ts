"use server";

import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, deleteSession } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import {
  loginSchema,
  registerSchema,
  ROLE_HOME,
  type FormState,
  type Role,
  type UserStatus,
} from "@/lib/definitions";

function pick(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

export async function login(_state: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const values = pick(formData, ["phone", "password"]);
  const next = String(formData.get("next") ?? "");
  const parsed = loginSchema(t.errors).safeParse(values);
  const echo = { phone: values.phone };
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, values: echo };
  }

  const { phone, password } = parsed.data;
  const user = await queryOne<{
    id: string;
    role: Role;
    status: UserStatus;
    clan_id: string | null;
    password_hash: string;
    clan_active: boolean | null;
    session_version: number;
  }>(
    `SELECT u.id, u.role, u.status, u.clan_id, u.password_hash, c.is_active AS clan_active, u.session_version
       FROM users u LEFT JOIN clans c ON c.id = u.clan_id
      WHERE u.phone = $1`,
    [phone],
  );

  // Same message for unknown phone and wrong password, so accounts can't be probed.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { message: t.auth.badCredentials, values: echo };
  }

  // Status is only revealed after the password is proven.
  if (user.status === "pending") {
    return { message: t.auth.pending, values: echo };
  }
  if (user.status === "rejected") {
    return { message: t.auth.rejected, values: echo };
  }
  if (user.status === "disabled") {
    return { message: t.auth.disabled, values: echo };
  }
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
  await createSession(user.id, user.role, user.clan_id, user.session_version);
  // A disabled clan doesn't stop anyone signing in: they land where a general user does,
  // since that is what they are until the clan is enabled again (see withoutDisabledClan).
  const home = user.clan_id && !user.clan_active ? ROLE_HOME.user : ROLE_HOME[user.role];
  // Return to the page they were sent from (e.g. a shared donation link), never off-site.
  const safeNext = next.startsWith("/") && !next.startsWith("//") && /^[\w\-/]*$/.test(next.slice(1));
  redirect(safeNext ? next : home);
}

export async function register(_state: FormState, formData: FormData): Promise<FormState> {
  const t = await getT();
  const values = pick(formData, [
    "fullName",
    "phone",
    "email",
    "password",
    "confirmPassword",
  ]);
  // Echo back what was typed, never the passwords.
  const echo = { ...values, password: "", confirmPassword: "" };
  const parsed = registerSchema(t.errors).safeParse(values);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, values: echo };
  }
  const d = parsed.data;

  // Everyone signs up as a general user, active at once. They join a clan later from their
  // account page, where the clan's leader approves them; staff can also place them directly.
  const taken = await queryOne(`SELECT 1 FROM users WHERE phone = $1`, [d.phone]);
  if (taken) {
    return { errors: { phone: [t.auth.phoneTaken] }, values: echo };
  }
  if (d.email) {
    const emailTaken = await queryOne(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [d.email]);
    if (emailTaken) {
      return { errors: { email: [t.auth.emailTaken] }, values: echo };
    }
  }

  const passwordHash = await hashPassword(d.password);
  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO users (clan_id, role, status, full_name, phone, email, password_hash)
     VALUES (NULL, 'user', 'active', $1, $2, $3, $4)
     RETURNING id`,
    [d.fullName, d.phone, d.email, passwordHash],
  );
  await query(`INSERT INTO audit_logs (actor_id, action, target_id) VALUES ($1, 'user.registered', $1)`, [inserted!.id]);

  return { success: t.auth.registeredNoClan };
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
