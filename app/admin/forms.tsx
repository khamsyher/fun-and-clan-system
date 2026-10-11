"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClan, setClanType, updatePlatformFee } from "@/app/actions/admin";
import { useT } from "@/components/i18n-provider";
import { Field, Notice, SelectField, SubmitButton } from "@/components/ui";
import { PercentIcon } from "@/components/icons";

export type ClanTypeOption = { id: string; name: string; is_active: boolean };

/** A general user whose identity the platform has verified: who can be picked to lead a new clan. */
export type LeaderCandidate = { id: string; full_name: string; phone: string };

export function CreateClanForm({ types, candidates }: { types: ClanTypeOption[]; candidates: LeaderCandidate[] }) {
  const [state, action] = useActionState(createClan, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const t = useT();
  const a = t.admin;
  const active = types.filter((x) => x.is_active);
  const v = state?.values;
  const e = state?.errors;
  // Picking someone already verified is the usual way; a new account is the fallback.
  const [mode, setMode] = useState<"existing" | "new">(
    v?.leaderMode === "new" || (!v && candidates.length === 0) ? "new" : "existing",
  );
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase().replace(/\s/g, "");
  const shown = needle
    ? candidates.filter((c) => c.full_name.toLowerCase().replace(/\s/g, "").includes(needle) || c.phone.includes(needle))
    : candidates;

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      {state?.message && <Notice tone="error">{state.message}</Notice>}
      <Field label={a.clanName} name="name" defaultValue={v?.name} errors={e?.name} placeholder="Vang Clan — Vientiane" />
      <Field
        label={a.clanCode}
        name="code"
        autoCapitalize="characters"
        defaultValue={v?.code}
        errors={e?.code}
        hint={a.clanCodeHint}
        placeholder="VANG01"
        className="[&_input]:uppercase"
      />
      {active.length > 0 && (
        <SelectField
          label={t.clanTypes.clanType}
          name="clanTypeId"
          optional
          placeholder={t.clanTypes.none}
          options={active.map((x) => ({ value: x.id, label: x.name }))}
          defaultValue={v?.clanTypeId ?? ""}
          errors={e?.clanTypeId}
        />
      )}
      <p className="pt-2 text-sm font-medium text-brand">{a.leaderAccount}</p>
      <input type="hidden" name="leaderMode" value={mode} />
      <div role="radiogroup" aria-label={a.leaderAccount} className="grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1 text-sm">
        {(["existing", "new"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-md px-2 py-1.5 font-medium ${mode === m ? "bg-surface text-brand shadow-sm" : "text-ink-soft hover:text-ink"}`}
          >
            {m === "existing" ? a.leaderExisting : a.leaderNew}
          </button>
        ))}
      </div>

      {mode === "existing" ? (
        candidates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-sm text-ink-soft">{a.leaderNoCandidates}</p>
        ) : (
          <div className="space-y-2">
            <input
              type="search"
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              placeholder={a.leaderSearch}
              aria-label={a.leaderSearch}
              className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
            />
            <SelectField
              label={a.leaderVerified}
              name="leaderId"
              placeholder={shown.length ? a.leaderPick : a.leaderNoMatch}
              options={shown.map((c) => ({ value: c.id, label: `${c.full_name} · ${c.phone}` }))}
              defaultValue={v?.leaderId ?? ""}
              errors={e?.leaderId}
              hint={a.leaderVerifiedHint}
            />
          </div>
        )
      ) : (
        <>
          <Field label={a.leaderName} name="leaderName" defaultValue={v?.leaderName} errors={e?.leaderName} />
          <Field label={a.leaderPhone} name="leaderPhone" type="tel" inputMode="tel" defaultValue={v?.leaderPhone} errors={e?.leaderPhone} />
          <Field
            label={a.tempPassword}
            name="leaderPassword"
            type="password"
            autoComplete="new-password"
            errors={e?.leaderPassword}
            hint={a.tempPasswordHint}
          />
        </>
      )}
      <SubmitButton pendingLabel={a.creating} className="w-full">
        {a.createClan}
      </SubmitButton>
    </form>
  );
}

export function PlatformFeeForm({ current }: { current: string }) {
  const [state, action] = useActionState(updatePlatformFee, undefined);
  const a = useT().admin;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.success && <Notice tone="success">{state.success}</Notice>}
      <Field
        label={a.feeLabel}
        name="fee"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        max="100"
        icon={<PercentIcon width={18} height={18} />}
        defaultValue={state?.values?.fee ?? Number(current)}
        errors={state?.errors?.fee}
        hint={a.feeHint}
      />
      <SubmitButton variant="quiet" pendingLabel={a.saving} className="w-full">
        {a.saveFee}
      </SubmitButton>
    </form>
  );
}

/** Changes a clan's type straight from the clan list; saves as soon as a type is picked. */
export function ClanTypeSelect({ clanId, current, types }: { clanId: string; current: string | null; types: ClanTypeOption[] }) {
  const ct = useT().clanTypes;
  // A retired type stays visible on the clan that has it, but isn't offered to others.
  const options = types.filter((x) => x.is_active || x.id === current);
  return (
    <form action={setClanType}>
      <input type="hidden" name="clanId" value={clanId} />
      <select
        name="clanTypeId"
        aria-label={ct.clanType}
        defaultValue={current ?? ""}
        onChange={(ev) => ev.currentTarget.form?.requestSubmit()}
        className="h-8 max-w-40 rounded-md border border-line bg-surface px-1.5 text-xs text-ink-soft"
      >
        <option value="">{ct.none}</option>
        {options.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </form>
  );
}
