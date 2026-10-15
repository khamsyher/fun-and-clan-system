import type { Metadata } from "next";
import { Section } from "@/components/app-shell";
import { getBranding, logoUrl } from "@/lib/branding";
import { requireRole } from "@/lib/dal";
import { STAFF_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import { BrandingForm } from "../forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).branding.tabBranding };
}

/** How the app looks to everyone: name, logo and colours. */
export default async function BrandingSettingsPage() {
  await requireRole(...STAFF_ROLES);
  const [t, brand] = await Promise.all([getT(), getBranding()]);

  return (
    <Section title={t.branding.brandTitle}>
      <div className="max-w-2xl rounded-xl border border-line bg-surface p-5 sm:p-6">
        {/* Keyed by what's saved, so a save or reset starts the form over from the new values. */}
        <BrandingForm
          key={`${brand.appName}|${brand.primaryColor}|${brand.accentColor}|${brand.logoVersion}`}
          appName={brand.appName}
          primaryColor={brand.primaryColor}
          accentColor={brand.accentColor}
          logo={logoUrl(brand)}
        />
      </div>
    </Section>
  );
}
