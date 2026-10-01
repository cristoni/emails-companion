import { useFormatter, useTranslations } from "next-intl";
import { ArrowDown, CheckCircle2, Link2 } from "lucide-react";
import type { CollegamentoDto, RispostaDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { DistintivoProposta } from "@/components/comuni/distintivi";
import { LinkEmail } from "@/components/comuni/evidenze";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { cn } from "@/components/ui/cn";
import { Distintivo } from "@/components/ui/distintivo";
import { confermaElementoAzione, rifiutaCollegamentoAzione } from "@/app/(app)/situations/[id]/azioni";
import { ancora, CorrezioniElemento, LinkPerche, type ContestoDettaglio } from "./comuni";
import { correzioniDelRifiuto } from "./correzioni-collegate";

/** Il collegamento dell'email d'origine non si rifiuta: è la Situazione stessa (il caso d'uso risponde non_valido). */
export function eOrigine(c: CollegamentoDto, contesto: ContestoDettaglio): boolean {
  return c.ruolo === "origine" || c.emailId === contesto.emailOrigineId;
}

/**
 * Stato del collegamento di un'email alla Situazione, dentro la sua scheda tra le email: come è stata
 * collegata, conferma o scollegamento e le correzioni. Un collegamento proposto la cui email ha anche una
 * Risposta proposta si decide con la risposta (confermarla conferma anche il collegamento): qui solo il rimando.
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
  const formato = useFormatter();
  const rifiutato = c.stato === "rifiutato";
  const proposto = c.stato === "proposto";
  const conRisposta = proposto ? risposte.find((r) => r.emailId === c.emailId && r.proposta && r.statoCollegamento !== "rifiutato") : undefined;

  return (
    <div
      id={ancora.collegamento(c.id)}
      className={cn(
        "scroll-mt-6 space-y-2 rounded-lg px-1 text-sm target:bg-accent-soft",
        proposto && "-mx-1 border border-dashed border-border-strong bg-suggestion-soft px-3 py-2.5",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
        <Link2 className="size-3.5 shrink-0" aria-hidden />
        {proposto ? <DistintivoProposta /> : null}
        {rifiutato ? <Distintivo tono="pericolo">{testoCodice(tc, "statiCollegamento", c.stato)}</Distintivo> : null}
        {c.stato === "confermato" && c.origine === "ai" ? (
          <Distintivo tono="accento" icona={<CheckCircle2 className="size-3" aria-hidden />}>
            {testoCodice(tc, "statiCollegamento", c.stato)}
          </Distintivo>
        ) : null}
        <span>{testoCodice(tc, "originiCollegamento", c.origine)}</span>
        {c.confidenza !== null ? (
          <span>
            {t("confidenza")} {formato.number(c.confidenza, { style: "percent", maximumFractionDigits: 0 })}
          </span>
        ) : null}
        <LinkPerche analisiId={c.analisiId} contesto={contesto} />
        {!proposto && !rifiutato ? <Scollega collegamento={c} /> : null}
      </div>
      {rifiutato ? <p className="text-xs text-text-muted">{t("rifiutatoAiuto")}</p> : null}
      {conRisposta ? (
        <a href={`#${ancora.risposta(conRisposta.id)}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong underline-offset-4 hover:underline">
          {t("conRisposta")}
          <ArrowDown className="size-3.5" aria-hidden />
        </a>
      ) : proposto ? (
        <div className="flex flex-wrap items-center gap-2">
          <ModuloAzione azione={confermaElementoAzione} campi={{ tipo: "collegamento", id: c.id }} etichetta={t("conferma")} />
          <Scollega collegamento={c} />
        </div>
      ) : null}
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
            <LinkEmail emailId={c.emailId} className="text-sm text-accent-strong underline-offset-4 hover:underline" />
          </li>
        ))}
      </ul>
    </div>
  );
}
