import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PulsanteAccessoGoogle } from "./pulsante-accesso";
import { utenteCorrente } from "@/lib/server/sessione";

export default async function PaginaAccesso() {
  if (await utenteCorrente().catch(() => null)) redirect("/");
  const t = await getTranslations("accesso");
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_center,var(--color-accent-soft),transparent_70%)]" />
      <div className="relative w-full max-w-md space-y-8">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-widest text-accent-strong">Emails Companion</p>
          <h1 className="text-3xl">{t("titolo")}</h1>
          <p className="text-text-muted">{t("sottotitolo")}</p>
        </div>
        <section className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface-raised p-5 text-sm shadow-[var(--shadow-card)]">
          <h2 className="text-base">{t("informativa.titolo")}</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-text-muted">
            <li>{t("informativa.lettura")}</li>
            <li>{t("informativa.fuoriBrowser")}</li>
            <li>{t("informativa.modelli")}</li>
            <li>{t("informativa.invio")}</li>
            <li>{t("informativa.nonVerificata")}</li>
          </ul>
          <Link href="/privacy" className="inline-block text-accent-strong underline-offset-4 hover:underline">
            {t("informativa.completa")}
          </Link>
        </section>
        <PulsanteAccessoGoogle etichetta={t("pulsante")} />
      </div>
    </main>
  );
}
