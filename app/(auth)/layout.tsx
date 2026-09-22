import { BrandName } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getT } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Story panel — desktop only; phones go straight to the form. */}
      <aside className="panel-brand relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <Rings />
        <BrandName tone="light" />

        <div className="relative max-w-md">
          <p className="font-display text-[2.75rem] leading-[1.08] tracking-[-0.02em] xl:text-5xl">
            {t.story.before}
            <em className="text-gold-wash">{t.story.em}</em>
            {t.story.after}
          </p>
          <ol className="mt-12 space-y-6">
            {t.story.steps.map((s) => (
              <li key={s.title} className="flex gap-4">
                <span className="mt-2 size-2 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                <div>
                  <p className="font-medium text-white">{s.title}</p>
                  <p className="mt-0.5 text-sm text-white/70">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p className="relative text-sm text-white/60">{t.story.footer}</p>
      </aside>

      <main className="flex flex-col px-5 py-6 sm:px-10 lg:px-16 lg:py-10">
        <div className="flex items-center justify-between gap-4">
          <div className="lg:invisible">
            <BrandName />
          </div>
          <LanguageSwitcher />
        </div>
        <div className="flex flex-1 items-start justify-center pt-10 pb-6 lg:items-center lg:py-0">
          <div className="animate-rise w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}

/** Ripples spreading from one point: one family's loss reaching the whole circle. */
function Rings() {
  return (
    <svg
      className="pointer-events-none absolute -right-48 -bottom-48 size-[42rem] text-gold"
      viewBox="0 0 600 600"
      aria-hidden="true"
    >
      {[60, 120, 180, 240, 300].map((r, i) => (
        <circle
          key={r}
          cx="300"
          cy="300"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.4 - i * 0.07}
          strokeWidth="1"
          strokeDasharray={i % 2 ? "3 7" : undefined}
        />
      ))}
      <circle cx="300" cy="300" r="10" fill="currentColor" fillOpacity="0.85" />
    </svg>
  );
}
