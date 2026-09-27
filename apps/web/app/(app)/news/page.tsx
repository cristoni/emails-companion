import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Check, Clock3, Undo2 } from "lucide-react";
import type { EmailSpostataDalleNewsDto, VistaNewsDto } from "@ec/applicazione";
import { spostateFuoriDalleNews, vistaRiepilogoNews } from "@ec/applicazione";
import type { Indirizzo } from "@ec/core/dominio";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { IntestazionePagina, StatoVuoto } from "@/components/ui/pagina";
import { Scheda } from "@/components/ui/scheda";
import { annullaSpostamentoAzione } from "@/components/home/azioni";
import { RiepilogoNews } from "@/components/home/riepilogo-news";
import { ModuloSpostaNews } from "./modulo-sposta";

/**
 * `/news` (§13): il Riepilogo News e gli originali delle News delle ultime 24 ore, ognuno con il link
 * all'email e "Sposta fuori dalle News". Le email spostate restano annullabili da qui per 24 ore.
 */
export default async function PaginaNews() {
  await richiediOnboardingEssenziale();
  const t = await getTranslations("news");
  const dati = await comeUtente(async (ctx, dip) => {
    const news = await vistaRiepilogoNews(dip, ctx);
    const spostate = await spostateFuoriDalleNews(dip, ctx);
    return { news, spostate };
  });

  return (
    <div className="space-y-10">
      <IntestazionePagina titolo={t("titolo")} descrizione={t("descrizione")} />
      <RiepilogoNews news={dati.news} />
      <ElencoNews membri={dati.news.membri} />
      <ElencoSpostate spostate={dati.spostate} />
    </div>
  );
}

function Mittente({ mittente }: { mittente: Indirizzo }) {
  const nome = mittente.nome?.trim();
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
      <TestoSemplice come="span" testo={nome || mittente.indirizzo} className="font-medium" />
      {nome ? <span className="min-w-0 truncate font-mono text-xs text-text-muted">{mittente.indirizzo}</span> : null}
    </p>
  );
}

function ElencoNews({ membri }: { membri: VistaNewsDto["membri"] }) {
  const t = useTranslations("news.elenco");
  return (
    <section aria-labelledby="news-elenco-titolo" className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="news-elenco-titolo" className="text-lg">
          {t("titolo")}
        </h2>
        <span className="text-sm tabular-nums text-text-muted">{t("conteggio", { numero: membri.length })}</span>
      </header>
      {membri.length === 0 ? (
        <StatoVuoto titolo={t("vuoto")}>{t("vuotoAiuto")}</StatoVuoto>
      ) : (
        <Scheda>
          <ul className="divide-y divide-border">
            {membri.map((m) => (
              <li key={m.emailId} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Mittente mittente={m.mittente} />
                    <h3 id={`news-oggetto-${m.emailId}`} className="text-[15px] font-medium leading-snug">
                      <LinkEmail emailId={m.emailId} className="underline-offset-4 hover:text-accent-strong hover:underline">
                        <TestoSemplice come="span" testo={m.oggetto.trim() || t("senzaOggetto")} />
                      </LinkEmail>
                    </h3>
                    {m.anteprima ? <TestoSemplice testo={m.anteprima} className="line-clamp-2 text-sm text-text-muted" /> : null}
                  </div>
                  {m.nelRiepilogo ? (
                    <Distintivo tono="accento" icona={<Check className="size-3" aria-hidden />}>
                      {t("nelRiepilogo")}
                    </Distintivo>
                  ) : (
                    <Distintivo tono="neutro" icona={<Clock3 className="size-3" aria-hidden />}>
                      {t("nonNelRiepilogo")}
                    </Distintivo>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <dl className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                    <div className="inline-flex gap-1">
                      <dt>{t("ricevuta")}</dt>
                      <dd>
                        <Istante iso={m.ricevutaIl} stile="data_ora" />
                      </dd>
                    </div>
                    {m.casella ? (
                      <div className="inline-flex min-w-0 gap-1">
                        <dt>{t("casella")}</dt>
                        <dd className="truncate font-mono">{m.casella}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <ModuloSpostaNews emailId={m.emailId} descrittoDa={`news-oggetto-${m.emailId}`} />
                </div>
              </li>
            ))}
          </ul>
        </Scheda>
      )}
    </section>
  );
}

function ElencoSpostate({ spostate }: { spostate: readonly EmailSpostataDalleNewsDto[] }) {
  const t = useTranslations("news.spostate");
  const te = useTranslations("news.elenco");
  const tc = useTranslations("comuni");
  if (spostate.length === 0) return null;
  return (
    <section aria-labelledby="news-spostate-titolo" className="space-y-4">
      <header className="space-y-1">
        <h2 id="news-spostate-titolo" className="text-lg">
          {t("titolo")}
        </h2>
        <p className="text-sm text-text-muted">{t("descrizione")}</p>
      </header>
      <Scheda>
        <ul className="divide-y divide-border">
          {spostate.map((s) => (
            <li key={s.emailId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
              <div className="min-w-0 flex-1 space-y-1">
                <Mittente mittente={s.mittente} />
                <LinkEmail emailId={s.emailId} className="block text-sm font-medium underline-offset-4 hover:text-accent-strong hover:underline">
                  <TestoSemplice come="span" testo={s.oggetto.trim() || te("senzaOggetto")} />
                </LinkEmail>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                  <span>{t("categoria", { categoria: testoCodice(tc, "categorie", s.categoria) })}</span>
                  <span>
                    {t("spostataIl")} <Istante iso={s.spostataIl} stile="relativo" />
                  </span>
                </p>
              </div>
              <ModuloAzione
                azione={annullaSpostamentoAzione}
                campi={{ email: s.emailId }}
                etichetta={
                  <>
                    <Undo2 className="size-3.5" aria-hidden />
                    {t("annulla")}{" "}
                    {/* Il nome accessibile distingue i pulsanti "Annulla" delle diverse email. */}
                    <TestoSemplice come="span" testo={s.oggetto.trim() || te("senzaOggetto")} className="sr-only" />
                  </>
                }
                mostraOk
                messaggi={{ ok: t("annullata") }}
              />
            </li>
          ))}
        </ul>
      </Scheda>
    </section>
  );
}
