import type { Metadata, Viewport } from "next";
import { Newsreader, Noto_Sans_Lao, Noto_Serif_Lao, Public_Sans } from "next/font/google";
import { I18nProvider } from "@/components/i18n-provider";
import { getBranding, logoUrl, themeCss } from "@/lib/branding";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

// Lao glyphs fall back to these; Hmong (RPA) is Latin script and uses Public Sans.
const notoSansLao = Noto_Sans_Lao({
  variable: "--font-noto-sans-lao",
  subsets: ["lao"],
});

const notoSerifLao = Noto_Serif_Lao({
  variable: "--font-noto-serif-lao",
  subsets: ["lao"],
});

// The name, logo and colours come from the super admin's settings.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBranding();
  const logo = logoUrl(brand);
  return {
    title: {
      default: brand.appName,
      template: `%s · ${brand.appName}`,
    },
    description: "Mutual-aid fund management for clans.",
    ...(logo ? { icons: { icon: logo, apple: logo } } : {}),
  };
}

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: (await getBranding()).primaryColor };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, brand] = await Promise.all([getLocale(), getBranding()]);
  const fonts = [publicSans, newsreader, notoSansLao, notoSerifLao].map((f) => f.variable).join(" ");
  const theme = themeCss(brand);

  return (
    <html lang={locale} className={`${fonts} h-full antialiased`}>
      {theme && (
        <head>
          <style>{theme}</style>
        </head>
      )}
      <body className="min-h-full bg-paper text-ink">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
