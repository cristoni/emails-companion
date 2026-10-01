import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Circle, Clock, Hourglass, Sparkles } from "lucide-react";
import type { AttesaDto, CollegamentoDto, RispostaDto } from "@ec/applicazione";
import { VALUTAZIONI } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import { DistintivoBase, DistintivoProposta } from "@/components/comuni/distintivi";
import { ElencoEvidenze, LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { cn } from "@/components/ui/cn";
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
import { ancora, AzioniScheda, CorrezioniElemento, ElencoSchede, Indirizzi, LinkPerche, linguaDi, PulsanteAnnulla, Sezione, type ContestoDettaglio } from "./comuni";
import { correzioniDellaConferma } from "./correzioni-collegate";

const aperta = (a: AttesaDto) => (a.stato === "aperta" || a.stato === "parziale") && (a.ciclo === "proposta" || a.ciclo === "confermata");

/** Attese della Situazione con le Risposte arrivate: le aperte in vista, le soddisfatte, annullate o scartate raccolte a parte. */
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
  const scheda = (a: AttesaDto) => <SchedaAttesa key={a.id} attesa={a} collegamenti={collegamenti} contesto={contesto} />;
  return (
    <Sezione id="attese" titolo={t("titolo")} conteggio={attese.filter(aperta).length || attese.length}>
      <ElencoSchede aperte={attese.filter(aperta).map(scheda)} chiuse={attese.filter((a) => !aperta(a)).map(scheda)} />
    </Sezione>
  );
}

/** Stato dell'Attesa solo quando non è quello normale ("aperta"); "Soddisfatta" è blu con la spunta. */
function StatoAttesa({ attesa }: { attesa: AttesaDto }) {
  const tc = useTranslations("comuni");
  if (attesa.ciclo === "scartata" || attesa.ciclo === "superata") {
    return <Distintivo tono="neutro">{testoCodice(tc, "statiElemento", attesa.ciclo)}</Distintivo>;
  }
  if (attesa.stato === "aperta") return null;
  return (
    <Distintivo
      tono={attesa.stato === "soddisfatta" ? "accento" : attesa.stato === "parziale" ? "risposta" : "neutro"}
      icona={attesa.stato === "soddisfatta" ? <CheckCircle2 className="size-3" aria-hidden /> : attesa.stato === "parziale" ? <Hourglass className="size-3" aria-hidden /> : undefined}
    >
      {testoCodice(tc, "statiAttesa", attesa.stato)}
    </Distintivo>
  );
}

