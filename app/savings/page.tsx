import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { buttonPrimary, buttonQuiet } from "@/components/button-styles";
import { CheckIcon, UsersIcon } from "@/components/icons";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { formatDate, formatKip } from "@/lib/format";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { myGroups, receivingOrders, type OrderRow } from "@/lib/savings";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).savings.metaTitle };
}


const GROUP_TONE = { forming: "warn", active: "info", completed: "ok", cancelled: "mute" } as const;

export default async function SavingsPage() {
  const me = await requireRole(...DONOR_ROLES);
  const [t, locale, groups] = await Promise.all([getT(), getLocale(), myGroups(me.id)]);
  const s = t.savings;
  // Someone still waiting for approval sees only the group, not who is in it.
  const orders = await receivingOrders(groups.filter((g) => g.my_status === "approved").map((g) => g.id));
  const orderOf = (groupId: string) => orders.filter((o) => o.group_id === groupId);

  return (
    <>
      <PageHeading title={s.title} lede={s.lede}>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/savings/join" className={buttonQuiet}>
            {s.join}
          </Link>
          <Link href="/savings/new" className={buttonPrimary}>
            <UsersIcon width={18} height={18} />
            {s.create}
          </Link>
        </div>
      </PageHeading>

      <div className="mt-8">
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <p className="font-medium text-ink">{s.empty}</p>
            <p className="mt-1 text-sm text-ink-soft">{s.emptyBody}</p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/savings/${g.id}`}
                  className="flex h-full flex-col rounded-xl border border-line bg-surface p-5 transition-[border-color,box-shadow] hover:border-brand-bright/40 hover:shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-xl text-brand-deep">{g.name}</h2>
                    {g.my_status === "pending" ? (
                      <Pill tone="warn">{s.waitingApproval}</Pill>
                    ) : (
                      <Pill tone={GROUP_TONE[g.status]}>{s.groupStatus[g.status]}</Pill>
                    )}
                  </div>
                  <p className="tabular mt-1 text-sm text-ink-soft">
                    {formatKip(g.amount)} {s.period[g.period]} · {fmt(s.membersCount, { n: g.members })}
                  </p>
                  {/* Members can pass the code on while the group is taking people; nobody can join once it starts. */}
                  {g.status === "forming" && g.my_status === "approved" && (
                    <p className="mt-2 text-sm text-ink-soft">
                      {s.fCode}: <span className="tabular font-semibold tracking-[0.12em] text-brand-deep">{g.invite_code}</span>
                    </p>
                  )}
                  {orderOf(g.id).length > 0 && (
                    <ReceivingOrder rows={orderOf(g.id)} meId={me.id} labels={s} date={(d) => formatDate(d, locale)} />
                  )}
                  <p className="mt-auto pt-3 text-sm text-ink-soft">
                    {g.organizer_id === me.id ? s.organizing : fmt(s.organizedBy, { name: g.organizer_name })}
                    {g.current_round !== null && <> · {fmt(s.roundOf, { n: g.current_round, total: g.members })}</>}
                    {/* The order list above already shows the viewer's turn. */}
                    {g.my_status === "approved" && g.my_turn !== null && g.status !== "completed" && orderOf(g.id).length === 0 && (
                      <> · {fmt(s.yourTurn, { n: g.my_turn })}</>
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

type Dict = Awaited<ReturnType<typeof getT>>["savings"];

/** Who receives the pot in which round: ticked once paid out, highlighted while it is being collected. */
function ReceivingOrder({ rows, meId, labels: s, date }: { rows: OrderRow[]; meId: string; labels: Dict; date: (d: string) => string }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">{s.orderTitle}</p>
      <ol className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
        {rows.map((r) => (
          <li
            key={r.turn}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm ${r.status === "collecting" ? "bg-brand-wash/60" : ""}`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums ${
                r.status === "done" ? "bg-ok-wash text-ok" : r.status === "collecting" ? "bg-brand text-white" : "bg-sunken text-ink-soft"
              }`}
            >
              {r.status === "done" ? <CheckIcon width={14} height={14} /> : r.turn}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate ${r.user_id === meId ? "font-semibold text-ink" : "text-ink"}`}>
                {r.full_name}
                {r.user_id === meId && <span className="font-normal text-muted"> ({s.you})</span>}
              </p>
              {/* On a phone the date goes under the name, so the name keeps the width. */}
              <p className="tabular text-xs text-ink-soft sm:hidden">{date(r.due_date)}</p>
            </div>
            <span className="tabular hidden shrink-0 text-xs text-ink-soft sm:inline">{date(r.due_date)}</span>
            {r.status !== "upcoming" && (
              <span className={`shrink-0 text-xs font-medium ${r.status === "done" ? "text-ok" : "text-brand"}`}>
                {r.status === "done" ? s.orderReceived : s.orderNow}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
