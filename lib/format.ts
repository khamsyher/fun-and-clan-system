import { INTL_LOCALE, type Locale } from "./i18n/config";

const number = new Intl.NumberFormat("en-US");

export const formatKip = (amount: number | string) => `${number.format(Number(amount))} ₭`;
export const formatNumber = (n: number | string) => number.format(Number(n));

export function formatDate(d: Date | string | null, locale: Locale = "en") {
  if (!d) return "—";
  // Intl has no Hmong month names, so Hmong shows 22/09/2026.
  const options: Intl.DateTimeFormatOptions =
    locale === "hmn" ? { day: "2-digit", month: "2-digit", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], options).format(new Date(d));
}
