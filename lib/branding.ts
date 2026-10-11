import "server-only";
import { cache } from "react";
import { queryOne } from "./db";

export const DEFAULT_BRANDING = {
  appName: "Clan Fund",
  primaryColor: "#12357a",
  accentColor: "#c29a4a",
};

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export type Branding = typeof DEFAULT_BRANDING & {
  /** Changes whenever the logo does, so its URL can be cached for good. Null when there is no logo. */
  logoVersion: number | null;
};

/**
 * The platform's name, logo and colours, set by the super admin. Read once per request.
 * Falls back to the built-in look if the database isn't reachable or set up yet, so the
 * sign-in page still renders while someone is getting the system running.
 */
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const row = await queryOne<{ app_name: string; primary_color: string; accent_color: string; has_logo: boolean; updated_at: Date }>(
      `SELECT app_name, primary_color, accent_color, logo_data IS NOT NULL AS has_logo, updated_at
         FROM platform_settings WHERE id = 1`,
    );
    if (!row) return { ...DEFAULT_BRANDING, logoVersion: null };
    return {
      appName: row.app_name || DEFAULT_BRANDING.appName,
      primaryColor: HEX_COLOR.test(row.primary_color) ? row.primary_color : DEFAULT_BRANDING.primaryColor,
      accentColor: HEX_COLOR.test(row.accent_color) ? row.accent_color : DEFAULT_BRANDING.accentColor,
      logoVersion: row.has_logo ? row.updated_at.getTime() : null,
    };
  } catch {
    return { ...DEFAULT_BRANDING, logoVersion: null };
  }
});

export const logoUrl = (b: Branding) => (b.logoVersion ? `/brand/logo?v=${b.logoVersion}` : null);

/**
 * CSS that swaps the theme colours, or nothing when they are the defaults (whose shades
 * in globals.css were tuned by hand). The other shades are mixed from the two chosen
 * colours, so one pick recolours buttons, panels, washes and focus rings together.
 * Only ever called with colours that passed HEX_COLOR, so the values are safe to inline.
 */
export function themeCss(b: Branding) {
  const css: string[] = [];
  if (b.primaryColor.toLowerCase() !== DEFAULT_BRANDING.primaryColor) {
    const p = b.primaryColor;
    css.push(
      `--color-brand:${p}`,
      `--color-brand-2:color-mix(in oklab,${p} 85%,black)`,
      `--color-brand-deep:color-mix(in oklab,${p} 68%,black)`,
      `--color-brand-bright:color-mix(in oklab,${p} 72%,white)`,
      `--color-brand-wash:color-mix(in oklab,${p} 10%,white)`,
    );
  }
  if (b.accentColor.toLowerCase() !== DEFAULT_BRANDING.accentColor) {
    const a = b.accentColor;
    css.push(
      `--color-gold:${a}`,
      `--color-gold-deep:color-mix(in oklab,${a} 65%,black)`,
      `--color-gold-wash:color-mix(in oklab,${a} 30%,white)`,
    );
  }
  return css.length ? `:root{${css.join(";")}}` : "";
}
