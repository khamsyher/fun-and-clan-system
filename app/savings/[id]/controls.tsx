"use client";

import { useActionState, useState } from "react";
import {
  cancelGroup,
  decideMember,
  removeMember,
  requestSwap,
  respondSwap,
  remindUnpaid,
  reviewPayment,
  saveOrder,
  startGroup,
  updateMyReceivingDetails,
  uploadSlip,
} from "@/app/actions/savings";
import { buttonQuiet } from "@/components/button-styles";
import { useT } from "@/components/i18n-provider";
import { fmt } from "@/lib/i18n/config";
import { CheckIcon, LinkIcon } from "@/components/icons";
import { Field, FileField, Notice, SubmitButton, TextAreaField } from "@/components/ui";
import { ReceivingFields, type ReceivingValues } from "../receiving-fields";

/** The code in large type, and a button that copies the join link. */
export function InviteCode({ code, url }: { code: string; url: string }) {
  const s = useT().savings;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked (http, old browser): show the link so it can be copied by hand.
      window.prompt(s.copyLink, url);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="tabular font-display text-3xl tracking-[0.18em] text-brand-deep">{code}</p>
      <button type="button" onClick={copy} className={buttonQuiet}>
        {copied ? <CheckIcon width={16} height={16} /> : <LinkIcon width={16} height={16} />}
        {copied ? s.copied : s.copyLink}
      </button>
    </div>
  );
}

/**
 * Up/down buttons rather than drag and drop: easier on a phone and for older relatives.
 * The page remounts this (via `key`) whenever the saved order changes, e.g. after a random draw.
 * Only shown before the start: once a group runs, its order is locked.
 */
export function OrderEditor({
  groupId,
  organizerMemberId,
  members,
}: {
  groupId: string;
  organizerMemberId: string;
  members: { id: string; name: string }[];
}) {
  const s = useT().savings;
  const [order, setOrder] = useState(members);
  const [state, action] = useActionState(saveOrder, undefined);
  const move = (i: number, by: -1 | 1) =>
    setOrder((o) => {
      const n = [...o];
      [n[i], n[i + by]] = [n[i + by], n[i]];
      return n;
    });
  const changed = order.some((m, i) => m.id !== members[i]?.id);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="order" value={order.map((m) => m.id).join(",")} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      {state?.success && !changed && <Notice tone="success">{state.success}</Notice>}
      <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {order.map((m, i) => (
          <li key={m.id} className="flex items-center gap-2 px-4 py-2.5">
            <span className="tabular w-7 text-sm font-semibold text-brand">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-ink">{m.name}</span>
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`${s.moveUp}: ${m.name}`}
              className="rounded-md px-2.5 py-1.5 text-ink-soft hover:bg-sunken disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              aria-label={`${s.moveDown}: ${m.name}`}
              className="rounded-md px-2.5 py-1.5 text-ink-soft hover:bg-sunken disabled:opacity-30"
            >
              ↓
            </button>
            {m.id !== organizerMemberId && (
              <button
                type="submit"
                formAction={removeMember}
                name="memberId"
                value={m.id}
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-bad hover:bg-bad-wash"
              >
                {s.remove}
              </button>
            )}
          </li>
        ))}
      </ol>
      <SubmitButton variant="quiet" pendingLabel={s.saving}>
        {s.saveOrder}
      </SubmitButton>
    </form>
  );
}

