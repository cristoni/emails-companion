import type { IdUtente } from "@ec/core";

/** Chiave dati dell'utente cifrata con la chiave principale di versione `versioneKek`. */
export interface ChiaveDatiCifrata {
  dekCifrata: Uint8Array;
  versioneKek: number;
}

export interface DepositoChiaviUtente {
  leggi(utenteId: IdUtente): Promise<ChiaveDatiCifrata | null>;
  /** Inserisce solo se assente, atomicamente; se un altro scrittore ha vinto restituisce la sua chiave. */
  creaSeAssente(utenteId: IdUtente, dekCifrata: Uint8Array, versioneKek: number): Promise<ChiaveDatiCifrata>;
  /** Aggiorna solo una chiave esistente, mai un inserimento: una rotazione non deve resuscitare una chiave eliminata. */
  aggiorna(utenteId: IdUtente, dekCifrata: Uint8Array, versioneKek: number): Promise<void>;
  elimina(utenteId: IdUtente): Promise<void>;
}

export class DepositoChiaviInMemoria implements DepositoChiaviUtente {
  readonly #chiavi = new Map<IdUtente, ChiaveDatiCifrata>();

  async leggi(utenteId: IdUtente): Promise<ChiaveDatiCifrata | null> {
    const chiave = this.#chiavi.get(utenteId);
    return chiave ? copia(chiave) : null;
  }

  async creaSeAssente(utenteId: IdUtente, dekCifrata: Uint8Array, versioneKek: number): Promise<ChiaveDatiCifrata> {
    const esistente = this.#chiavi.get(utenteId);
    if (esistente) return copia(esistente);
    const nuova = copia({ dekCifrata, versioneKek });
    this.#chiavi.set(utenteId, nuova);
    return copia(nuova);
  }

  async aggiorna(utenteId: IdUtente, dekCifrata: Uint8Array, versioneKek: number): Promise<void> {
    if (this.#chiavi.has(utenteId)) this.#chiavi.set(utenteId, copia({ dekCifrata, versioneKek }));
  }

  async elimina(utenteId: IdUtente): Promise<void> {
    this.#chiavi.delete(utenteId);
  }
}

function copia({ dekCifrata, versioneKek }: ChiaveDatiCifrata): ChiaveDatiCifrata {
  return { dekCifrata: Uint8Array.from(dekCifrata), versioneKek };
}
