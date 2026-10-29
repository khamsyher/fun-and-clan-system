import { SavingsRules } from "@/components/savings-rules";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { buttonPrimary } from "@/components/button-styles";
import { Field, Notice } from "@/components/ui";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { getFormingGroupByCode, myMembership } from "@/lib/savings";
import { normalizeInviteCode } from "@/lib/savings-rules";
import { JoinForm } from "./join-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).savings.joinMetaTitle };
}

/** `/savings/join?code=AB3K7M` is the link organizers share; without a code it asks for one. */
export default async function JoinSavingsPage({ searchParams }: PageProps<"/savings/join">) {
  const me = await requireRole(...DONOR_ROLES);
  const [sp, t, locale] = await Promise.all([searchParams, getT(), getLocale()]);
  const s = t.savings;

  const raw = typeof sp.code === "string" ? sp.code : "";
  const code = raw ? normalizeInviteCode(raw) : null;
  const group = code ? await getFormingGroupByCode(code) : null;
  const mine = group ? await myMembership(group.id, me.id) : null;
  const alreadyIn = mine === "pending" || mine === "approved";

  return (
    <>
      <Link href="/savings" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {s.back}
      </Link>
      <div className="mt-3">
        <PageHeading title={s.joinTitle} lede={s.joinLede} />
      </div>

      <div className="mt-8 max-w-2xl space-y-6">
        {!group && (
          // A plain GET form: the code ends up in the URL, the same shape as a shared link.
          <form action="/savings/join" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-start sm:p-6">
            <Field
              label={s.fCode}
              name="code"
              defaultValue={raw}
              errors={raw ? [s.errCode] : undefined}
              autoCapitalize="characters"
              autoComplete="off"
              className="flex-1 [&_input]:uppercase [&_input]:tracking-[0.12em]"
            />
            <button type="submit" className={`${buttonPrimary} sm:mt-7`}>
              {s.findGroup}
            </button>
          </form>
        )}

        {group && (
          <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-display text-2xl text-brand-deep">{group.name}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {fmt(s.joinAbout, { organizer: group.organizer_name, amount: formatKip(group.amount), period: s.period[group.period], n: group.members })}
            </p>
            {group.description && <p className="mt-3 whitespace-pre-line text-ink">{group.description}</p>}
            {/* The rules come before the button: asking to join means agreeing to them. */}
            <div className="mt-5">
              <SavingsRules rules={group.rules} fileId={group.rules_file_id} updatedAt={group.rules_updated_at} t={t} locale={locale} agreeNote={!alreadyIn} />
            </div>
            <div className="mt-6">
              {alreadyIn ? (
                <div className="space-y-3">
                  <Notice tone="success">{s.errAlready}</Notice>
                  <Link href={`/savings/${group.id}`} className={buttonPrimary}>
                    {s.openGroup}
                  </Link>
                </div>
              ) : (
                <JoinForm code={group.invite_code} />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
