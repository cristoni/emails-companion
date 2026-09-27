import { MINUTO_MS } from "../dipendenze";

/** Un invio confermato che il job non ha preso in carico entro questo tempo non è partito. */
export const SOGLIA_CONFERMATO_MS = 10 * MINUTO_MS;
/** Oltre il timeout rigido della chiamata di invio e un margine, l'esito è incerto. */
export const SOGLIA_IN_INVIO_MS = 5 * MINUTO_MS;
/** Durata della ricerca automatica della copia inviata dopo un esito incerto. */
export const DURATA_VERIFICA_MS = 15 * MINUTO_MS;

/**
 * Fine della verifica automatica di un invio (§12): fino ad allora la copia inviata può ancora comparire
 * nella posta sincronizzata o nella ricerca del connettore, quindi l'utente non decide su un esito incerto.
 */
export function fineVerifica(invio: { inizioInvio: Date | null; confermatoIl: Date }): Date {
  const inizio = invio.inizioInvio ?? invio.confermatoIl;
  return new Date(inizio.getTime() + SOGLIA_IN_INVIO_MS + DURATA_VERIFICA_MS);
}
