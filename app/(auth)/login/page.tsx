import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).login.metaTitle };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [t, sp] = await Promise.all([getT(), searchParams]);
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : undefined;
  return (
    <>
      <h1 className="font-display text-4xl tracking-[-0.02em] text-brand-deep">{t.login.title}</h1>
      <p className="mt-2 text-ink-soft">{t.login.lede}</p>
      <div className="mt-8">
        <LoginForm next={next} />
      </div>
      <p className="mt-8 border-t border-line pt-6 text-sm text-ink-soft">
        {t.login.newHere}{" "}
        <Link
          href="/register"
          className="font-semibold text-brand underline decoration-brand-bright/40 decoration-2 underline-offset-4 hover:decoration-brand-bright"
        >
          {t.login.registerLink}
        </Link>
      </p>
    </>
  );
}
