import Link from "next/link";
import { getTranslations } from "next-intl/server";

const SEZIONI = ["titolare", "dati", "finalita", "modelli", "conservazione", "diritti", "limitedUse"] as const;

export default async function PaginaPrivacy() {
  const t = await getTranslations("privacy");
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      <div className="space-y-2">
        <Link href="/sign-in" className="text-sm text-accent-strong underline-offset-4 hover:underline">
          ← {t("indietro")}
        </Link>
        <h1 className="text-3xl">{t("titolo")}</h1>
        <p className="text-text-muted">{t("introduzione")}</p>
      </div>
      {SEZIONI.map((s) => (
        <section key={s} className="space-y-2">
          <h2 className="text-lg">{t(`${s}.titolo`)}</h2>
          <p className="leading-relaxed text-text-muted">{t(`${s}.testo`)}</p>
        </section>
      ))}
    </main>
  );
}
