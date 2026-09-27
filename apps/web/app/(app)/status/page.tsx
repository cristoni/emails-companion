import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CircleAlert, CirclePause, Hourglass } from "lucide-react";
import { pauseEffettiveImpostazioni, vistaStato } from "@ec/applicazione";
import { comeUtente } from "@/lib/server/sessione";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { SchedaCasellaStato } from "@/components/stato/scheda-casella";
import { nomeFunzione, SEZIONE_MOTIVO_PAUSA, testoErrore } from "@/components/stato/testi";
import { IntestazionePagina, StatoVuoto } from "@/components/ui/pagina";
import { IntestazioneScheda, Scheda } from "@/components/ui/scheda";
import { cn } from "@/components/ui/cn";

/**
 * `/status`: per casella ritardo e ultima sincronizzazione, importazione ed errori; contatori dell'analisi,
 * pause in vigore con il motivo, errori recenti con il link all'email ed errori di riconciliazione e Riepilogo
 * News. Solo codici tradotti. Non chiama `richiediOnboardingEssenziale`: serve anche senza chiave o caselle.
 * Le pause arrivano da `pauseEffettiveImpostazioni`, che include anche chiave assente e informativa non
 * accettata: `vistaStato` riporta solo le pause registrate e la pausa manuale.
 */
