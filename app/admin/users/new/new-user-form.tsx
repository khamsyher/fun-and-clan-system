"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createUser } from "@/app/actions/users";
import { useT } from "@/components/i18n-provider";
import { Field, SelectField, SubmitButton } from "@/components/ui";
import { CREATABLE_ROLES } from "@/lib/definitions";
import { fmt } from "@/lib/i18n/config";

type Clan = { id: string; name: string; code: string };

/** Wrapper that starts a fresh form after each account, via the key. */
export function NewUserForm(props: { clans: Clan[]; canCreateSupport: boolean }) {
  const [round, setRound] = useState(0);
  return <Form key={round} {...props} onAnother={() => setRound((r) => r + 1)} />;
}

function Form({ clans, canCreateSupport, onAnother }: { clans: Clan[]; canCreateSupport: boolean; onAnother: () => void }) {
  const [state, action] = useActionState(createUser, undefined);
  const t = useT();
  const u = t.users;
  const v = state?.values;
  const e = state?.errors;
  const [role, setRole] = useState(v?.role ?? "user");
  const inClan = role === "member" || role === "clan_admin";

  // Created: the password is shown this once, to be passed on to the person.
  if (state?.success && v) {
    return (
      <div className="space-y-4" role="status">
        <p className="text-sm text-ink">{fmt(u.newDone, { name: v.name, phone: v.phone })}</p>
        <div className="rounded-lg bg-brand-wash px-4 py-3">
          <p className="text-xs text-ink-soft">{u.newPassword}</p>
          <p className="tabular mt-0.5 font-mono text-xl font-semibold tracking-wider text-brand select-all">{state.success}</p>
        </div>
        <p className="text-xs text-muted">{t.reset.note}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/users/${v.id}`} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2">
            {u.newOpen}
          </Link>
          <button type="button" onClick={onAnother} className="rounded-lg px-4 py-2 text-sm font-medium text-ink-soft hover:bg-sunken">
            {u.newAnother}
          </button>
        </div>
      </div>
    );
  }

  const roles = CREATABLE_ROLES.filter((r) => r !== "support" || canCreateSupport).map((r) => ({
    value: r,
    label: t.roles[r],
  }));

  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label={u.newName} name="fullName" defaultValue={v?.fullName} errors={e?.fullName} autoComplete="off" />
      <Field
        label={u.newPhone}
        name="phone"
        type="tel"
        inputMode="tel"
        placeholder="020 1234 5678"
        defaultValue={v?.phone}
        errors={e?.phone}
        hint={u.newPhoneHint}
      />
      <Field label={u.newEmail} name="email" type="email" optional defaultValue={v?.email} errors={e?.email} />
      <SelectField
        label={u.newRole}
        name="role"
        options={roles}
        value={role}
        onChange={(ev) => setRole(ev.target.value)}
        errors={e?.role}
        hint={u.newRoleHint}
      />
      {inClan && (
        <SelectField
          label={u.leaderClan}
          name="clanId"
          placeholder={u.leaderPickClan}
          options={clans.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
          defaultValue={v?.clanId ?? ""}
          errors={e?.clanId}
        />
      )}
      <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-ink-soft">{u.newPasswordNote}</p>
      <SubmitButton pendingLabel={u.working} className="w-full">
        {u.newCreate}
      </SubmitButton>
    </form>
  );
}
