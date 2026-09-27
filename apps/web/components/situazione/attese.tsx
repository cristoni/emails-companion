import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Circle, Hourglass, Sparkles } from "lucide-react";
import type { AttesaDto, CollegamentoDto, RispostaDto } from "@ec/applicazione";
import { VALUTAZIONI } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import { DistintivoBase, DistintivoProposta } from "@/components/comuni/distintivi";
import { ElencoEvidenze, LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { StatoVuoto } from "@/components/ui/pagina";
import { PulsanteProponiSollecito } from "@/components/bozze/pulsanti-proposta";
import {
  annullaAttesaAzione,
  confermaElementoAzione,
  correggiValutazioneAzione,
  rifiutaRispostaAzione,
  scartaElementoAzione,
  segnaAttesaSoddisfattaAzione,
  segnaRispostaVistaAzione,
} from "@/app/(app)/situations/[id]/azioni";
import { ancora, CorrezioniElemento, formattaIndirizzo, LinkPerche, linguaDi, Metadato, PulsanteAnnulla, Sezione, type ContestoDettaglio } from "./comuni";
import { correzioniDellaConferma } from "./correzioni-collegate";

const aperta = (a: AttesaDto) => (a.stato === "aperta" || a.stato === "parziale") && (a.ciclo === "proposta" || a.ciclo === "confermata");

/** Attese della Situazione con le Risposte arrivate: aperte prima, poi soddisfatte, annullate o scartate. */
export function SezioneAttese({
  attese,
  collegamenti,
  contesto,
}: {
  attese: readonly AttesaDto[];
  collegamenti: readonly CollegamentoDto[];
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.attese");
  const ordinate = [...attese.filter(aperta), ...attese.filter((a) => !aperta(a))];
  return (
    <Sezione id="attese" titolo={t("titolo")} descrizione={t("descrizione")} conteggio={attese.length}>
      {ordinate.length === 0 ? (
        <StatoVuoto titolo={t("vuoto")} />
      ) : (
        <ul className="space-y-3">
          {ordinate.map((a) => (
            <SchedaAttesa key={a.id} attesa={a} collegamenti={collegamenti} contesto={contesto} />
          ))}
        </ul>
      )}
    </Sezione>
  );
}

function StatoAttesa({ attesa }: { attesa: AttesaDto }) {
  const tc = useTranslations("comuni");
  if (attesa.ciclo === "scartata" || attesa.ciclo === "superata") {
    return <Distintivo tono="neutro">{testoCodice(tc, "statiElemento", attesa.ciclo)}</Distintivo>;
  }
  const icona =
    attesa.stato === "soddisfatta" ? (
      <CheckCircle2 className="size-3" aria-hidden />
    ) : attesa.stato === "aperta" || attesa.stato === "parziale" ? (
      <Hourglass className="size-3" aria-hidden />
    ) : undefined;
  return (
    <Distintivo tono={attesa.stato === "soddisfatta" ? "accento" : attesa.stato === "parziale" ? "risposta" : "neutro"} icona={icona}>
      {testoCodice(tc, "statiAttesa", attesa.stato)}
    </Distintivo>
  );
}

function SchedaAttesa({ attesa: a, collegamenti, contesto }: { attesa: AttesaDto; collegamenti: readonly CollegamentoDto[]; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.attese");
  const tc = useTranslations("comuni");
  const lingua = linguaDi(contesto, a.emailRichiestaId);
  const inCorso = aperta(a);
  const scartabile = a.ciclo === "proposta" || a.ciclo === "confermata";
  const requisiti = new Map(a.requisiti.map((q) => [q.id, q.descrizione]));

  return (
    <li
      id={ancora.attesa(a.id)}
      className={`scroll-mt-6 rounded-[var(--radius-card)] border bg-surface-raised p-4 shadow-[var(--shadow-card)] target:ring-2 target:ring-accent/40 ${
        a.proposta ? "border-dashed border-border-strong" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {a.proposta ? <DistintivoProposta /> : null}
        <StatoAttesa attesa={a} />
        <DistintivoBase base={a.base} />
        {a.sollecitoConsigliato ? <Distintivo tono="urgente">{t("sollecitoConsigliato")}</Distintivo> : null}
        <LinkPerche analisiId={a.analisiId} contesto={contesto} />
      </div>

      <h3 className="mt-2.5 text-[15px] font-medium leading-relaxed tracking-normal">
        <TestoSemplice come="span" testo={a.oggetto} lingua={lingua} />
      </h3>

      <dl className="mt-2 space-y-1">
        {a.destinatari.length > 0 ? (
          <Metadato etichetta={t("da")}>
            <span className="break-all font-mono text-xs">{a.destinatari.map(formattaIndirizzo).join(", ")}</span>
          </Metadato>
        ) : null}
        <Metadato etichetta={t("attesaEntro")}>{a.dataAttesa ? <Istante iso={a.dataAttesa} stile="giorno" /> : <span className="text-text-muted">{t("senzaData")}</span>}</Metadato>
        <Metadato etichetta={t("richiesta")}>
          <LinkEmail emailId={a.emailRichiestaId}>{t("apriRichiesta")}</LinkEmail>
        </Metadato>
      </dl>

      {a.chiusaDa === "ai" && a.rispostaDiChiusura ? (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-dashed border-border-strong bg-suggestion-soft px-3 py-2.5 text-sm">
          <div className="space-y-1">
            <p className="flex flex-wrap items-center gap-1.5 font-medium">
              <Sparkles className="size-3.5 text-suggestion" aria-hidden />
              {t("chiusaDaAi")}
              <DistintivoBase base="dedotto" />
            </p>
            <p className="text-text-muted">{t("chiusaDaAiAiuto")}</p>
            <a href={`#${ancora.risposta(a.rispostaDiChiusura)}`} className="text-accent-strong underline-offset-4 hover:underline">
              {t("vaiAllaRisposta")}
            </a>
          </div>
          <ModuloAzione
            azione={correggiValutazioneAzione}
            campi={{ risposta: a.rispostaDiChiusura, valutazione: "non_pertinente" }}
            etichetta={t("riapri")}
          />
        </div>
      ) : a.chiusaDa === "utente" ? (
        <ChiusaDallUtente attesa={a} />
      ) : null}

      {a.requisiti.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">{t("requisiti")}</h4>
          <ul className="space-y-1">
            {a.requisiti.map((q) => (
              <li key={q.id} className="flex items-start gap-2 text-sm">
                {q.soddisfatto ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
                )}
                <span className="min-w-0">
                  <TestoSemplice come="span" testo={q.descrizione} lingua={lingua} />
                  <span className="text-text-muted"> · {q.soddisfatto ? t("ricevuto") : t("nonAncora")}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {a.daVerificare.length > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-urgent/30 bg-urgent-soft px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-urgent" aria-hidden />
          <div className="space-y-1">
            <p>{t("daVerificare")}</p>
            <ul className="flex flex-wrap gap-x-3">
              {a.daVerificare.map((id) => {
                const risposta = a.risposte.find((r) => r.id === id);
                const mittente = risposta ? contesto.fonti.get(risposta.emailId)?.mittente : undefined;
                return (
                  <li key={id}>
                    <a href={`#${ancora.risposta(id)}`} className="text-accent-strong underline-offset-4 hover:underline">
                      {mittente ? formattaIndirizzo(mittente) : t("rispostaNumero", { numero: a.risposte.findIndex((r) => r.id === id) + 1 })}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <ElencoEvidenze evidenze={a.evidenze} />
      </div>

      {inCorso ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <PulsanteProponiSollecito attesaId={a.id} consigliato={a.sollecitoConsigliato} />
          {a.sollecitoConsigliato ? <p className="text-xs text-text-muted">{t("sollecitoAiuto")}</p> : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {a.proposta ? (
          <ModuloAzione azione={confermaElementoAzione} campi={{ tipo: "attesa", id: a.id }} etichetta={tc("azioni.conferma")} variante="primario" />
        ) : null}
        {inCorso ? (
          <>
            <ModuloAzione azione={segnaAttesaSoddisfattaAzione} campi={{ attesa: a.id }} etichetta={t("segnaSoddisfatta")} />
            <ModuloAzione
              azione={annullaAttesaAzione}
              campi={{ attesa: a.id }}
              etichetta={t("annulla")}
              variante="fantasma"
              conferma={{ domanda: t("annullaDomanda"), etichetta: t("annullaConferma") }}
            />
          </>
        ) : null}
        {scartabile ? (
          <ModuloAzione
            azione={scartaElementoAzione}
            campi={{ tipo: "attesa", id: a.id }}
            etichetta={t("scarta")}
            variante="fantasma"
            conferma={{ domanda: t("scartaDomanda"), etichetta: t("scartaConferma") }}
          />
        ) : null}
      </div>
      {a.correzioni.length > 0 ? (
        <div className="mt-3">
          <CorrezioniElemento correzioni={a.correzioni} />
        </div>
      ) : null}

      {a.risposte.length > 0 ? (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-semibold">{t("risposte")}</h4>
          <ul className="space-y-2">
            {a.risposte.map((r) => (
              <SchedaRisposta key={r.id} risposta={r} attesa={a} requisiti={requisiti} extra={correzioniDellaConferma(collegamenti, r)} contesto={contesto} />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Attesa chiusa dall'utente, con la riapertura diretta. Due casi:
 * - decisione sull'Attesa (annullata o segnata come soddisfatta, nessuna risposta di chiusura): si annullano
 *   le sue correzioni del campo `stato`, non quelle del ciclo (annullare la conferma la renderebbe una proposta);
 * - risposte che l'utente ha valutato complete: si annullano quelle valutazioni e resta il giudizio dell'AI,
 *   che da solo non la chiude (altrimenti `chiusaDa` sarebbe "ai").
 */
function ChiusaDallUtente({ attesa: a }: { attesa: AttesaDto }) {
  const t = useTranslations("situazione.attese");
  const decisione = a.rispostaDiChiusura === null;
  const daAnnullare = decisione
    ? a.correzioni.filter((c) => c.campo === "stato").map((c) => c.id)
    : a.risposte
        .filter((r) => r.statoCollegamento !== "rifiutato")
        .flatMap((r) => r.correzioni.filter((c) => c.campo === "valutazione" && c.valore === "completa").map((c) => c.id));
  const testo = !decisione ? t("chiusaDaTeRisposta") : a.stato === "annullata" ? t("chiusaDaTeAnnullata") : t("chiusaDaTeSoddisfatta");
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm">
      <div className="space-y-1">
        <p className="inline-flex items-center gap-1.5 text-text-muted">
          <CheckCircle2 className="size-4 text-accent-strong" aria-hidden />
          {testo}
        </p>
        {a.rispostaDiChiusura ? (
          <p>
            <a href={`#${ancora.risposta(a.rispostaDiChiusura)}`} className="text-accent-strong underline-offset-4 hover:underline">
              {t("vaiAllaRisposta")}
            </a>
          </p>
        ) : null}
      </div>
      <PulsanteAnnulla correzioni={daAnnullare} etichetta={t("riapri")} />
    </div>
  );
}

function SchedaRisposta({
  risposta: r,
  attesa,
  requisiti,
  extra,
  contesto,
}: {
  risposta: RispostaDto;
  attesa: AttesaDto;
  requisiti: ReadonlyMap<string, string>;
  /** Correzioni da annullare insieme a quelle della risposta (il collegamento confermato con lei). */
  extra: Record<string, string[]>;
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.risposte");
  const tc = useTranslations("comuni");
  const formato = useFormatter();
  const lingua = linguaDi(contesto, r.emailId);
  const linguaRichiesta = linguaDi(contesto, attesa.emailRichiestaId);
  const fonte = contesto.fonti.get(r.emailId);
  const rifiutata = r.statoCollegamento === "rifiutato";
  const daVerificare = attesa.daVerificare.includes(r.id);

  return (
    <li
      id={ancora.risposta(r.id)}
      className={`scroll-mt-6 rounded-lg border px-3 py-3 target:ring-2 target:ring-accent/40 ${
        r.proposta ? "border-dashed border-border-strong bg-surface" : "border-border bg-surface-muted"
      } ${rifiutata ? "opacity-75" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {r.proposta ? <DistintivoProposta /> : null}
        {rifiutata ? <Distintivo tono="pericolo">{testoCodice(tc, "statiCollegamento", r.statoCollegamento)}</Distintivo> : null}
        <Distintivo tono="risposta">{testoCodice(tc, "valutazioni", r.valutazione)}</Distintivo>
        {r.revisione === "da_vedere" && !rifiutata ? <Distintivo tono="accento">{t("nuova")}</Distintivo> : null}
        {attesa.rispostaDiChiusura === r.id ? <Distintivo tono="neutro">{t("haChiuso")}</Distintivo> : null}
        {daVerificare ? (
          <Distintivo tono="urgente" icona={<AlertTriangle className="size-3" aria-hidden />}>
            {t("daVerificare")}
          </Distintivo>
        ) : null}
        <LinkPerche analisiId={r.analisiId} contesto={contesto} />
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        {fonte ? <span className="font-mono text-xs">{formattaIndirizzo(fonte.mittente)}</span> : null}
        <Istante iso={r.arrivataIl} stile="data_ora" className="text-xs text-text-muted" />
        <LinkEmail emailId={r.emailId} className="text-xs text-accent-strong underline-offset-4 hover:underline" />
      </div>
      {fonte ? <TestoSemplice come="p" testo={fonte.oggetto} lingua={lingua} className="mt-1 text-sm font-medium" /> : null}

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {r.valutazione !== r.valutazioneAi ? (
          <Metadato etichetta={t("valutazioneAi")}>{testoCodice(tc, "valutazioni", r.valutazioneAi)}</Metadato>
        ) : null}
        {r.confidenza !== null ? (
          <Metadato etichetta={t("confidenza")}>{formato.number(r.confidenza, { style: "percent", maximumFractionDigits: 0 })}</Metadato>
        ) : null}
        <Metadato etichetta={t("collegata")}>{testoCodice(tc, "originiCollegamento", r.origine)}</Metadato>
      </dl>

      {r.motivazione ? (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-text-muted">{t("motivazione")}</p>
          <TestoSemplice come="p" testo={r.motivazione} lingua={lingua} className="text-sm" />
        </div>
      ) : null}

      {r.requisiti.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {r.requisiti.map((q) => (
            <li key={q.requisitoId} className="space-y-1">
              <p className="text-xs text-text-muted">
                {t("perRequisito")} <TestoSemplice come="span" testo={requisiti.get(q.requisitoId) ?? "—"} lingua={linguaRichiesta} className="text-text" />
              </p>
              {q.evidenze.length > 0 ? <ElencoEvidenze evidenze={q.evidenze} /> : <p className="text-xs text-text-muted">{t("senzaEvidenza")}</p>}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
        {r.proposta ? (
          <ModuloAzione azione={confermaElementoAzione} campi={{ tipo: "risposta", id: r.id }} etichetta={t("conferma")} variante="primario" />
        ) : null}
        {r.revisione === "da_vedere" && !rifiutata ? (
          <ModuloAzione azione={segnaRispostaVistaAzione} campi={{ risposta: r.id }} etichetta={t("segnaVista")} />
        ) : null}
        {!rifiutata ? (
          <>
            <span className="text-xs text-text-muted">{t("correggi")}</span>
            {VALUTAZIONI.filter((v) => v !== r.valutazione).map((v) => (
              <ModuloAzione key={v} azione={correggiValutazioneAzione} campi={{ risposta: r.id, valutazione: v }} etichetta={t(`valuta.${v}`)} variante="fantasma" />
            ))}
            <ModuloAzione
              azione={rifiutaRispostaAzione}
              campi={{ risposta: r.id }}
              etichetta={t("rifiuta")}
              variante="fantasma"
              conferma={{ domanda: t("rifiutaDomanda"), etichetta: t("rifiutaConferma") }}
            />
          </>
        ) : null}
      </div>
      {r.correzioni.length > 0 ? (
        <div className="mt-2">
          <CorrezioniElemento correzioni={r.correzioni} extra={extra} />
        </div>
      ) : null}
    </li>
  );
}