export default async function PaginaStato() {
  const t = await getTranslations("stato");
  const tc = await getTranslations("comuni");
  const tr = await getTranslations();
  const formato = await getFormatter();
  const { vista, pause } = await comeUtente(async (ctx, dip) => ({
    vista: await vistaStato(dip, ctx),
    pause: await pauseEffettiveImpostazioni(dip, ctx),
  }));

  const contatori = [
    { chiave: "daEseguire", valore: vista.analisi.daEseguire, Icona: Hourglass, tono: "text-text" },
    { chiave: "inPausa", valore: vista.analisi.inPausa, Icona: CirclePause, tono: vista.analisi.inPausa > 0 ? "text-urgent" : "text-text" },
    { chiave: "errore", valore: vista.analisi.errore, Icona: CircleAlert, tono: vista.analisi.errore > 0 ? "text-danger" : "text-text" },
  ] as const;

  const elaborazione = [
    { chiave: "riconciliazione", errori: vista.elaborazione?.riconciliazioneErrori ?? 0, codice: vista.elaborazione?.riconciliazioneErrore ?? null },
    { chiave: "news", errori: vista.elaborazione?.newsErrori ?? 0, codice: vista.elaborazione?.newsErrore ?? null },
  ] as const;

  return (
    <div className="space-y-8">
      <IntestazionePagina
        titolo={t("titolo")}
        descrizione={t("descrizione")}
        azioni={
          <p className="text-xs text-text-muted">
            {t("aggiornato")} <Istante iso={vista.ora} stile="data_ora" />
          </p>
        }
      />

      <section aria-labelledby="status-caselle">
        <Scheda>
          <IntestazioneScheda titolo={<span id="status-caselle">{t("caselle.titolo")}</span>} />
          <div className="px-5 py-5">
            {vista.caselle.length === 0 ? (
              <StatoVuoto titolo={t("caselle.nessuna")}>
                <Link href="/settings#mailboxes" className="text-accent-strong underline-offset-4 hover:underline">
                  {t("caselle.nessunaTesto")}
                </Link>
              </StatoVuoto>
            ) : (
              <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {vista.caselle.map((c) => (
                  <SchedaCasellaStato key={c.casellaId} casella={c} />
                ))}
              </ul>
            )}
          </div>
        </Scheda>
      </section>

      <section aria-labelledby="status-analisi">
        <Scheda>
          <IntestazioneScheda titolo={<span id="status-analisi">{t("analisi.titolo")}</span>} descrizione={t("analisi.descrizione")} />
          <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {contatori.map(({ chiave, valore, Icona, tono }) => (
              <div key={chiave} className="flex flex-col-reverse gap-1 px-5 py-5">
                <dt className="flex items-center gap-1.5 text-sm text-text-muted">
                  <Icona className="size-4" aria-hidden />
                  {t(`analisi.${chiave}`)}
                </dt>
                <dd className={cn("text-3xl font-semibold tabular-nums tracking-tight", tono)}>
                  {formato.number(valore)} <span className="text-sm font-normal text-text-muted">{t("analisi.email", { numero: valore })}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Scheda>
      </section>

      <section aria-labelledby="status-pause">
        <Scheda>
          <IntestazioneScheda titolo={<span id="status-pause">{t("pause.titolo")}</span>} descrizione={pause.length > 0 ? t("pause.descrizione") : undefined} />
          <div className="px-5 py-5 text-sm">
            {pause.length === 0 ? (
              <p className="text-text-muted">{t("pause.nessuna")}</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {pause.map((p) => (
                  <li key={`${p.funzione}-${p.motivo}`} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{testoCodice(tc, "motiviPausa", p.motivo, "errori.sconosciuto")}</p>
                      <p className="text-xs text-text-muted">
                        {t("pause.funzione")}: {nomeFunzione(tr, p.funzione)}
                        {p.dal ? (
                          <>
                            {" · "}
                            {t("pause.dal")} <Istante iso={p.dal} stile="data_ora" />
                          </>
                        ) : null}
                        {p.prossimaVerifica ? (
                          <>
                            {" · "}
                            {t("pause.prossimaVerifica")} <Istante iso={p.prossimaVerifica} stile="data_ora" />
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Link href={`/settings#${SEZIONE_MOTIVO_PAUSA[p.motivo] ?? "preferences"}`} className="text-sm text-accent-strong underline-offset-4 hover:underline">
                      {p.motivo === "pausa_manuale" ? t("pause.riprendi") : t("pause.risolvi")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Scheda>
      </section>

      <section aria-labelledby="status-errori">
        <Scheda>
          <IntestazioneScheda titolo={<span id="status-errori">{t("erroriRecenti.titolo")}</span>} descrizione={t("erroriRecenti.descrizione")} />
          <div className="px-5 py-5 text-sm">
            {vista.erroriRecenti.length === 0 ? (
              <p className="text-text-muted">{t("erroriRecenti.nessuno")}</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {vista.erroriRecenti.map((e, i) => (
                  <li key={`${e.analisiId ?? e.emailId ?? "x"}-${e.funzione}-${i}`} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
                    <Istante iso={e.il} stile="data_ora" className="text-xs text-text-muted" />
                    <div className="min-w-0">
                      <p className="font-medium">{testoErrore(tr, e.codice)}</p>
                      <p className="text-xs text-text-muted">
                        {t("erroriRecenti.funzione")}: {nomeFunzione(tr, e.funzione)}
                      </p>
                    </div>
                    {e.emailId ? <LinkEmail emailId={e.emailId} className="text-sm text-accent-strong underline-offset-4 hover:underline" /> : <span className="text-xs text-text-muted">{t("erroriRecenti.senzaEmail")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Scheda>
      </section>

      <section aria-labelledby="status-elaborazione">
        <Scheda>
          <IntestazioneScheda titolo={<span id="status-elaborazione">{t("elaborazione.titolo")}</span>} />
          <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {elaborazione.map(({ chiave, errori, codice }) => (
              <div key={chiave} className="space-y-1.5 px-5 py-5 text-sm">
                <dt>
                  <span className="block font-medium">{t(`elaborazione.${chiave}`)}</span>
                  <span className="block text-xs text-text-muted">{t(`elaborazione.${chiave}Aiuto`)}</span>
                </dt>
                <dd>
                  {errori > 0 || codice ? (
                    <span className="flex items-start gap-1.5">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                      <span>
                        {errori > 0 ? <span className="block">{t("elaborazione.errori", { numero: errori })}</span> : null}
                        {codice ? (
                          <span className="block text-text-muted">
                            {t("elaborazione.ultimoErrore")}: {testoErrore(tr, codice)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  ) : (
                    <span className="text-text-muted">{vista.elaborazione ? t("elaborazione.nessunErrore") : t("elaborazione.nonAvviata")}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Scheda>
      </section>
    </div>
  );
}
