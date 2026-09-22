import en from "./en.json";
import la from "./la.json";
import hm from "./hm.json";

// en.json defines the keys. Typing la.json and hm.json as Dictionary makes the
// build fail if either one is missing a key. Placeholders like {name} are filled by fmt().
export type Dictionary = typeof en;
const lao: Dictionary = la;
const hmong: Dictionary = hm;

export const LOCALES = ["en", "lo", "hmn"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

export const DICTIONARIES: Record<Locale, Dictionary> = { en, lo: lao, hmn: hmong };

/** How each language names itself in the switcher. */
export const LOCALE_NAMES: Record<Locale, { native: string; short: string }> = {
  en: { native: "English", short: "EN" },
  lo: { native: "ພາສາລາວ", short: "ລາວ" },
  hmn: { native: "Hmoob", short: "Hmoob" },
};

/** Intl locale for dates. Intl has no Hmong data, so Hmong gets a neutral numeric date. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", lo: "lo-LA", hmn: "en-GB" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Fills {placeholders}: fmt("Hi {name}", { name: "Mai" }). */
export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}
