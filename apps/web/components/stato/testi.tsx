import type { MotivoPausa } from "@ec/core/dominio";
import { testoCodice, type Traduttore } from "@/components/comuni/codici";

/** Sezione di `/settings` dove si risolve ogni motivo di pausa: la usano sia `/status` sia `/settings`. */
export const SEZIONE_MOTIVO_PAUSA: Record<MotivoPausa, string> = {
  consenso_mancante: "privacy",
  chiave_mancante: "openrouter",
  chiave_non_valida: "openrouter",
  credito_esaurito: "openrouter",
  modello_incompatibile: "models",
  modello_non_disponibile: "models",
  pausa_manuale: "pause",
};

/**
 * Codice d'errore salvato dal worker, con il traduttore radice: prima le voci proprie di `/status`
 * (codici che `comuni.errori` non copre), poi `comuni.errori`, poi l'errore generico. Mai il codice grezzo.
 */
export function testoErrore(t: Traduttore, codice: string | null | undefined): string {
  if (codice && t.has(`stato.codiciErrore.${codice}`)) return t(`stato.codiciErrore.${codice}`);
  return testoCodice(t, "comuni.errori", codice, "comuni.errori.sconosciuto");
}

/** Nome tradotto di una Funzione AI (o di tutte, per le pause globali), con riserva per codici sconosciuti. */
export function nomeFunzione(t: Traduttore, funzione: string): string {
  if (funzione === "*") return t("stato.pause.tutte");
  return testoCodice(t, "comuni.funzioni", funzione, "stato.erroriRecenti.funzioneSconosciuta");
}
