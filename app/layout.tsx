import type { Metadata, Viewport } from "next";
import { Newsreader, Noto_Sans_Lao, Noto_Serif_Lao, Public_Sans } from "next/font/google";
import { I18nProvider } from "@/components/i18n-provider";
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

export const metadata: Metadata = {
  title: {
    default: "Clan Fund",
    template: "%s · Clan Fund",
  },
  description: "Funeral mutual-aid fund management for clans.",
};

export const viewport: Viewport = {
  themeColor: "#12357a",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const fonts = [publicSans, newsreader, notoSansLao, notoSerifLao].map((f) => f.variable).join(" ");

  return (
    <html lang={locale} className={`${fonts} h-full antialiased`}>
      <body className="min-h-full bg-paper text-ink">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
