import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/app-shell";
import { requireRole } from "@/lib/dal";
import { query } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/definitions";
import { getT } from "@/lib/i18n/server";
import { NewUserForm } from "./new-user-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).users.newTitle };
}

export default async function NewUserPage() {
  const me = await requireRole(...STAFF_ROLES);
  const [t, clans] = await Promise.all([
    getT(),
    query<{ id: string; name: string; code: string }>(`SELECT id, name, code FROM clans WHERE is_active ORDER BY name`),
  ]);
  const u = t.users;

  return (
    <>
      <Link href="/admin/users" className="text-sm font-medium text-brand hover:text-brand-bright">
        ← {u.backToList}
      </Link>
      <div className="mt-3">
        <PageHeading title={u.newTitle} lede={u.newLede} />
      </div>
      <div className="mt-8 max-w-xl rounded-xl border border-line bg-surface p-5 sm:p-6">
        {/* Only the super admin may hand out the Support role. */}
        <NewUserForm clans={clans} canCreateSupport={me.role === "super_admin"} />
      </div>
    </>
  );
}
