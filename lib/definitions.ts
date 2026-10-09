import * as z from "zod";
import type { Dictionary } from "./i18n/config";

/** `user` is a general user: signed up without a clan code, so they only see donations. */
export type Role = "super_admin" | "clan_admin" | "member" | "user";
export type UserStatus = "pending" | "active" | "rejected" | "disabled";

export type SessionPayload = {
  userId: string;
  role: Role;
  clanId: string | null;
  expiresAt: Date;
  /** Must match users.session_version; bumped on password change/reset. */
  sessionVersion: number;
};

export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/admin",
  clan_admin: "/clan",
  member: "/member",
  user: "/donations",
};

/** Everyone who may ask for help and give: the three roles that are not the platform owner. */
export const DONOR_ROLES: Role[] = ["member", "clan_admin", "user"];

export const RELATIONSHIPS = ["spouse", "child", "father", "mother"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const GENDERS = ["female", "male", "other"] as const;
export type Gender = (typeof GENDERS)[number];

/** Identity documents a clan leader may be shown. */
export const DOCUMENT_TYPES = ["national_id", "family_book", "passport", "driving_licence", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

type Errors = Dictionary["errors"];

const phone = (e: Errors) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\+?[0-9]{8,15}$/, { error: e.phoneInvalid }));

const password = (e: Errors) =>
  z
    .string()
    .min(8, { error: e.passwordMin })
    .regex(/[a-zA-Z]/, { error: e.passwordLetter })
    .regex(/[0-9]/, { error: e.passwordNumber });

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

// Schemas are built per request so their messages are in the visitor's language.
export const loginSchema = (e: Errors) =>
  z.object({
    phone: phone(e),
    password: z.string().min(1, { error: e.passwordRequired }),
  });

export const registerSchema = (e: Errors) =>
  z
    .object({
      // Optional: left empty, the person registers as a general user and joins a clan later.
      clanCode: z
        .string()
        .trim()
        .toUpperCase()
        .refine((v) => v === "" || /^[A-Z0-9-]{2,20}$/.test(v), { error: e.clanCodeFormat })
        .transform((v) => (v === "" ? null : v)),
      fullName: z.string().trim().min(2, { error: e.fullNameRequired }).max(150),
      phone: phone(e),
      email: optionalText.pipe(z.email({ error: e.emailInvalid }).nullable()),
      village: optionalText,
      password: password(e),
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      path: ["confirmPassword"],
      error: e.passwordsMismatch,
    });

/** A date someone could have been born on: a real date, in the past, within living memory. */
function isBirthDate(value: string) {
  if (!isPlainDate(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return date.getTime() < Date.now() && date.getUTCFullYear() > 1900;
}

function isPlainDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const optionalPhone = (e: Errors) =>
  optionalText.pipe(
    z
      .string()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .pipe(z.string().regex(/^\+?[0-9]{8,15}$/, { error: e.phoneInvalid }))
      .nullable(),
  );

const optionalLine = (max: number) => optionalText.pipe(z.string().max(max).nullable());

const optionalDate = (e: Errors) =>
  optionalText.pipe(
    z
      .string()
      .nullable()
      .refine((v) => v === null || isPlainDate(v), { error: e.dateInvalid }),
  );

/** Someone's own details. Every field is optional: an account works with none of them filled in. */
export const profileSchema = (e: Errors) =>
  z.object({
    firstName: optionalLine(80),
    lastName: optionalLine(80),
    dateOfBirth: optionalText.pipe(
      z
        .string()
        .nullable()
        .refine((v) => v === null || isBirthDate(v), { error: e.birthInvalid }),
    ),
    // An unknown value simply means "not said", rather than failing the whole form.
    gender: z
      .string()
      .trim()
      .transform((v) => (GENDERS.includes(v as Gender) ? (v as Gender) : null)),
    email: optionalText.pipe(z.email({ error: e.emailInvalid }).nullable()),
    whatsapp: optionalPhone(e),
    facebook: optionalLine(150),
    tiktok: optionalLine(150),
    village: optionalLine(100),
    district: optionalLine(100),
    province: optionalLine(100),
  });

/** One identity document. The scan itself is checked separately, as an upload. */
export const documentSchema = (e: Errors) =>
  z
    .object({
      docType: z.enum(DOCUMENT_TYPES, { error: e.docTypeRequired }),
      docNumber: z.string().trim().min(2, { error: e.docNumberRequired }).max(60),
      issuedOn: optionalDate(e),
      expiresOn: optionalDate(e),
      note: optionalLine(200),
    })
    .refine((d) => !d.issuedOn || !d.expiresOn || d.expiresOn >= d.issuedOn, {
      path: ["expiresOn"],
      error: e.expiryBeforeIssue,
    });

/** Just a clan code, used when a general user asks to join a clan. */
export const clanCodeSchema = (e: Errors) =>
  z.object({
    clanCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,20}$/, { error: e.clanCodeFormat }),
  });

export const createClanSchema = (e: Errors) =>
  z.object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,20}$/, { error: e.clanCodeFormat }),
    name: z.string().trim().min(2, { error: e.clanNameRequired }).max(150),
    leaderName: z.string().trim().min(2, { error: e.leaderNameRequired }).max(150),
    leaderPhone: phone(e),
    leaderPassword: password(e),
  });

export type FormState =
  | {
      errors?: Record<string, string[] | undefined>;
      message?: string;
      success?: string;
      /** Which success panel to show, when an action has more than one. */
      kind?: string;
      values?: Record<string, string>;
    }
  | undefined;
