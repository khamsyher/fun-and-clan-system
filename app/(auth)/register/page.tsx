import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { RegisterForm } from "./register-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).register.metaTitle };
}

export default async function RegisterPage() {
  const t = await getT();
  return (
    <>
      <h1 className="font-display text-4xl tracking-[-0.02em] text-brand-deep">{t.register.title}</h1>
      <p className="mt-2 text-ink-soft">{t.register.lede}</p>
      <div className="mt-8">
        <RegisterForm />
      </div>
      <p className="mt-8 border-t border-line pt-6 text-sm text-ink-soft">
        {t.register.haveAccount}{" "}
        <Link
          href="/login"
          className="font-semibold text-brand underline decoration-brand-bright/40 decoration-2 underline-offset-4 hover:decoration-brand-bright"
        >
          {t.register.signInLink}
        </Link>
      </p>
    </>
  );
}
