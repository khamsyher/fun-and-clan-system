import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, DICTIONARIES, LOCALE_COOKIE, isLocale, type Locale } from "./config";

export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** The dictionary for the visitor's chosen language (server components and actions). */
export async function getT() {
  return DICTIONARIES[await getLocale()];
}
