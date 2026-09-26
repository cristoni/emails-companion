import type { IdUtente } from "../dominio/tipi";

/** Dati associati alla cifratura: impediscono di spostare un cifrato tra utenti, colonne o righe. */
export interface ContestoCifratura {
  utenteId: IdUtente;
  tabella: string;
  colonna: string;
  id: string;
}

export interface Cassaforte {
  cifra(contesto: ContestoCifratura, testo: string): Promise<Uint8Array>;
  decifra(contesto: ContestoCifratura, cifrato: Uint8Array): Promise<string>;
  /** Indice cieco per ricerche per uguaglianza dentro un utente. */
  indice(utenteId: IdUtente, dominio: string, valore: string): Promise<string>;
  /** Indice cieco globale: solo per account esterno e indirizzo della casella. */
  indiceGlobale(dominio: "account_esterno" | "indirizzo_casella", valore: string): string;
  /** Elimina la chiave dati dell'utente (cancellazione dell'account). */
  dimenticaUtente(utenteId: IdUtente): Promise<void>;
}
