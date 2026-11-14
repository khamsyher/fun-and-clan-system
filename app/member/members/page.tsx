import type { Metadata } from "next";
import { PageHeading } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { Avatar } from "@/components/profile-facts";
import { requireRole } from "@/lib/dal";
import { query } from "@/lib/db";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).nav.members };
}

type MemberRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  facebook: string | null;
  tiktok: string | null;
  village: string | null;
  photo_file_id: string | null;
  is_treasurer: boolean;
  role: "member" | "clan_admin";
  deceased_at: string | null;
};

export default async function MemberRosterPage() {
  const member = await requireRole("member");
  const [t, people] = await Promise.all([
    getT(),
    query<MemberRow>(
      `SELECT id, full_name, phone, email, whatsapp, facebook, tiktok, village, photo_file_id, is_treasurer, role,
              to_char(deceased_at, 'YYYY-MM-DD') AS deceased_at
         FROM users
        WHERE clan_id = $1 AND role IN ('member', 'clan_admin') AND status = 'active'
        ORDER BY CASE WHEN role = 'clan_admin' THEN 0 ELSE 1 END, lower(full_name)`,
      [member.clanId],
    ),
  ]);

  return (
    <>
      <PageHeading title={t.nav.members} lede={t.member.rosterLede} />
      {people.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <p className="font-medium text-ink">{t.member.noMembers}</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => (
            <li key={person.id} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start gap-3">
                <Avatar fileId={person.photo_file_id} name={person.full_name} size={80} />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium text-ink">{person.full_name}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Pill tone={person.role === "clan_admin" || person.is_treasurer ? "info" : "mute"}>
                      {person.role === "clan_admin"
                        ? t.roles.clan_admin
                        : person.is_treasurer
                          ? t.treasurer.badge
                          : t.roles.member}
                    </Pill>
                    {person.deceased_at ? (
                      <Pill tone="mute">{t.clanMembers.deceased}</Pill>
                    ) : (
                      <Pill tone="ok">{t.status.active}</Pill>
                    )}
                  </div>
                </div>
              </div>
              <dl className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
                <Contact label={t.profile.phone} value={person.phone} />
                {person.email && <Contact label={t.profile.email} value={person.email} href={`mailto:${person.email}`} />}
                {person.whatsapp && <Contact label={t.profile.whatsapp} value={person.whatsapp} />}
                {person.facebook && <Contact label={t.profile.facebook} value={person.facebook} />}
                {person.tiktok && <Contact label={t.profile.tiktok} value={person.tiktok} />}
                {person.village && <Contact label={t.profile.village} value={person.village} />}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Contact({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-ink">
        {href ? (
          <a href={href} className="text-brand hover:text-brand-bright">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
