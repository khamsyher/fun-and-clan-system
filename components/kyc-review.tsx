"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { reviewDocument } from "@/app/actions/profile";
import { useT } from "./i18n-provider";
import { CheckIcon, XIcon } from "./icons";

/** The platform owner's decision on one identity document. */
export function KycReview({ documentId, decided }: { documentId: string; decided: boolean }) {
  const [state, action] = useActionState(reviewDocument, undefined);
  const router = useRouter();
  const t = useT().kyc;

  // A decision moves the document between the queue's tabs. Revalidating on the server
  // doesn't refetch the tab being looked at (it carries a ?show=…), so ask for it here.
  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="w-full sm:w-64">
      <input type="hidden" name="documentId" value={documentId} />
      {state?.message && <p className="mb-2 rounded-md bg-bad-wash px-2.5 py-1.5 text-xs text-bad">{state.message}</p>}

      {decided ? (
        <Submit name="decision" value="revoke" tone="quiet">
          {t.reviewAgain}
        </Submit>
      ) : (
        <>
          <input
            name="note"
            aria-label={t.reason}
            placeholder={t.reasonPlaceholder}
            maxLength={300}
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/80 outline-none focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
          />
          {state?.errors?.note && <p className="mt-1 text-xs text-bad">{state.errors.note[0]}</p>}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Submit name="decision" value="reject" tone="bad">
              <XIcon width={16} height={16} />
              {t.reject}
            </Submit>
            <Submit name="decision" value="approve" tone="ok">
              <CheckIcon width={16} height={16} />
              {t.approve}
            </Submit>
          </div>
        </>
      )}
    </form>
  );
}

function Submit({
  children,
  name,
  value,
  tone,
}: {
  children: React.ReactNode;
  name: string;
  value: string;
  tone: "ok" | "bad" | "quiet";
}) {
  const { pending } = useFormStatus();
  const styles = {
    ok: "bg-ok text-white hover:opacity-90",
    bad: "border border-line-strong bg-surface text-ink hover:bg-bad-wash hover:text-bad",
    quiet: "border border-line-strong bg-surface text-ink-soft hover:bg-sunken hover:text-ink",
  }[tone];
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors disabled:cursor-wait disabled:opacity-60 ${styles}`}
    >
      {children}
    </button>
  );
}
