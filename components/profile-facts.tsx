import { ageFrom, socialLink, type Profile } from "@/lib/profile";
import { formatDate } from "@/lib/format";
import { fmt, type Dictionary, type Locale } from "@/lib/i18n/config";

/** Someone's personal and contact details, as the account, clan and admin pages all show them. */
export function ProfileFacts({
  p,
  t,
  locale,
  stacked = false,
}: {
  p: Profile;
  t: Dictionary;
  locale: Locale;
  /** One card above the other, for a narrow column. */
  stacked?: boolean;
}) {
  const f = t.profile;
  const age = ageFrom(p.date_of_birth);
  const facebook = socialLink("facebook", p.facebook);
  const tiktok = socialLink("tiktok", p.tiktok);

  return (
    <div className={`grid gap-6 ${stacked ? "" : "lg:grid-cols-2"}`}>
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <h3 className="font-display text-lg text-brand-deep">{f.personal}</h3>
        <div className="mt-4 flex items-start gap-4">
          <Avatar fileId={p.photo_file_id} name={p.full_name} />
          <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label={f.firstName} value={p.first_name} />
            <Fact label={f.lastName} value={p.last_name} />
            <Fact
              label={f.age}
              value={age === null ? null : fmt(f.ageYears, { n: age })}
              note={p.date_of_birth ? formatDate(p.date_of_birth, locale) : undefined}
            />
            <Fact label={f.gender} value={p.gender ? f.genders[p.gender] : null} />
            <Fact label={f.village} value={p.village} />
            <Fact label={f.district} value={p.district} />
            <Fact label={f.province} value={p.province} />
          </dl>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <h3 className="font-display text-lg text-brand-deep">{f.contact}</h3>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {/* No "you sign in with this" note here: this card is also how others see the person. */}
          <Fact label={f.phone} value={p.phone} tabular />
          <Fact label={f.email} value={p.email} />
          <Fact label={f.whatsapp} value={p.whatsapp} tabular />
          <div>
            <dt className="text-muted">{f.facebook}</dt>
            <dd className="mt-0.5 font-medium text-ink">
              <Social link={facebook} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{f.tiktok}</dt>
            <dd className="mt-0.5 font-medium text-ink">
              <Social link={tiktok} />
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

export function Avatar({ fileId, name, size = 64 }: { fileId: string | null; name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  if (!fileId) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-brand-wash font-display text-xl text-brand"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {initials}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- private upload, served with an auth check
    <img
      src={`/files/${fileId}`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full border border-line object-cover"
      style={{ width: size, height: size }}
    />
  );
}

function Social({ link }: { link: { href: string | null; label: string } | null }) {
  if (!link) return <span className="text-muted">—</span>;
  if (!link.href) return <>{link.label}</>;
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-bright">
      {link.label}
    </a>
  );
}

function Fact({ label, value, note, tabular }: { label: string; value: string | null; note?: string; tabular?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className={`mt-0.5 font-medium break-words text-ink ${tabular ? "tabular" : ""}`}>
        {value ?? <span className="text-muted">—</span>}
      </dd>
      {note && value && <dd className="text-xs text-muted">{note}</dd>}
    </div>
  );
}
