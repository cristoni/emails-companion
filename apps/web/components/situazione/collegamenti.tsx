import { useTranslations } from "next-intl";
import { ArrowDown, CheckCircle2, Link2 } from "lucide-react";
import type { CollegamentoDto, RispostaDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { cn } from "@/components/ui/cn";
import { CLASSE_LINK_AZIONE } from "@/components/ui/collegamento";
import { Distintivo } from "@/components/ui/distintivo";
import { rifiutaCollegamentoAzione } from "@/app/(app)/situations/[id]/azioni";
import { ancora, AREA_TOCCO, CorrezioniElemento, LinkPerche, type ContestoDettaglio } from "./comuni";
import { correzioniDelRifiuto } from "./correzioni-collegate";
import { SegnoProposta, StrisciaProposta } from "./proposta";

/** Il collegamento dell'email d'origine non si rifiuta: è la Situazione stessa (il caso d'uso risponde non_valido). */
export function eOrigine(c: CollegamentoDto, contesto: ContestoDettaglio): boolean {
  return c.ruolo === "origine" || c.emailId === contesto.emailOrigineId;
}

/**
 * Stato del collegamento di un'email alla Situazione, dentro la sua scheda tra le email: come è stata
 * collegata, conferma o scollegamento e le correzioni. Un collegamento proposto è la domanda della proposta
 * ("Fa parte della Situazione?"); se la sua email ha anche una Risposta proposta si decide con la risposta
 * (confermarla conferma anche il collegamento): qui il segno della proposta e il rimando. La confidenza
 * dell'AI sta nel pannello "Perché?".
 */
export function RigaCollegamento({
  collegamento: c,
  risposte,
  contesto,
}: {
  collegamento: CollegamentoDto;
  /** Tutte le Risposte arrivate della Situazione. */
  risposte: readonly RispostaDto[];
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.collegamenti");
  const tc = useTranslations("comuni");
  const rifiutato = c.stato === "rifiutato";
  const proposto = c.stato === "proposto";
  const conRisposta = proposto ? risposte.find((r) => r.emailId === c.emailId && r.proposta && r.statoCollegamento !== "rifiutato") : undefined;

  if (proposto && !conRisposta) {
    return (
      <div id={ancora.collegamento(c.id)} className="scroll-mt-6 space-y-2 rounded-lg text-sm target:ring-2 target:ring-accent/40">
        <StrisciaProposta
          tipo="collegamento"
          id={c.id}
          className="border border-dashed border-border-strong"
          perche={<LinkPerche analisiId={c.analisiId} contesto={contesto} />}
        />
        <CorrezioniElemento correzioni={c.correzioni} extra={correzioniDelRifiuto(risposte, c)} />
      </div>
    );
  }

  return (
    <div id={ancora.collegamento(c.id)} className="scroll-mt-6 space-y-2 rounded-lg px-1 text-sm target:bg-accent-soft">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
        <Link2 className="size-3.5 shrink-0" aria-hidden />
        {proposto ? <SegnoProposta /> : null}
        {rifiutato ? <Distintivo tono="pericolo">{testoCodice(tc, "statiCollegamento", c.stato)}</Distintivo> : null}
        {c.stato === "confermato" && c.origine === "ai" ? (
          <Distintivo tono="accento" icona={<CheckCircle2 className="size-3" aria-hidden />}>
            {testoCodice(tc, "statiCollegamento", c.stato)}
          </Distintivo>
        ) : null}
        {/* "Collegata dall'AI" non aggiunge nulla a una proposta, che è dell'AI per definizione. */}
        {proposto && c.origine === "ai" ? null : <span>{testoCodice(tc, "originiCollegamento", c.origine)}</span>}
        <LinkPerche analisiId={c.analisiId} contesto={contesto} />
        {conRisposta ? (
          <a href={`#${ancora.risposta(conRisposta.id)}`} className={cn("text-sm", CLASSE_LINK_AZIONE, AREA_TOCCO)}>
            {t("conRisposta")}
            <ArrowDown className="size-3.5" aria-hidden />
          </a>
        ) : null}
        {!proposto && !rifiutato ? <Scollega collegamento={c} /> : null}
      </div>
      {rifiutato ? <p className="text-xs text-text-muted">{t("rifiutatoAiuto")}</p> : null}
      <CorrezioniElemento correzioni={c.correzioni} extra={correzioniDelRifiuto(risposte, c)} />
    </div>
  );
}

function Scollega({ collegamento: c }: { collegamento: CollegamentoDto }) {
  const t = useTranslations("situazione.collegamenti");
  return (
    <ModuloAzione
      azione={rifiutaCollegamentoAzione}
      campi={{ collegamento: c.id }}
      etichetta={t("rifiuta")}
      variante="fantasma"
      conferma={{ domanda: t("rifiutaDomanda"), etichetta: t("rifiutaConferma") }}
    />
  );
}

/**
 * Email collegate e poi scollegate, che non sono più tra le email della Situazione: restano raggiungibili,
 * con l'annullamento dello scollegamento.
 */
export function EmailScollegate({
  collegamenti,
  risposte,
  contesto,
}: {
  collegamenti: readonly CollegamentoDto[];
  risposte: readonly RispostaDto[];
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.collegamenti");
  if (collegamenti.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-text-muted">{t("emailScollegate")}</h3>
      <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface-raised">
        {collegamenti.map((c) => (
          <li key={c.id} className="space-y-1.5 px-4 py-3">
            <RigaCollegamento collegamento={c} risposte={risposte} contesto={contesto} />
            <LinkEmail emailId={c.emailId} className={cn("text-sm", CLASSE_LINK_AZIONE, AREA_TOCCO)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
