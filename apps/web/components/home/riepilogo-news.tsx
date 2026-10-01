import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Mail, Newspaper, Sparkles } from "lucide-react";
import type { VistaNewsDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Avviso } from "@/components/ui/avviso";
import { Scheda } from "@/components/ui/scheda";
import { aggiornaRiepilogoAzione } from "./azioni";

/**
 * Riepilogo News delle ultime 24 ore (home e `/news`). Ogni voce è testo dell'AI, senza lingua dichiarata
 * perché può riassumere email in lingue diverse, seguito da link numerati alle email da cui deriva, ognuno
 * con l'oggetto dell'email come nome. In fondo la rigenerazione, che non compare quando nella finestra non
 * ci sono News. Nella home (`collegaPaginaNews`) il titolo nomina la categoria; in `/news` la nomina già la pagina.
 */
export function RiepilogoNews({ news, collegaPaginaNews = false }: { news: VistaNewsDto; collegaPaginaNews?: boolean }) {
  const t = useTranslations("home.riepilogo");
  const tc = useTranslations("comuni");
  const nonIncluse = news.nonIncluse.length;
  const oggetti = new Map(news.membri.map((m) => [m.emailId, m.oggetto.trim()]));
  const nomeFonte = (emailId: string, numero: number) => {
    const oggetto = oggetti.get(emailId);
    return oggetto ? t("fonteOggetto", { oggetto }) : t("fonte", { numero });
  };

  return (
    <section aria-labelledby="riepilogo-news-titolo">
      <Scheda className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id="riepilogo-news-titolo" className="flex items-center gap-2 text-base">
            <Newspaper className="size-4 text-text-muted" aria-hidden />
            {collegaPaginaNews ? t("titolo") : t("titoloPaginaNews")}
          </h2>
          {news.voci.length > 0 ? (
            <span title={t("testoAiAiuto")} className="inline-flex items-center gap-1 text-xs text-suggestion">
              <Sparkles className="size-3.5" aria-hidden />
              {t("testoAi")}
            </span>
          ) : null}
        </div>

        {news.errore ? <Avviso tono="attenzione" titolo={t("errore", { motivo: testoCodice(tc, "errori", news.errore) })} /> : null}

        {news.vuoto ? (
          <p className="text-sm text-text-muted">{t("vuoto")}</p>
        ) : news.voci.length === 0 ? (
          <p className="text-sm text-text-muted">{t("inPreparazione")}</p>
        ) : (
          <>
            <p className="sr-only">{t("testoAiAiuto")}</p>
            <ul className="space-y-3">
              {news.voci.map((voce, i) => (
                <li key={`${i}-${voce.emailIds.join(",")}`} className="flex gap-2.5 text-sm leading-relaxed">
                  <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-text-muted" />
                  <p className="min-w-0">
                    <TestoSemplice come="span" testo={voce.testo} />
                    {voce.emailIds.length > 0 ? (
                      <span className="ml-1.5 inline-flex gap-1 align-text-bottom">
                        {/* Busta e numero a vista, l'oggetto come nome e titolo; l'area sensibile arriva a ~36px. */}
                        {voce.emailIds.map((emailId, n) => {
                          const nome = nomeFonte(emailId, n + 1);
                          return (
                            <LinkEmail
                              key={emailId}
                              emailId={emailId}
                              title={nome}
                              className="relative inline-flex h-5 items-center gap-0.5 rounded border border-border px-1 text-[11px] leading-none font-medium tabular-nums text-text-muted transition-colors after:absolute after:-inset-2 after:content-[''] hover:border-accent hover:text-accent-strong"
                            >
                              <Mail className="size-3 shrink-0" aria-hidden />
                              <span aria-hidden>{n + 1}</span>
                              <span className="sr-only">{nome}</span>
                            </LinkEmail>
                          );
                        })}
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Senza News nella finestra non c'è nulla da aprire né da aggiornare: il riquadro resta una riga. */}
        {news.vuoto ? null : (
          <div className="space-y-2 border-t border-border pt-3 text-xs text-text-muted">
            {collegaPaginaNews || nonIncluse > 0 ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {collegaPaginaNews ? (
                  <Link
                    href="/news"
                    className="relative inline-flex items-center gap-1 text-sm font-medium text-accent-strong underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[''] hover:underline"
                  >
                    {t("vediNews")}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                ) : null}
                {nonIncluse > 0 ? <span>{t("nonIncluse", { numero: nonIncluse })}</span> : null}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              {news.generatoIl ? (
                <span>
                  {t("aggiornato")} <Istante iso={news.generatoIl} stile="relativo" />
                </span>
              ) : (
                <span />
              )}
              <span title={t("aggiornaAiuto")} className="-mr-3 inline-flex">
                <ModuloAzione azione={aggiornaRiepilogoAzione} etichetta={t("aggiorna")} variante="fantasma" mostraOk messaggi={{ ok: t("aggiornaRichiesto") }} />
              </span>
            </div>
          </div>
        )}
      </Scheda>
    </section>
  );
}
