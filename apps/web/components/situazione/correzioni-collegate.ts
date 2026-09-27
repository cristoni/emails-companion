import type { CollegamentoDto, CorrezioneDto, RispostaDto } from "@ec/applicazione";

/**
 * Alcune azioni scrivono più correzioni ma l'evento della cronologia ne richiama una sola. Queste funzioni
 * ritrovano le altre (stessa email, stesso istante, valore corrispondente), così annullare l'azione la
 * annulla tutta. Restituiscono, per id di correzione, gli id da annullare insieme.
 */

type Insieme = Record<string, string[]>;

function stessoIstante(correzioni: readonly CorrezioneDto[], campo: string, valore: string, creataIl: string): string[] {
  return correzioni.filter((x) => x.campo === campo && x.valore === valore && x.creataIl === creataIl).map((x) => x.id);
}

/** Rifiuto di un collegamento: rifiuta anche le Risposte arrivate della stessa email (`rifiutaCollegamento`). */
export function correzioniDelRifiuto(tutteLeRisposte: readonly RispostaDto[], collegamento: CollegamentoDto): Insieme {
  const risultato: Insieme = {};
  const risposte = tutteLeRisposte.filter((r) => r.emailId === collegamento.emailId);
  for (const c of collegamento.correzioni) {
    if (c.campo !== "stato" || c.valore !== "rifiutato") continue;
    const insieme = risposte.flatMap((r) => stessoIstante(r.correzioni, "statoCollegamento", "rifiutato", c.creataIl));
    if (insieme.length > 0) risultato[c.id] = insieme;
  }
  return risultato;
}

/** Conferma di una Risposta arrivata: conferma anche il collegamento proposto della stessa email (`confermaElemento`). */
export function correzioniDellaConferma(tuttiICollegamenti: readonly CollegamentoDto[], risposta: RispostaDto): Insieme {
  const risultato: Insieme = {};
  const collegamenti = tuttiICollegamenti.filter((l) => l.emailId === risposta.emailId);
  for (const c of risposta.correzioni) {
    if (c.campo !== "statoCollegamento" || c.valore !== "confermato") continue;
    const insieme = collegamenti.flatMap((l) => stessoIstante(l.correzioni, "stato", "confermato", c.creataIl));
    if (insieme.length > 0) risultato[c.id] = insieme;
  }
  return risultato;
}
