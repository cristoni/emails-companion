import { normalizzaIndirizzo } from "./correlazione";
import { CARTELLE_ESCLUSE, type Cartella, type Direzione } from "./tipi";

export const MINUTI_ATTESA_COPIA_INVIATA = 15;

/**
 * Direzione effettiva dell'Email logica. Un mittente dell'utente senza copia inviata dà comunque `uscita`:
 * il chiamante applica prima `inAttesaDiCopiaInviata` e, scaduta l'attesa, la regola "non verificato" (architettura §5.3).
 */
export function determinaDirezione(input: {
  cartelleCopie: readonly (readonly Cartella[])[];
  mittente: string;
  destinatari: readonly string[];
  indirizziUtente: ReadonlySet<string>;
}): Direzione {
  const utente = new Set([...input.indirizziUtente].map(normalizzaIndirizzo));
  const dellUtente = (indirizzo: string) => utente.has(normalizzaIndirizzo(indirizzo));
  const mittenteDellUtente = dellUtente(input.mittente);
  if (mittenteDellUtente && input.destinatari.length > 0 && input.destinatari.every(dellUtente)) return "interna";
  if (mittenteDellUtente || input.cartelleCopie.some((c) => c.includes("inviata"))) return "uscita";
  return "entrata";
}

/** Vero se ogni copia è in una cartella esclusa (anche senza copie). */
export function daEscludereDallAnalisi(cartelleCopie: readonly (readonly Cartella[])[]): boolean {
  return cartelleCopie.every((cartelle) => cartelle.some((c) => CARTELLE_ESCLUSE.includes(c)));
}

export function inAttesaDiCopiaInviata(input: {
  mittenteDellUtente: boolean;
  haCopiaInviata: boolean;
  acquisitaIl: Date;
  ora: Date;
  minuti?: number;
}): boolean {
  const scadenza = input.acquisitaIl.getTime() + (input.minuti ?? MINUTI_ATTESA_COPIA_INVIATA) * 60_000;
  return input.mittenteDellUtente && !input.haCopiaInviata && input.ora.getTime() < scadenza;
}