export function StartGroupForm({ groupId }: { groupId: string }) {
  const s = useT().savings;
  const [state, action] = useActionState(startGroup, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="groupId" value={groupId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <SubmitButton pendingLabel={s.starting} className="w-full sm:w-auto">
        {s.start}
      </SubmitButton>
    </form>
  );
}

export function CancelGroupButton({ groupId }: { groupId: string }) {
  const s = useT().savings;
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${buttonQuiet} text-bad`}>
        {s.cancelGroup}
      </button>
    );
  }
  return (
    <form action={cancelGroup} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <span className="text-sm text-ink">{s.cancelConfirm}</span>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-sunken">
        {s.keep}
      </button>
      <button type="submit" className="rounded-md bg-bad px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
        {s.cancelYes}
      </button>
    </form>
  );
}

/** "I have paid": the payer sends the slip of the transfer they already made. */
export function SlipForm({ paymentId }: { paymentId: string }) {
  const tt = useT();
  const s = tt.savings;
  const [state, action] = useActionState(uploadSlip, undefined);
  const today = new Date().toISOString().slice(0, 10);
  if (state?.success) return <Notice tone="success">{state.success}</Notice>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="paymentId" value={paymentId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <Field
        label={s.fTransferDate}
        name="transferDate"
        type="date"
        max={today}
        defaultValue={state?.values?.transferDate ?? today}
        errors={state?.errors?.transferDate}
      />
      <FileField
        label={s.fSlip}
        name="slip"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hint={s.fSlipHint}
        errors={state?.errors?.slip}
        chooseLabel={tt.common.chooseFile}
      />
      <SubmitButton pendingLabel={s.sending} className="w-full">
        {s.sendSlip}
      </SubmitButton>
    </form>
  );
}

/** The receiver confirms a slip, or says it did not arrive (with a reason). */
export function ReviewPaymentForm({ paymentId }: { paymentId: string }) {
  const s = useT().savings;
  const [state, action, pending] = useActionState(reviewPayment, undefined);
  if (state?.success) return <Notice tone="success">{state.success}</Notice>;
  return (
    <form action={action} className="mt-3 space-y-3" noValidate>
      <input type="hidden" name="paymentId" value={paymentId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <TextAreaField label={s.reason} name="note" optional placeholder={s.reasonPlaceholder} errors={state?.errors?.note} maxLength={300} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 font-medium text-bad hover:bg-bad-wash disabled:opacity-60"
        >
          {s.reject}
        </button>
        <button
          type="submit"
          name="decision"
          value="confirm"
          disabled={pending}
          className="inline-flex h-11 flex-[2] items-center justify-center rounded-lg bg-brand px-4 font-semibold text-white shadow-soft hover:bg-brand-2 disabled:opacity-60"
        >
          {s.confirm}
        </button>
      </div>
    </form>
  );
}

/** For money handed over in person: no slip needed. */
export function CashButton({ paymentId }: { paymentId: string }) {
  const s = useT().savings;
  const [state, action, pending] = useActionState(reviewPayment, undefined);
  if (state?.success) return <Notice tone="success">{state.success}</Notice>;
  return (
    <form action={action}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="decision" value="cash" />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <button type="submit" disabled={pending} className={buttonQuiet}>
        {s.markCash}
      </button>
    </form>
  );
}

export function RemindForm({ groupId }: { groupId: string }) {
  const s = useT().savings;
  const [state, action] = useActionState(remindUnpaid, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="groupId" value={groupId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      <SubmitButton variant="quiet" pendingLabel={s.sending}>
        {s.remind}
      </SubmitButton>
    </form>
  );
}

export function ReceivingForm({ groupId, initial, hasQr }: { groupId: string; initial: ReceivingValues; hasQr: boolean }) {
  const s = useT().savings;
  const [state, action] = useActionState(updateMyReceivingDetails, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="groupId" value={groupId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      <ReceivingFields values={state?.values ?? initial} errors={state?.errors} hasQr={hasQr} />
      <SubmitButton variant="quiet" pendingLabel={s.saving}>
        {s.save}
      </SubmitButton>
    </form>
  );
}

export type JoinRequestInfo = {
  id: string;
  name: string;
  phone: string;
  clan: string;
  askedOn: string;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  qrFileId: string | null;
};

/** One person asking to join: a short line, their full details on demand, and the decision. */
export function JoinRequest({ m, summary }: { m: JoinRequestInfo; summary: string }) {
  const s = useT().savings;
  const [open, setOpen] = useState(false);
  const panelId = `request-${m.id}`;
  const rows: [string, string | null][] = [
    [s.fPhone, m.phone],
    [s.fBank, m.bankName],
    [s.fAccountName, m.accountName],
    [s.fAccountNumber, m.accountNumber],
  ];

  return (
    <li className="p-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{m.name}</p>
          <p className="text-sm text-ink-soft">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-wash"
          >
            {open ? s.hideDetails : s.viewDetails}
          </button>
          <form action={decideMember} className="flex gap-2">
            <input type="hidden" name="memberId" value={m.id} />
            <button type="submit" name="decision" value="decline" className="rounded-md px-3 py-1.5 text-sm font-medium text-bad hover:bg-bad-wash">
              {s.decline}
            </button>
            <button type="submit" name="decision" value="approve" className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-2">
              {s.approve}
            </button>
          </form>
        </div>
      </div>

      {open && (
        <div id={panelId} className="mt-3 flex flex-wrap items-start gap-5 rounded-lg border border-line bg-paper/60 p-4">
          <div className="min-w-0 flex-1 text-sm">
            <p className="mb-2 text-ink-soft">
              {m.clan} · {m.askedOn}
            </p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-ink-soft">{label}</dt>
                  <dd className="tabular break-words font-medium text-ink">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
          {m.qrFileId && (
            <a href={`/files/${m.qrFileId}`} target="_blank" rel="noopener" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked upload */}
              <img src={`/files/${m.qrFileId}`} alt={s.fQr} className="size-36 rounded-md border border-line bg-white object-contain" />
              <span className="mt-1 block text-center text-xs text-brand">{s.fQr}</span>
            </a>
          )}
        </div>
      )}
    </li>
  );
}

/** "Ask to swap" next to someone who can still trade turns; opens a short message to them. */
export function SwapAskButton({ groupId, toMemberId, toName }: { groupId: string; toMemberId: string; toName: string }) {
  const s = useT().savings;
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(requestSwap, undefined);
  if (state?.success) return <span className="text-sm text-ok">{state.success}</span>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonQuiet}>
        {s.askSwap}
      </button>
    );
  }
  return (
    <form action={action} className="w-full space-y-3" noValidate>
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="toMemberId" value={toMemberId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <TextAreaField
        label={fmt(s.swapMessage, { name: toName })}
        name="note"
        optional
        placeholder={s.swapMessagePlaceholder}
        maxLength={300}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className={buttonQuiet}>
          {s.keepSwap}
        </button>
        <SubmitButton pendingLabel={s.sending} className="h-10 text-sm">
          {s.sendSwap}
        </SubmitButton>
      </div>
    </form>
  );
}

/** The person asked to swap answers. */
export function SwapResponse({ swapId }: { swapId: string }) {
  const s = useT().savings;
  const [state, action, pending] = useActionState(respondSwap, undefined);
  if (state?.success) return <Notice tone="success">{state.success}</Notice>;
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="swapId" value={swapId} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="decline"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-bad hover:bg-bad-wash disabled:opacity-60"
        >
          {s.declineSwap}
        </button>
        <button
          type="submit"
          name="decision"
          value="accept"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-soft hover:bg-brand-2 disabled:opacity-60"
        >
          {s.acceptSwap}
        </button>
      </div>
    </form>
  );
}
