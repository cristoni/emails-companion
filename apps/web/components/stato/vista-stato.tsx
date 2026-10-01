import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, CircleAlert, CirclePause, Hourglass } from "lucide-react";
import type { VistaStatoDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { Espandibile } from "@/components/ui/espandibile";
import { IntestazionePagina, StatoVuoto } from "@/components/ui/pagina";
import { Scheda } from "@/components/ui/scheda";
import { cn } from "@/components/ui/cn";
import { AREA_TOCCO, CLASSE_LINK, CLASSE_LINK_AZIONE } from "./classi";
import { casellaDaControllare, SchedaCasellaStato } from "./scheda-casella";
import { nomeFunzione, SEZIONE_MOTIVO_PAUSA, testoErrore } from "./testi";

type Pausa = VistaStatoDto["pause"][number];
type Problema = { ancora: string; testo: string };

/**
 * Contenuto di `/status`: un verdetto in cima (tutto bene, oppure l'elenco dei problemi con il link alla
 * sezione), le caselle, l'analisi AI solo se c'è qualcosa da dire (email in coda, in pausa o in errore, pause,
 * aggiornamenti che non riescono), gli errori recenti solo se ci sono. Si mostrano le eccezioni, non gli stati
 * normali: "tutto bene" lo dice una volta sola il verdetto. Ogni codice è tradotto, mai mostrato grezzo.
 */
export function VistaStato({ vista, pause }: { vista: VistaStatoDto; pause: readonly Pausa[] }) {
  const t = useTranslations("stato");
  const formato = useFormatter();
  const ora = new Date(vista.ora);

  // `elaborazione` è null quando non è mai stato registrato un errore: vuol dire "nessun problema", non "mai eseguita".
  const elaborazione = [
    { chiave: "riconciliazione", errori: vista.elaborazione?.riconciliazioneErrori ?? 0, codice: vista.elaborazione?.riconciliazioneErrore ?? null },
    { chiave: "news", errori: vista.elaborazione?.newsErrori ?? 0, codice: vista.elaborazione?.newsErrore ?? null },
  ] as const;
  const elaborazioneInErrore = elaborazione.some((e) => e.errori > 0 || e.codice !== null);
  const caselleDaControllare = vista.caselle.filter(casellaDaControllare).length;
  const senzaCaselle = vista.caselle.length === 0;
  // Una pausa su "*" ferma tutta l'analisi; le altre fermano solo alcune Funzioni AI (per esempio le bozze).
  const pausaGlobale = pause.some((p) => p.funzione === "*");
  const funzioniInPausa = new Set(pause.map((p) => p.funzione)).size;

  // Le condizioni vengono dai dati, non dal verdetto: nessuna sezione con contenuto resta nascosta. Gli errori
  // recenti non contano: sono lo storico delle chiamate fallite, anche di quelle poi riuscite al nuovo
  // tentativo; quelli ancora aperti sono già nelle email non analizzate, nelle pause e negli aggiornamenti.
  const problemi: Problema[] = [];
  if (senzaCaselle) problemi.push({ ancora: "status-caselle", testo: t("sintesi.nessunaCasella") });
  if (caselleDaControllare > 0) problemi.push({ ancora: "status-caselle", testo: t("sintesi.caselle", { numero: caselleDaControllare }) });
  if (pause.length > 0) problemi.push({ ancora: "status-pause", testo: pausaGlobale ? t("sintesi.pausa") : t("sintesi.pausaFunzioni", { numero: funzioniInPausa }) });
  if (vista.analisi.errore > 0) problemi.push({ ancora: "status-analisi", testo: t("sintesi.analisiErrore", { numero: vista.analisi.errore }) });
  if (elaborazioneInErrore) problemi.push({ ancora: "status-aggiornamenti", testo: t("sintesi.aggiornamenti") });

  // L'analisi AI compare solo con un'eccezione: email in coda, in pausa o in errore, pause, aggiornamenti in
  // errore. Le email in coda non sono un problema, ma sono un'informazione: per questo la condizione viene
  // dai dati e non dal verdetto.
  const contatoriNonNulli = vista.analisi.errore + vista.analisi.inPausa + vista.analisi.daEseguire > 0;
  const mostraAnalisi = contatoriNonNulli || pause.length > 0 || elaborazioneInErrore;

  return (
    <div>
      <IntestazionePagina
        titolo={t("titolo")}
        azioni={
          <p className="text-xs text-text-muted">
            {t("aggiornato")}{" "}
            <time dateTime={vista.ora} title={formato.dateTime(ora, { dateStyle: "full", timeStyle: "short" })}>
              {formato.dateTime(ora, { timeStyle: "short" })}
            </time>
          </p>
        }
      />

      <div className="space-y-8">
        <Verdetto problemi={problemi} />

        <section aria-labelledby="status-caselle" className="space-y-3">
          <header className="flex items-baseline justify-between gap-3">
            <h2 id="status-caselle" className="text-base">
              {t("caselle.titolo")}
            </h2>
            <Link href="/settings#mailboxes" className={cn("text-sm", CLASSE_LINK_AZIONE, AREA_TOCCO)}>
              {t("caselle.gestisci")}
            </Link>
          </header>
          {senzaCaselle ? (
            <StatoVuoto compatto titolo={t("caselle.nessuna")}>
              <Link href="/settings#mailboxes" className={CLASSE_LINK}>
                {t("caselle.nessunaTesto")}
              </Link>
            </StatoVuoto>
          ) : (
            <ul className="space-y-3">
              {vista.caselle.map((c) => (
                <SchedaCasellaStato key={c.casellaId} casella={c} />
              ))}
            </ul>
          )}
        </section>

        {mostraAnalisi ? (
          <section aria-labelledby="status-analisi" className="space-y-3">
            <h2 id="status-analisi" className="text-base">
              {t("analisi.titolo")}
            </h2>
            <Scheda className="divide-y divide-border">
              {contatoriNonNulli ? <Analisi analisi={vista.analisi} /> : null}
              {pause.length > 0 ? <Pause pause={pause} /> : null}
              {elaborazioneInErrore ? <AggiornamentiAutomatici elaborazione={elaborazione} /> : null}
            </Scheda>
          </section>
        ) : null}

        {vista.erroriRecenti.length > 0 ? <ErroriRecenti errori={vista.erroriRecenti} aperto={vista.analisi.errore > 0} /> : null}
      </div>
    </div>
  );
}

/** Verdetto: un riquadro blu con la spunta se va tutto bene, altrimenti i problemi con il link alla sezione. */
function Verdetto({ problemi }: { problemi: readonly Problema[] }) {
  const t = useTranslations("stato.sintesi");
  // Niente role="status": la pagina si ricarica ogni minuto e il verdetto non va riletto a ogni aggiornamento.
  if (problemi.length === 0) {
    return (
      <p className="flex items-center gap-2.5 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 text-sm font-medium">
        <CheckCircle2 className="size-4 shrink-0 text-accent-strong" aria-hidden />
        {t("ok")}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-urgent/30 bg-urgent-soft px-4 pt-3 pb-1.5 text-sm">
      <p className="flex items-center gap-2.5 font-medium">
        <AlertTriangle className="size-4 shrink-0 text-urgent" aria-hidden />
        {t("problemi", { numero: problemi.length })}
      </p>
      {/* Ogni link è alto 36px: le aree di tocco non si sovrappongono. */}
      <ul className="mt-0.5 pl-6.5">
        {problemi.map((p) => (
          <li key={`${p.ancora}-${p.testo}`}>
            <a href={`#${p.ancora}`} className="inline-flex min-h-9 items-center underline decoration-urgent/40 underline-offset-4 hover:decoration-current sm:min-h-8">
              {p.testo}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Email in coda, in pausa o in errore: solo i contatori non nulli (senza, la sezione non compare). */
function Analisi({ analisi }: { analisi: VistaStatoDto["analisi"] }) {
  const t = useTranslations("stato.analisi");
  const formato = useFormatter();
  const contatori = [
    { chiave: "errore", valore: analisi.errore, Icona: CircleAlert, tono: "text-danger" },
    { chiave: "inPausa", valore: analisi.inPausa, Icona: CirclePause, tono: "text-urgent" },
    { chiave: "daEseguire", valore: analisi.daEseguire, Icona: Hourglass, tono: "text-text-muted" },
  ] as const;
  const nonNulli = contatori.filter((c) => c.valore > 0);
  return (
    <dl className="divide-y divide-border">
      {nonNulli.map(({ chiave, valore, Icona, tono }) => (
        <div key={chiave} className="flex items-start gap-2.5 px-5 py-3.5">
          <Icona className={cn("mt-0.5 size-4 shrink-0", tono)} aria-hidden />
          <div className="min-w-0">
            <dt className="text-sm font-medium">
              <span className="tabular-nums">{formato.number(valore)}</span> {t(chiave, { numero: valore })}
            </dt>
            <dd className="text-xs text-text-muted">{t(`${chiave}Aiuto`, { numero: valore })}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/** Pause in vigore, con il motivo tradotto e il link alla sezione delle Impostazioni che le risolve. */
function Pause({ pause }: { pause: readonly Pausa[] }) {
  const t = useTranslations("stato.pause");
  const tc = useTranslations("comuni");
  const tr = useTranslations();
  return (
    <div className="px-5 py-4">
      <h3 id="status-pause" className="text-sm">
        {t("titolo")}
      </h3>
      <ul className="mt-2 divide-y divide-border">
        {pause.map((p) => (
          <li key={`${p.funzione}-${p.motivo}`} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 last:pb-0">
            <div className="flex min-w-0 items-start gap-2.5">
              <CirclePause className="mt-0.5 size-4 shrink-0 text-urgent" aria-hidden />
              <div className="min-w-0 text-sm">
                <p>{testoCodice(tc, "motiviPausa", p.motivo, "errori.sconosciuto")}</p>
                {p.funzione !== "*" || p.dal || p.prossimaVerifica ? (
                  <p className="text-xs text-text-muted">
                    {[
                      p.funzione !== "*" ? <span key="f">{nomeFunzione(tr, p.funzione)}</span> : null,
                      p.dal ? (
                        <span key="d">
                          {t("dal")} <Istante iso={p.dal} stile="data_ora" />
                        </span>
                      ) : null,
                      p.prossimaVerifica ? (
                        <span key="v">
                          {t("prossimaVerifica")} <Istante iso={p.prossimaVerifica} stile="relativo" />
                        </span>
                      ) : null,
                    ]
                      .filter(Boolean)
                      .flatMap((parte, i) => (i === 0 ? [parte] : [" · ", parte]))}
                  </p>
                ) : null}
              </div>
            </div>
            <Link href={`/settings#${SEZIONE_MOTIVO_PAUSA[p.motivo] ?? "preferences"}`} className={cn("ml-6.5 text-sm sm:ml-0", CLASSE_LINK_AZIONE, AREA_TOCCO)}>
              {p.motivo === "pausa_manuale" ? t("riprendi") : t("risolvi")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Elaborazione = { chiave: "riconciliazione" | "news"; errori: number; codice: string | null };

/**
 * Aggiornamento delle Situazioni e del Riepilogo News, solo quando non riesce: compare soltanto ciò che è in
 * errore, con il numero di errori di seguito e l'ultimo errore tradotto.
 */
function AggiornamentiAutomatici({ elaborazione }: { elaborazione: readonly Elaborazione[] }) {
  const t = useTranslations("stato.elaborazione");
  const tr = useTranslations();
  const inErrore = elaborazione.filter((e) => e.errori > 0 || e.codice !== null);
  return (
    <div id="status-aggiornamenti" className="px-5 py-3.5 text-sm">
      <h3 className="text-sm">{t("titolo")}</h3>
      <dl className="mt-2 space-y-2">
        {inErrore.map(({ chiave, errori, codice }) => (
          <div key={chiave} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
            <dt className="shrink-0 sm:w-60">{t(chiave)}</dt>
            <dd className="min-w-0">
              <span className="inline-flex items-start gap-1.5">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                <span>
                  {errori > 0 ? <span className="block">{t("errori", { numero: errori })}</span> : null}
                  {codice ? (
                    <span className="block text-xs text-text-muted">
                      {t("ultimoErrore")}: {testoErrore(tr, codice)}
                    </span>
                  ) : null}
                </span>
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Ultime chiamate AI fallite ed email rimaste in errore, con il link all'email quando c'è. Aperte solo se ci
 * sono email ancora non analizzate; altrimenti sono storico (errori poi ritentati) e restano chiuse, così non
 * contraddicono il verdetto.
 */
function ErroriRecenti({ errori, aperto }: { errori: VistaStatoDto["erroriRecenti"]; aperto: boolean }) {
  const t = useTranslations("stato.erroriRecenti");
  const tr = useTranslations();
  const elenco = (
    <Scheda>
      <ul className="divide-y divide-border text-sm">
        {errori.map((e, i) => (
          <li key={`${e.analisiId ?? e.emailId ?? "x"}-${e.funzione}-${i}`} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3">
            <div className="min-w-0">
              <p>{testoErrore(tr, e.codice)}</p>
              <p className="text-xs text-text-muted">
                {nomeFunzione(tr, e.funzione)} · <Istante iso={e.il} stile="relativo" />
              </p>
            </div>
            {e.emailId ? <LinkEmail emailId={e.emailId} className={cn("text-sm", CLASSE_LINK_AZIONE, AREA_TOCCO)} /> : null}
          </li>
        ))}
      </ul>
    </Scheda>
  );

  if (!aperto) {
    return (
      <section aria-labelledby="status-errori">
        <Espandibile
          titolo={
            // L'area sensibile (~36px) copre anche la freccia del riepilogo.
            <span id="status-errori" className="relative after:absolute after:-inset-y-2 after:-right-2 after:-left-6 after:content-['']">
              {t("storico")} <span className="tabular-nums">({errori.length})</span>
            </span>
          }
        >
          <p className="mb-2 text-xs text-text-muted">{t("descrizione")}</p>
          {elenco}
        </Espandibile>
      </section>
    );
  }
  return (
    <section aria-labelledby="status-errori" className="space-y-3">
      <header className="space-y-0.5">
        <h2 id="status-errori" className="text-base">
          {t("titolo")}
        </h2>
        <p className="text-sm text-text-muted">{t("descrizione")}</p>
      </header>
      {elenco}
    </section>
  );
}