function SchedaAttesa({ attesa: a, collegamenti, contesto }: { attesa: AttesaDto; collegamenti: readonly CollegamentoDto[]; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.attese");
  const lingua = linguaDi(contesto, a.emailRichiestaId);
  const inCorso = aperta(a);
  const scartabile = a.ciclo === "proposta" || a.ciclo === "confermata";
  const requisiti = new Map(a.requisiti.map((q) => [q.id, q.descrizione]));
  // Un solo requisito uguale all'oggetto ripeterebbe il titolo: l'elenco serve quando aggiunge qualcosa.
  const elencoRequisiti = a.requisiti.length > 1 || (a.requisiti.length === 1 && a.requisiti[0]!.descrizione.trim() !== a.oggetto.trim());

  return (
    <li
      id={ancora.attesa(a.id)}
      className={cn(
        "scroll-mt-6 rounded-[var(--radius-card)] border bg-surface-raised p-4 shadow-[var(--shadow-card)] target:ring-2 target:ring-accent/40",
        a.proposta ? "border-dashed border-border-strong" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {a.proposta ? <DistintivoProposta /> : null}
        <StatoAttesa attesa={a} />
        <DistintivoBase base={a.base} />
        {a.sollecitoConsigliato ? (
          <span title={t("sollecitoAiuto")}>
            <Distintivo tono="urgente" icona={<Clock className="size-3" aria-hidden />}>
              {t("sollecitoConsigliato")}
            </Distintivo>
          </span>
        ) : null}
        <LinkPerche analisiId={a.analisiId} contesto={contesto} />
      </div>

      <h3 className="mt-2 text-[15px] leading-relaxed font-medium tracking-normal">
        <TestoSemplice come="span" testo={a.oggetto} lingua={lingua} />
      </h3>

      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
        {a.destinatari.length > 0 ? (
          <span>
            {t("da")} <Indirizzi indirizzi={a.destinatari} className="text-text" />
          </span>
        ) : null}
        {a.dataAttesa ? (
          <span>
            {t("attesaEntro")} <Istante iso={a.dataAttesa} stile="giorno" className="font-medium text-text" />
          </span>
        ) : null}
        <LinkEmail emailId={a.emailRichiestaId}>{t("apriRichiesta")}</LinkEmail>
      </p>

      {a.chiusaDa === "ai" && a.rispostaDiChiusura ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border-strong bg-suggestion-soft px-3 py-2 text-sm">
          <div className="space-y-0.5">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <Sparkles className="size-3.5 text-suggestion" aria-hidden />
              <span className="font-medium">{t("chiusaDaAi")}</span>
              <DistintivoBase base="dedotto" />
              <a href={`#${ancora.risposta(a.rispostaDiChiusura)}`} className="text-accent-strong underline-offset-4 hover:underline">
                {t("vaiAllaRisposta")}
              </a>
            </p>
            <p className="text-xs text-text-muted">{t("chiusaDaAiAiuto")}</p>
          </div>
          <ModuloAzione azione={correggiValutazioneAzione} campi={{ risposta: a.rispostaDiChiusura, valutazione: "non_pertinente" }} etichetta={t("riapri")} />
        </div>
      ) : a.chiusaDa === "utente" ? (
        <ChiusaDallUtente attesa={a} />
      ) : null}

      {elencoRequisiti ? (
        <div className="mt-3 space-y-1">
          <h4 className="text-xs font-medium text-text-muted">{t("requisiti")}</h4>
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
                  <span className="sr-only"> · {q.soddisfatto ? t("ricevuto") : t("nonAncora")}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {a.daVerificare.length > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-urgent/30 bg-urgent-soft px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-urgent" aria-hidden />
          <p className="flex flex-wrap gap-x-2">
            <span>{t("daVerificare")}</span>
            {a.daVerificare.map((id) => {
              const risposta = a.risposte.find((r) => r.id === id);
              const mittente = risposta ? contesto.fonti.get(risposta.emailId)?.mittente : undefined;
              return (
                <a key={id} href={`#${ancora.risposta(id)}`} className="text-accent-strong underline-offset-4 hover:underline">
                  {mittente ? mittente.nome || mittente.indirizzo : t("rispostaNumero", { numero: a.risposte.findIndex((r) => r.id === id) + 1 })}
                </a>
              );
            })}
          </p>
        </div>
      ) : null}

      {a.evidenze.length > 0 ? <ElencoEvidenze evidenze={a.evidenze} className="mt-3 space-y-2" /> : null}

      {/* Risposte in un elenco piatto dentro la scheda, separate da una riga: nessuna scheda nella scheda. */}
      {a.risposte.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-medium text-text-muted">{t("risposte")}</h4>
          <ul>
            {a.risposte.map((r) => (
              <SchedaRisposta key={r.id} risposta={r} attesa={a} requisiti={requisiti} extra={correzioniDellaConferma(collegamenti, r)} contesto={contesto} />
            ))}
          </ul>
        </div>
      ) : null}

      <AzioniScheda
        fare={
          a.proposta || inCorso ? (
            <>
              {/* Il pulsante principale della pagina è nella scheda "Prossima azione": qui tutti secondari. */}
              {a.proposta ? <ModuloAzione azione={confermaElementoAzione} campi={{ tipo: "attesa", id: a.id }} etichetta={t("conferma")} /> : null}
              {inCorso ? (
                <>
                  <PulsanteProponiSollecito attesaId={a.id} bozzaId={contesto.bozzeSollecito.get(a.id)} consigliato={false} />
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
            </>
          ) : undefined
        }
        correggere={
          scartabile ? (
            <ModuloAzione
              azione={scartaElementoAzione}
              campi={{ tipo: "attesa", id: a.id }}
              etichetta={t("scarta")}
              conferma={{ domanda: t("scartaDomanda"), etichetta: t("scartaConferma") }}
            />
          ) : undefined
        }
      />
      {a.correzioni.length > 0 ? (
        <div className="mt-3">
          <CorrezioniElemento correzioni={a.correzioni} />
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
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-text-muted">
        <CheckCircle2 className="size-4 text-accent-strong" aria-hidden />
        {testo}
        {a.rispostaDiChiusura ? (
          <a href={`#${ancora.risposta(a.rispostaDiChiusura)}`} className="text-accent-strong underline-offset-4 hover:underline">
            {t("vaiAllaRisposta")}
          </a>
        ) : null}
      </p>
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
  const nuova = r.revisione === "da_vedere" && !rifiutata;

  return (
    <li id={ancora.risposta(r.id)} className={cn("mt-3 scroll-mt-6 border-t border-border pt-3 first:mt-2 first:border-t-0 first:pt-0 target:rounded-lg target:ring-2 target:ring-accent/40", rifiutata && "opacity-75")}>
      {/* Una risposta proposta dall'AI ha una riga tratteggiata a sinistra, come le altre proposte. */}
      <div className={cn(r.proposta && "border-l-2 border-dashed border-border-strong pl-3")}>
        <div className="flex flex-wrap items-center gap-2">
          {r.proposta ? <DistintivoProposta /> : null}
          {rifiutata ? <Distintivo tono="pericolo">{testoCodice(tc, "statiCollegamento", r.statoCollegamento)}</Distintivo> : null}
          <Distintivo tono="risposta">{testoCodice(tc, "valutazioni", r.valutazione)}</Distintivo>
          {nuova ? (
            <Distintivo tono="accento" icona={<span aria-hidden className="size-1.5 rounded-full bg-accent" />}>
              {t("nuova")}
            </Distintivo>
          ) : null}
          {daVerificare ? (
            <Distintivo tono="urgente" icona={<AlertTriangle className="size-3" aria-hidden />}>
              {t("daVerificare")}
            </Distintivo>
          ) : null}
          <LinkPerche analisiId={r.analisiId} contesto={contesto} />
        </div>

        {fonte ? <TestoSemplice come="p" testo={fonte.oggetto} lingua={lingua} className="mt-2 text-sm font-medium" /> : null}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          {fonte ? <Indirizzi indirizzi={[fonte.mittente]} className="text-text" /> : null}
          <Istante iso={r.arrivataIl} stile="data_ora" />
          <span>{testoCodice(tc, "originiCollegamento", r.origine)}</span>
          {r.confidenza !== null ? (
            <span>
              {t("confidenza")} {formato.number(r.confidenza, { style: "percent", maximumFractionDigits: 0 })}
            </span>
          ) : null}
          {r.valutazione !== r.valutazioneAi ? (
            <span>
              {t("valutazioneAi")} {testoCodice(tc, "valutazioni", r.valutazioneAi)}
            </span>
          ) : null}
          <LinkEmail emailId={r.emailId} />
        </p>

        {r.motivazione ? (
          <p className="mt-2 flex items-start gap-1.5 text-sm">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-suggestion" aria-hidden />
            <span className="sr-only">{t("motivazione")}: </span>
            <TestoSemplice come="span" testo={r.motivazione} lingua={lingua} />
          </p>
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

        {!rifiutata ? (
          <AzioniScheda
            fare={
              r.proposta || nuova ? (
                <>
                  {r.proposta ? <ModuloAzione azione={confermaElementoAzione} campi={{ tipo: "risposta", id: r.id }} etichetta={t("conferma")} /> : null}
                  {nuova ? <ModuloAzione azione={segnaRispostaVistaAzione} campi={{ risposta: r.id }} etichetta={t("segnaVista")} /> : null}
                </>
              ) : undefined
            }
            correggere={
              <>
                {VALUTAZIONI.filter((v) => v !== r.valutazione).map((v) => (
                  <ModuloAzione key={v} azione={correggiValutazioneAzione} campi={{ risposta: r.id, valutazione: v }} etichetta={t(`valuta.${v}`)} />
                ))}
                <ModuloAzione
                  azione={rifiutaRispostaAzione}
                  campi={{ risposta: r.id }}
                  etichetta={t("rifiuta")}
                  conferma={{ domanda: t("rifiutaDomanda"), etichetta: t("rifiutaConferma") }}
                />
              </>
            }
          />
        ) : null}
        {r.correzioni.length > 0 ? (
          <div className="mt-2">
            <CorrezioniElemento correzioni={r.correzioni} extra={extra} />
          </div>
        ) : null}
      </div>
    </li>
  );
}
