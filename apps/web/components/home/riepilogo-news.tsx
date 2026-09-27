import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Newspaper, Sparkles } from "lucide-react";
import type { VistaNewsDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Avviso } from "@/components/ui/avviso";
import { Distintivo } from "@/components/ui/distintivo";
import { StatoVuoto } from "@/components/ui/pagina";
import { Scheda } from "@/components/ui/scheda";
import { aggiornaRiepilogoAzione } from "./azioni";

/**
 * Riepilogo News delle ultime 24 ore (home e `/news`). Ogni voce è testo dell'AI, senza lingua dichiarata
 * perché può riassumere email in lingue diverse, con link numerati alle email da cui deriva.
 */
export function RiepilogoNews({ news, collegaPaginaNews = false }: { news: VistaNewsDto; collegaPaginaNews?: boolean }) {
  const t = useTranslations("home.riepilogo");
  const tc = useTranslations("comuni");
  const nonIncluse = news.nonIncluse.length;

  return (
    <section aria-labelledby="riepilogo-news-titolo">
      <Scheda>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="riepilogo-news-titolo" className="flex items-center gap-2 text-base">
                <Newspaper className="size-4 text-text-muted" aria-hidden />
                {t("titolo")}
              </h2>
              {news.voci.length > 0 ? (
                <span title={t("testoAiAiuto")}>
                  <Distintivo tono="neutro" icona={<Sparkles className="size-3" aria-hidden />}>
                    {t("testoAi")}
                  </Distintivo>
                </span>
              ) : null}
            </div>
            <p className="text-sm text-text-muted">{t("descrizione")}</p>
          </div>
          <ModuloAzione azione={aggiornaRiepilogoAzione} etichetta={t("aggiorna")} mostraOk messaggi={{ ok: t("aggiornaRichiesto") }} />
        </div>

        <div className="space-y-4 px-5 py-4">
          {news.errore ? <Avviso tono="attenzione" titolo={t("errore", { motivo: testoCodice(tc, "errori", news.errore) })} /> : null}

          {news.vuoto ? (
            <StatoVuoto titolo={t("vuoto")}>{t("vuotoAiuto")}</StatoVuoto>
          ) : news.voci.length === 0 ? (
            <p className="text-sm text-text-muted">{t("inPreparazione")}</p>
          ) : (
            <>
              <p className="sr-only">{t("testoAiAiuto")}</p>
              <ul className="space-y-4">
                {news.voci.map((voce, i) => (
                  <li key={`${i}-${voce.emailIds.join(",")}`} className="flex gap-3">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                    <div className="min-w-0 space-y-2">
                      <TestoSemplice testo={voce.testo} className="text-sm leading-relaxed" />
                      {voce.emailIds.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                          <span>{t("fonti")}</span>
                          {voce.emailIds.map((emailId, n) => (
                            <LinkEmail
                              key={emailId}
                              emailId={emailId}
                              className="inline-flex size-6 items-center justify-center rounded-md border border-border bg-surface font-mono text-[11px] text-text transition-colors hover:border-accent hover:text-accent-strong"
                            >
                              <span aria-hidden>{n + 1}</span>
                              <span className="sr-only">{t("fonte", { numero: n + 1 })}</span>
                            </LinkEmail>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!news.vuoto && (nonIncluse > 0 || collegaPaginaNews) ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-sm">
              {nonIncluse > 0 ? <span className="text-text-muted">{t("nonIncluse", { numero: nonIncluse })}</span> : null}
              {collegaPaginaNews ? (
                <Link href="/news" className="inline-flex items-center gap-1 text-accent-strong underline-offset-4 hover:underline">
                  {t("vediNews")}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </p>
          ) : null}

          {news.generatoIl ? (
            <p className="text-xs text-text-muted">
              {t("aggiornato")} <Istante iso={news.generatoIl} stile="data_ora" />
            </p>
          ) : null}
        </div>
      </Scheda>
    </section>
  );
}
