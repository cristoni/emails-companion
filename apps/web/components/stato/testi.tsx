import { useFormatter, useTranslations } from "next-intl";
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

const MINUTO_MS = 60_000;

/** Durata leggibile (minuti, ore o giorni) formattata nella lingua dell'utente. */
export function Durata({ ms }: { ms: number }) {
  const formato = useFormatter();
  const t = useTranslations("stato.durata");
  const minuti = Math.floor(ms / MINUTO_MS);
  if (minuti < 1) return <>{t("menoDiUnMinuto")}</>;
  const [valore, unita] = minuti < 60 ? [minuti, "minute"] : minuti < 48 * 60 ? [Math.floor(minuti / 60), "hour"] : [Math.floor(minuti / (24 * 60)), "day"];
  return <>{formato.number(valore, { style: "unit", unit: unita, unitDisplay: "long" })}</>;
}
