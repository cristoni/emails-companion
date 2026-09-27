/**
 * Traduzione dei codici salvati da worker e casi d'uso (errori, motivi di pausa, esiti): sullo schermo
 * compare sempre una frase tradotta, mai il codice grezzo. Un codice sconosciuto usa la riserva.
 */
export interface Traduttore {
  (chiave: string): string;
  has(chiave: string): boolean;
}

export function testoCodice(t: Traduttore, gruppo: string, codice: string | null | undefined, riserva = "errori.sconosciuto"): string {
  if (codice) {
    const chiave = `${gruppo}.${codice}`;
    if (t.has(chiave)) return t(chiave);
  }
  return t(riserva);
}
