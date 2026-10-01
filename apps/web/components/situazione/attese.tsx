import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Circle, Clock, Hourglass, Sparkles } from "lucide-react";
import type { AttesaDto, CollegamentoDto, RispostaDto } from "@ec/applicazione";
import { VALUTAZIONI } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import { DistintivoBase } from "@/components/comuni/distintivi";
import { ElencoEvidenze, LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { cn } from "@/components/ui/cn";
import { CLASSE_LINK } from "@/components/ui/collegamento";
import { PulsanteProponiSollecito } from "@/components/bozze/pulsanti-proposta";
import {
  annullaAttesaAzione,
  correggiValutazioneAzione,
  rifiutaRispostaAzione,
  scartaElementoAzione,
  segnaAttesaSoddisfattaAzione,
  segnaRispostaVistaAzione,
} from "@/app/(app)/situations/[id]/azioni";
import { ancora, AzioniScheda, CorrezioniElemento, ElencoSchede, Indirizzi, LinkPerche, linguaDi, PulsanteAnnulla, Sezione, type ContestoDettaglio } from "./comuni";
import { correzioniDellaConferma } from "./correzioni-collegate";
import { SegnoProposta, StrisciaProposta } from "./proposta";

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

/**
 * Stato dell'Attesa solo quando non è quello normale ("aperta"); "Soddisfatta" ha la spunta blu. Chiusa
 * dall'AI con una risposta, lo stato lo dice già il riquadro dell'inferenza: nessun distintivo.
 */
function StatoAttesa({ attesa }: { attesa: AttesaDto }) {
  const tc = useTranslations("comuni");
  if (attesa.ciclo === "scartata" || attesa.ciclo === "superata") {
    return <Distintivo tono="neutro">{testoCodice(tc, "statiElemento", attesa.ciclo)}</Distintivo>;
  }
  if (attesa.stato === "aperta") return null;
  if (attesa.chiusaDa === "ai" && attesa.rispostaDiChiusura) return null;
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
  const requisiti = new Map(a.requisiti.map((q) => [q.id, q.descrizione]));
  // Un solo requisito uguale all'oggetto ripeterebbe il titolo: l'elenco serve quando aggiunge qualcosa.
  const elencoRequisiti = a.requisiti.length > 1 || (a.requisiti.length === 1 && a.requisiti[0]!.descrizione.trim() !== a.oggetto.trim());
  // In evidenza nella scheda "Prossima azione": lì ci sono già il sollecito e la domanda della proposta.
  const inEvidenza = contesto.inEvidenza.attesaId === a.id;
  // Una proposta si conferma o si scarta dalla sua domanda; "Non è un'attesa" resta tra le correzioni di quella confermata.
  const scartabile = a.ciclo === "confermata";
  // La citazione porta già alla richiesta: "Apri la tua richiesta" servirebbe solo se nessuna lo fa.
  const richiestaCitata = a.evidenze.some((e) => e.emailId === a.emailRichiestaId);

  return (
    <li
      id={ancora.attesa(a.id)}
      className={cn(
        "scroll-mt-6 rounded-[var(--radius-card)] border bg-surface-raised p-4 shadow-[var(--shadow-card)] target:ring-2 target:ring-accent/40",
        a.proposta ? "border-dashed border-border-strong" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {a.proposta && inEvidenza ? <SegnoProposta /> : null}
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
        {richiestaCitata ? null : <LinkEmail emailId={a.emailRichiestaId}>{t("apriRichiesta")}</LinkEmail>}
      </p>

      {a.chiusaDa === "ai" && a.rispostaDiChiusura ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border-strong bg-suggestion-soft px-3 py-2 text-sm">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <Sparkles className="size-3.5 text-suggestion" aria-hidden />
            <span className="font-medium">{t("chiusaDaAi")}</span>
            <DistintivoBase base="dedotto" />
            <a href={`#${ancora.risposta(a.rispostaDiChiusura)}`} className={CLASSE_LINK}>
              {t("vaiAllaRisposta")}
            </a>
          </p>
          {/* Cosa fa "Riapri" sta nel suo title: il riquadro resta una riga. */}
          <span title={t("chiusaDaAiAiuto")}>
            <ModuloAzione azione={correggiValutazioneAzione} campi={{ risposta: a.rispostaDiChiusura, valutazione: "non_pertinente" }} etichetta={t("riapri")} />
          </span>
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
                <a key={id} href={`#${ancora.risposta(id)}`} className={CLASSE_LINK}>
                  {mittente ? mittente.nome || mittente.indirizzo : t("rispostaNumero", { numero: a.risposte.findIndex((r) => r.id === id) + 1 })}
                </a>
              );
            })}
          </p>
        </div>
      ) : null}

      {a.evidenze.length > 0 ? <ElencoEvidenze evidenze={a.evidenze} className="mt-3 space-y-2" /> : null}

      {a.proposta && !inEvidenza ? <StrisciaProposta tipo="attesa" id={a.id} chiusa={!inCorso} className="mt-3" /> : null}

      {/* Risposte in un elenco piatto dentro la scheda, separate da una riga: nessuna scheda nella scheda. */}
      {a.risposte.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-medium text-text-muted">{t("risposte")}</h4>
          <ul>
            {a.risposte.map((r) => (
              <SchedaRisposta
                key={r.id}
                risposta={r}
                attesa={a}
                requisiti={requisiti}
                elencoRequisiti={elencoRequisiti}
                extra={correzioniDellaConferma(collegamenti, r)}
                contesto={contesto}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <AzioniScheda
        fare={
          inCorso ? (
            <>
              {/* Il pulsante principale della pagina è nella scheda "Prossima azione": qui tutti secondari. */}
              {inEvidenza ? null : <PulsanteProponiSollecito attesaId={a.id} bozzaId={contesto.bozzeSollecito.get(a.id)} consigliato={false} />}
              <ModuloAzione azione={segnaAttesaSoddisfattaAzione} campi={{ attesa: a.id }} etichetta={t("segnaSoddisfatta")} />
              <ModuloAzione
                azione={annullaAttesaAzione}
                campi={{ attesa: a.id }}
                etichetta={t("annulla")}
                variante="fantasma"
                conferma={{ domanda: t("annullaDomanda"), etichetta: t("annullaConferma") }}
              />
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
          <a href={`#${ancora.risposta(a.rispostaDiChiusura)}`} className={CLASSE_LINK}>
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
  elencoRequisiti,
  extra,
  contesto,
}: {
  risposta: RispostaDto;
  attesa: AttesaDto;
  requisiti: ReadonlyMap<string, string>;
  /** L'Attesa mostra l'elenco dei requisiti: senza, "Risponde a:" ripeterebbe il suo titolo. */
  elencoRequisiti: boolean;
  /** Correzioni da annullare insieme a quelle della risposta (il collegamento confermato con lei). */
  extra: Record<string, string[]>;
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.risposte");
  const tc = useTranslations("comuni");
  const lingua = linguaDi(contesto, r.emailId);
  const linguaRichiesta = linguaDi(contesto, attesa.emailRichiestaId);
  const fonte = contesto.fonti.get(r.emailId);
  const rifiutata = r.statoCollegamento === "rifiutato";
  const daVerificare = attesa.daVerificare.includes(r.id);
  const nuova = r.revisione === "da_vedere" && !rifiutata;
  // In evidenza nella scheda "Prossima azione": valutazione, "Segna come vista" e domanda della proposta sono lì.
  const inEvidenza = contesto.inEvidenza.rispostaId === r.id;
  // "Completa" è il caso normale: il distintivo serve per "Parziale" e "Non pertinente".
  const valutazioneDaMostrare = !inEvidenza && r.valutazione !== "completa";
  const valutazioneAi = r.valutazione === r.valutazioneAi && !r.correzioni.some((c) => c.campo === "valutazione");

  return (
    <li id={ancora.risposta(r.id)} className={cn("mt-3 scroll-mt-6 border-t border-border pt-3 first:mt-2 first:border-t-0 first:pt-0 target:rounded-lg target:ring-2 target:ring-accent/40", rifiutata && "opacity-75")}>
      {/* Da sm in su una risposta proposta ha una riga tratteggiata a sinistra; sul telefono resta una riga piena. */}
      <div className={cn(r.proposta && "sm:border-l-2 sm:border-dashed sm:border-border-strong sm:pl-3")}>
        <div className="flex flex-wrap items-center gap-2">
          {r.proposta && inEvidenza ? <SegnoProposta /> : null}
          {rifiutata ? <Distintivo tono="pericolo">{testoCodice(tc, "statiCollegamento", r.statoCollegamento)}</Distintivo> : null}
          {valutazioneDaMostrare ? (
            <Distintivo tono="risposta" icona={valutazioneAi ? <Sparkles className="size-3" aria-hidden /> : undefined}>
              {valutazioneAi ? <span className="sr-only">{t("valutazioneAiSr")}: </span> : null}
              {testoCodice(tc, "valutazioni", r.valutazione)}
            </Distintivo>
          ) : null}
          {nuova && !inEvidenza ? (
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
          {/* "Collegata dall'AI" non aggiunge nulla a una proposta, che è dell'AI per definizione. */}
          {r.proposta && r.origine === "ai" ? null : <span>{testoCodice(tc, "originiCollegamento", r.origine)}</span>}
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
                {elencoRequisiti ? (
                  <p className="text-xs text-text-muted">
                    {t("perRequisito")} <TestoSemplice come="span" testo={requisiti.get(q.requisitoId) ?? "—"} lingua={linguaRichiesta} className="text-text" />
                  </p>
                ) : null}
                {q.evidenze.length > 0 ? <ElencoEvidenze evidenze={q.evidenze} /> : <p className="text-xs text-text-muted">{t("senzaEvidenza")}</p>}
              </li>
            ))}
          </ul>
        ) : null}

        {!rifiutata && r.proposta && !inEvidenza ? <StrisciaProposta tipo="risposta" id={r.id} className="mt-3" /> : null}

        {!rifiutata ? (
          <AzioniScheda
            fare={nuova && !inEvidenza ? <ModuloAzione azione={segnaRispostaVistaAzione} campi={{ risposta: r.id }} etichetta={t("segnaVista")} /> : undefined}
            correggere={
              // Valutazione e scollegamento di una proposta stanno già nella scheda in cima o nella domanda qui sopra.
              inEvidenza && r.proposta ? undefined : (
                <>
                  {inEvidenza
                    ? null
                    : VALUTAZIONI.filter((v) => v !== r.valutazione).map((v) => (
                        <ModuloAzione key={v} azione={correggiValutazioneAzione} campi={{ risposta: r.id, valutazione: v }} etichetta={t(`valuta.${v}`)} />
                      ))}
                  {r.proposta ? null : (
                    <ModuloAzione
                      azione={rifiutaRispostaAzione}
                      campi={{ risposta: r.id }}
                      etichetta={t("rifiuta")}
                      conferma={{ domanda: t("rifiutaDomanda"), etichetta: t("rifiutaConferma") }}
                    />
                  )}
                </>
              )
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
