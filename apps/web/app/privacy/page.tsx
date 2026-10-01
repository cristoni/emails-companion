import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { utenteCorrente } from "@/lib/server/sessione";
import { LinkIndietro } from "./link-indietro";

const SEZIONI = ["titolare", "dati", "finalita", "modelli", "conservazione", "diritti", "limitedUse"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");
  return { title: t("titolo") };
}

/** Informativa sulla privacy, leggibile con o senza sessione. "Indietro" torna alla pagina dell'app da cui si arriva. */
export default async function PaginaPrivacy() {
  const t = await getTranslations("privacy");
  const utente = await utenteCorrente().catch(() => null);
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-12 sm:px-6">
      <div className="space-y-2">
        <LinkIndietro href={utente ? "/settings#privacy" : "/sign-in"}>
          <ArrowLeft className="size-4" aria-hidden />
          {t("indietro")}
        </LinkIndietro>
        <h1 className="text-2xl">{t("titolo")}</h1>
        <p className="text-text-muted">{t("introduzione")}</p>
      </div>
      {SEZIONI.map((s) => (
        <section key={s} className="space-y-2">
          <h2 className="text-lg">{t(`${s}.titolo`)}</h2>
          <p className="leading-relaxed">{t(`${s}.testo`)}</p>
        </section>
      ))}
    </main>
  );
}
