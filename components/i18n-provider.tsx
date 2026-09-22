"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DICTIONARIES, type Dictionary, type Locale } from "@/lib/i18n/config";

const I18nContext = createContext<{ locale: Locale; t: Dictionary }>({ locale: "en", t: DICTIONARIES.en });

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, t: DICTIONARIES[locale] }}>{children}</I18nContext.Provider>;
}

/** Dictionary for client components. */
export function useT() {
  return useContext(I18nContext).t;
}

export function useLocale() {
  return useContext(I18nContext).locale;
}
