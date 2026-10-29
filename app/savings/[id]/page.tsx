import { SavingsRules } from "@/components/savings-rules";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading, Section } from "@/components/app-shell";
import { Pill } from "@/components/badge";
import { buttonQuiet } from "@/components/button-styles";
import { FileIcon, PencilIcon } from "@/components/icons";
import { Notice } from "@/components/ui";
import { cancelSwap, shuffleOrder } from "@/app/actions/savings";
import { requireRole } from "@/lib/dal";
import { DONOR_ROLES } from "@/lib/definitions";
import { formatDate, formatKip } from "@/lib/format";
import { feeFor } from "@/lib/funds";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { getGroup, listMembers, listPayments, listRounds, pendingSwaps, type MemberRow, type RoundRow } from "@/lib/savings";
import { canSwapRound, potFor, todayInLaos } from "@/lib/savings-rules";
import { siteUrl } from "@/lib/site-url";
import {
  CancelGroupButton,
  CashButton,
  InviteCode,
  SwapAskButton,
  SwapResponse,
  JoinRequest,
  OrderEditor,
  ReceivingForm,
  RemindForm,
  ReviewPaymentForm,
  SlipForm,
  StartGroupForm,
} from "./controls";

export async function generateMetadata({ params }: PageProps<"/savings/[id]">): Promise<Metadata> {
  const g = await getGroup((await params).id);
  return { title: g ? g.name : (await getT()).savings.metaTitle };
}

const GROUP_TONE = { forming: "warn", active: "info", completed: "ok", cancelled: "mute" } as const;
const ROUND_TONE = { upcoming: "mute", collecting: "info", done: "ok" } as const;
const PAY_TONE = { unpaid: "warn", pending: "info", confirmed: "ok", rejected: "bad" } as const;

type Dict = Awaited<ReturnType<typeof getT>>["savings"];

