"use client";

import { useActionState } from "react";
import { requestToJoin } from "@/app/actions/savings";
import { useT } from "@/components/i18n-provider";
import { Notice, SubmitButton } from "@/components/ui";
import { ReceivingFields } from "../receiving-fields";

export function JoinForm({ code }: { code: string }) {
  const [state, action] = useActionState(requestToJoin, undefined);
  const s = useT().savings;
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="code" value={code} />
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <ReceivingFields values={state?.values} errors={state?.errors} />
      <SubmitButton pendingLabel={s.sending} className="w-full">
        {s.sendRequest}
      </SubmitButton>
    </form>
  );
}
