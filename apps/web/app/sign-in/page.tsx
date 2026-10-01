import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Info } from "lucide-react";
import { PulsanteAccessoGoogle } from "./pulsante-accesso";
import { utenteCorrente } from "@/lib/server/sessione";

/**
 * Accesso: cosa fa l'app, cosa serve per usarla (account Gmail e chiave OpenRouter), un riepilogo dell'informativa
 * prima del consenso e un solo comando, "Continua con Google", con subito sotto l'avviso sull'app non verificata.
 */
export default async function PaginaAccesso() {
  if (await utenteCorrente().catch(() => null)) redirect("/");
  const t = await getTranslations("accesso");
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_center,var(--color-accent-soft),transparent_70%)]"
      />
      <div className="relative w-full max-w-md space-y-8">
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-accent-strong text-[11px] font-bold text-accent-contrast">
              EC
            </span>
            Emails Companion
          </p>
          <h1 className="text-3xl">{t("titolo")}</h1>
          <p className="text-text-muted">{t("sottotitolo")}</p>
          <p className="text-sm">{t("requisiti")}</p>
        </div>
        <section className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface-raised p-5 text-sm shadow-[var(--shadow-card)]">
          <h2 className="text-base">{t("informativa.titolo")}</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-text-muted">
            <li>{t("informativa.lettura")}</li>
            <li>{t("informativa.modelli")}</li>
            <li>{t("informativa.invio")}</li>
          </ul>
          <Link href="/privacy" className="inline-block text-accent-strong underline-offset-4 hover:underline">
            {t("informativa.completa")}
          </Link>
        </section>
        <div className="space-y-3">
          <PulsanteAccessoGoogle etichetta={t("pulsante")} />
          <p className="flex items-start gap-2 text-xs text-text-muted">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            {t("informativa.nonVerificata")}
          </p>
        </div>
      </div>
    </main>
  );
}