export default async function SavingsGroupPage({ params, searchParams }: PageProps<"/savings/[id]">) {
  const me = await requireRole(...DONOR_ROLES);
  const [{ id }, sp, t, locale] = await Promise.all([params, searchParams, getT(), getLocale()]);
  const s = t.savings;

  const group = await getGroup(id);
  if (!group) notFound();
  const members = await listMembers(group.id);
  const mine = members.find((m) => m.user_id === me.id);
  // Only people in the group (or waiting to be) can see it at all.
  if (!mine) notFound();
  const isOrganizer = group.organizer_id === me.id;

  const back = (
    <Link href="/savings" className="text-sm font-medium text-brand hover:text-brand-bright">
      ← {s.back}
    </Link>
  );

  if (group.status === "cancelled" || mine.status === "pending") {
    return (
      <>
        {back}
        <div className="mt-3">
          <PageHeading title={group.name} />
        </div>
        <div className="mt-8 max-w-2xl rounded-xl border border-line bg-surface p-5 sm:p-6">
          {group.status === "cancelled" ? (
            <p className="text-ink">{s.cancelled}</p>
          ) : (
            <>
              <h2 className="font-semibold text-ink">{s.pendingTitle}</h2>
              <p className="mt-1 text-sm text-ink-soft">{fmt(s.pendingBody, { organizer: group.organizer_name })}</p>
            </>
          )}
        </div>
      </>
    );
  }

  const approved = members.filter((m) => m.status === "approved");
  const waiting = members.filter((m) => m.status === "pending");
  const rounds = group.status === "forming" ? [] : await listRounds(group.id);
  const current = rounds.find((r) => r.status === "collecting") ?? null;
  const payments = current ? await listPayments(current.id) : [];
  const receiver = current ? (approved.find((m) => m.id === current.receiver_member_id) ?? null) : null;
  const iReceive = current?.receiver_member_id === mine.id;
  const myPayment = payments.find((p) => p.payer_member_id === mine.id) ?? null;
  const currentPot = current ? Number(current.pot) : 0;
  const myRound = rounds.find((r) => r.receiver_member_id === mine.id);
  const canEditReceiving = group.status === "forming" || (group.status === "active" && myRound?.status === "upcoming");
  const today = todayInLaos();
  const inviteUrl = `${await siteUrl()}/savings/join?code=${group.invite_code}`;
  const organizerMember = approved.find((m) => m.user_id === group.organizer_id);

  // Trading turns: only between people who have not received any money yet.
  const swaps = group.status === "active" ? await pendingSwaps(group.id) : [];
  const swappable = (r: RoundRow) => canSwapRound(r.status, r.status === "collecting" ? payments.map((p) => p.status) : []);
  const roundOf = (memberId: string) => rounds.find((r) => r.receiver_member_id === memberId);
  const incomingSwaps = swaps.filter((x) => x.to_member_id === mine.id);
  const outgoingSwap = swaps.find((x) => x.from_member_id === mine.id) ?? null;
  const swapPartners =
    myRound && swappable(myRound) && !outgoingSwap ? rounds.filter((r) => r.receiver_member_id !== mine.id && swappable(r)) : [];
  const roundLabel = (r: RoundRow | undefined) => (r ? fmt(s.swapRound, { n: r.round_no, date: formatDate(r.due_date, locale) }) : "");

  return (
    <>
      {back}
      {sp.saved === "1" && (
        <div className="mt-4">
          <Notice tone="success">{s.saved}</Notice>
        </div>
      )}

      <div className="mt-3">
        <PageHeading
          title={group.name}
          lede={
            <>
              {fmt(s.organizedBy, { name: group.organizer_name })} ·{" "}
              <span className="tabular">
                {formatKip(group.amount)} {s.period[group.period]}
              </span>{" "}
              · {fmt(s.membersCount, { n: group.members })}
            </>
          }
        >
          <div className="self-start sm:self-auto">
            <Pill tone={GROUP_TONE[group.status]}>{s.groupStatus[group.status]}</Pill>
          </div>
        </PageHeading>
        {group.description && <p className="mt-3 max-w-[65ch] whitespace-pre-line text-ink">{group.description}</p>}
        <div className="mt-5 max-w-3xl">
          <SavingsRules rules={group.rules} fileId={group.rules_file_id} updatedAt={group.rules_updated_at} t={t} locale={locale} />
        </div>
      </div>

      {/* ---------- Forming ---------- */}
      {/* Any member may pass the code on; it is hidden once the group starts, since nobody can join then. */}
      {group.status === "forming" && (
        <Section title={s.inviteTitle}>
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="mb-3 text-sm text-ink-soft">{isOrganizer ? s.inviteBody : s.inviteBodyMember}</p>
            <InviteCode code={group.invite_code} url={inviteUrl} />
          </div>
        </Section>
      )}

      {group.status === "forming" && isOrganizer && (
        <>
          {waiting.length > 0 && (
            <Section title={s.requestsTitle}>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {waiting.map((m) => (
                  <JoinRequest
                    key={m.id}
                    summary={memberSummary(m, s)}
                    m={{
                      id: m.id,
                      name: m.full_name,
                      phone: m.phone,
                      clan: m.clan_name ?? s.noClan,
                      askedOn: fmt(s.askedOn, { date: formatDate(m.joined_at, locale) }),
                      bankName: m.bank_name,
                      accountName: m.account_name,
                      accountNumber: m.account_number,
                      qrFileId: m.qr_file_id,
                    }}
                  />
                ))}
              </ul>
            </Section>
          )}

          <Section
            title={s.orderTitle}
            aside={
              <form action={shuffleOrder}>
                <input type="hidden" name="groupId" value={group.id} />
                <button type="submit" className={buttonQuiet}>
                  {s.shuffle}
                </button>
              </form>
            }
          >
            <p className="mb-3 text-sm text-ink-soft">{s.orderBody}</p>
            <OrderEditor
              key={approved.map((m) => m.id).join()}
              groupId={group.id}
              organizerMemberId={organizerMember?.id ?? ""}
              members={approved.map((m) => ({ id: m.id, name: m.full_name }))}
            />
          </Section>

          <Section title={s.startTitle}>
            <div className="rounded-xl border border-line bg-surface p-5">
              <p className="mb-4 text-sm text-ink">
                {fmt(s.startBody, { n: group.members, rounds: group.members, pot: formatKip(potFor(Number(group.amount), Number(group.members))) })}
              </p>
              <StartGroupForm groupId={group.id} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/savings/${group.id}/edit`} className={buttonQuiet}>
                <PencilIcon width={16} height={16} />
                {s.edit}
              </Link>
              <CancelGroupButton groupId={group.id} />
            </div>
          </Section>
        </>
      )}

      {group.status === "forming" && !isOrganizer && (
        <Section title={s.orderTitle}>
          <p className="mb-3 text-sm text-ink-soft">{s.waitingStart}</p>
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {approved.map((m) => (
              <li key={m.id} className={`flex items-center gap-3 px-4 py-3 ${m.id === mine.id ? "bg-brand-wash/40" : ""}`}>
                <span className="tabular w-7 text-sm font-semibold text-brand">{m.turn_no}</span>
                <span className="text-ink">{m.full_name}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* ---------- Active: the round being collected ---------- */}
      {current && receiver && (
        <Section title={fmt(s.currentRound, { n: current.round_no, total: rounds.length })}>
          <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-lg text-ink">{fmt(s.receives, { name: receiver.full_name, pot: formatKip(currentPot) })}</p>
              <p className="text-sm text-ink-soft">
                {fmt(s.due, { date: formatDate(current.due_date, locale) })}
                {current.due_date < today && (
                  <>
                    {" "}
                    · <span className="font-medium text-bad">{s.late}</span>
                  </>
                )}
              </p>
            </div>

            {iReceive && (
              <div className="mt-4 space-y-1">
                <p className="font-medium text-brand">{fmt(s.youReceive, { pot: formatKip(currentPot) })}</p>
                {Number(group.fee_percent ?? 0) > 0 && (
                  <p className="text-sm text-ink-soft">
                    {fmt(s.feeNote, { pct: Number(group.fee_percent), fee: formatKip(feeFor(currentPot, group.fee_percent ?? 0)) })}
                  </p>
                )}
              </div>
            )}

            {!iReceive && myPayment && (
              <div className="mt-5 border-t border-line pt-5">
                {myPayment.status === "confirmed" ? (
                  <Notice tone="success">{s.youPaid}</Notice>
                ) : myPayment.status === "pending" ? (
                  <p className="text-sm text-ink">{fmt(s.waitingCheck, { name: receiver.full_name })}</p>
                ) : (
                  <>
                    {myPayment.status === "rejected" && myPayment.review_note && (
                      <p className="mb-3 text-sm text-bad">{fmt(s.rejectedNote, { note: myPayment.review_note })}</p>
                    )}
                    <h3 className="font-semibold text-ink">{fmt(s.payTo, { amount: formatKip(myPayment.amount), name: receiver.full_name })}</h3>
                    <PayDetails m={receiver} s={s} />
                    <div className="mt-4">
                      <SlipForm paymentId={myPayment.id} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {current && (
        <Section title={s.paymentsTitle} aside={fmt(s.paidCount, { paid: current.paid, total: current.total })}>
          {isOrganizer && (
            <div className="mb-3">
              <RemindForm groupId={group.id} />
            </div>
          )}
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {payments.map((p) => (
              <li key={p.id} className="p-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{p.payer_name}</p>
                    <p className="tabular text-sm text-ink-soft">
                      {formatKip(p.amount)}
                      {p.transfer_date && <> · {formatDate(p.transfer_date, locale)}</>}
                      {p.confirmed_without_slip && <> · {s.cash}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Slips are private to the payer and the receiver. */}
                    {iReceive && p.slip_file_id && (
                      <a
                        href={`/files/${p.slip_file_id}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-bright"
                      >
                        <FileIcon width={16} height={16} />
                        {s.viewSlip}
                      </a>
                    )}
                    <Pill tone={PAY_TONE[p.status]}>{s.paymentStatus[p.status]}</Pill>
                  </div>
                </div>
                {iReceive && p.status === "pending" && <ReviewPaymentForm paymentId={p.id} />}
                {iReceive && (p.status === "unpaid" || p.status === "rejected") && (
                  <div className="mt-2">
                    <CashButton paymentId={p.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {group.status === "completed" && (
        <div className="mt-8">
          <Notice tone="success">{s.completedTitle}</Notice>
        </div>
      )}

      {/* ---------- Active: members trade turns, person to person ---------- */}
      {group.status === "active" && (incomingSwaps.length > 0 || outgoingSwap || swapPartners.length > 0) && (
        <Section title={s.swapTitle}>
          <p className="mb-3 text-sm text-ink-soft">{s.swapBody}</p>
          <div className="space-y-3">
            {incomingSwaps.map((x) => (
              <div key={x.id} className="rounded-xl border border-brand-bright/40 bg-brand-wash/40 p-4 sm:p-5">
                <p className="text-sm text-ink">
                  {fmt(s.swapIncoming, {
                    name: x.from_name,
                    theirs: roundOf(x.from_member_id)?.round_no ?? "",
                    theirDate: roundOf(x.from_member_id) ? formatDate(roundOf(x.from_member_id)!.due_date, locale) : "",
                    mine: myRound?.round_no ?? "",
                    myDate: myRound ? formatDate(myRound.due_date, locale) : "",
                  })}
                </p>
                {x.message && (
                  <blockquote className="mt-2 rounded-lg border-l-4 border-brand-bright/50 bg-surface px-3 py-2 text-sm whitespace-pre-line text-ink">
                    <span className="block text-xs text-ink-soft">{s.swapTheirMessage}</span>
                    {x.message}
                  </blockquote>
                )}
                <SwapResponse swapId={x.id} />
              </div>
            ))}

            {outgoingSwap && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 sm:px-5">
                <p className="text-sm text-ink">{fmt(s.swapWaiting, { name: outgoingSwap.to_name })}</p>
                <form action={cancelSwap}>
                  <input type="hidden" name="swapId" value={outgoingSwap.id} />
                  <button type="submit" className={buttonQuiet}>
                    {s.cancelSwap}
                  </button>
                </form>
              </div>
            )}

            {swapPartners.length > 0 && (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {swapPartners.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{r.receiver_name}</p>
                      <p className="tabular text-sm text-ink-soft">{roundLabel(r)}</p>
                    </div>
                    <SwapAskButton groupId={group.id} toMemberId={r.receiver_member_id} toName={r.receiver_name} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      )}

      {rounds.length > 0 && (
        <Section title={s.scheduleTitle}>
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {rounds.map((r) => (
              <li
                key={r.id}
                className={`flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5 ${r.receiver_member_id === mine.id ? "bg-brand-wash/40" : ""}`}
              >
                <div>
                  <p className="font-medium text-ink">
                    <span className="tabular text-brand">{r.round_no}.</span> {r.receiver_name}
                  </p>
                  <p className="tabular text-sm text-ink-soft">
                    {fmt(s.due, { date: formatDate(r.due_date, locale) })} · {formatKip(r.pot)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.status === "collecting" && <span className="tabular text-sm text-ink-soft">{fmt(s.paidCount, { paid: r.paid, total: r.total })}</span>}
                  <Pill tone={ROUND_TONE[r.status]}>{s.roundStatus[r.status]}</Pill>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {canEditReceiving && (
        <Section title={s.myReceiving}>
          <div className="max-w-2xl rounded-xl border border-line bg-surface p-5">
            <ReceivingForm
              groupId={group.id}
              hasQr={Boolean(mine.qr_file_id)}
              initial={{ bankName: mine.bank_name ?? "", accountName: mine.account_name ?? "", accountNumber: mine.account_number ?? "" }}
            />
          </div>
        </Section>
      )}
    </>
  );
}

/** Clan and a short "where they receive" line, for the organizer deciding on a request. */
function memberSummary(m: MemberRow, s: Dict) {
  const receiving = [m.bank_name, m.account_number].filter(Boolean).join(" · ") || (m.qr_file_id ? s.fQr : s.noReceiving);
  return `${m.clan_name ?? s.noClan} · ${receiving}`;
}

/** Where to send this round's money. */
function PayDetails({ m, s }: { m: MemberRow; s: Dict }) {
  return (
    <div className="mt-3 flex flex-wrap items-start gap-4 rounded-lg border border-line bg-paper/60 p-4">
      {m.qr_file_id && (
        // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked upload
        <img src={`/files/${m.qr_file_id}`} alt={s.fQr} className="size-40 rounded-md border border-line bg-white object-contain" />
      )}
      <dl className="space-y-1 text-sm">
        {m.bank_name && (
          <div>
            <dt className="inline text-ink-soft">{s.fBank}: </dt>
            <dd className="inline font-medium text-ink">{m.bank_name}</dd>
          </div>
        )}
        {m.account_name && (
          <div>
            <dt className="inline text-ink-soft">{s.fAccountName}: </dt>
            <dd className="inline font-medium text-ink">{m.account_name}</dd>
          </div>
        )}
        {m.account_number && (
          <div>
            <dt className="inline text-ink-soft">{s.fAccountNumber}: </dt>
            <dd className="tabular inline font-medium text-ink">{m.account_number}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
