import type { Cassaforte, CodaJob } from "@ec/core/porte";
import { Codec } from "./codec";
import type { Database, Transazione } from "./connessione";

export type FabbricaCoda = (tx: Transazione, dopoCommit: (azione: () => void) => void) => CodaJob;

export interface ContestoSistema {
  tx: Transazione;
  coda: CodaJob;
}

/** Contesto legato a un utente: ogni repository filtra per `utenteId`. */
export interface ContestoUtente extends ContestoSistema {
  utenteId: string;
  codec: Codec;
}

export interface DipendenzeUnita {
  db: Database;
  cassaforte: Cassaforte;
  coda: FabbricaCoda;
}

export class UnitaDiLavoro {
  readonly #dip: DipendenzeUnita;

  constructor(dipendenze: DipendenzeUnita) {
    this.#dip = dipendenze;
  }

  get cassaforte(): Cassaforte {
    return this.#dip.cassaforte;
  }

  codec(utenteId: string): Codec {
    return new Codec(this.#dip.cassaforte, utenteId);
  }

  async perUtente<T>(utenteId: string, lavoro: (ctx: ContestoUtente) => Promise<T>): Promise<T> {
    const codec = this.codec(utenteId);
    return this.#esegui((tx, coda) => lavoro({ tx, coda, utenteId, codec }));
  }

  /** Solo per le poche operazioni trasversali agli utenti (pianificazione, instradamento notifiche). */
  async sistema<T>(lavoro: (ctx: ContestoSistema) => Promise<T>): Promise<T> {
    return this.#esegui((tx, coda) => lavoro({ tx, coda }));
  }

  async #esegui<T>(lavoro: (tx: Transazione, coda: CodaJob) => Promise<T>): Promise<T> {
    const dopo: (() => void)[] = [];
    const risultato = await this.#dip.db.transaction(async (tx) => lavoro(tx, this.#dip.coda(tx, (a) => dopo.push(a))));
    for (const azione of dopo) azione();
    return risultato;
  }
}
