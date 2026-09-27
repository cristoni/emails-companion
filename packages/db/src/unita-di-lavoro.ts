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
    const risultato = await this.#dip.db.transaction(async (tx) => {
      const ripristina = mettiInFilaLeQuery(tx);
      try {
        return await lavoro(tx, this.#dip.coda(tx, (a) => dopo.push(a)));
      } finally {
        ripristina();
      }
    });
    for (const azione of dopo) azione();
    return risultato;
  }
}

type Interrogazione = (...argomenti: unknown[]) => unknown;

/**
 * Dentro una transazione tutte le query passano dallo stesso client di pg, e i repository ne lanciano
 * più d'una insieme (Promise.all). pg 8 le accoda da sé ma lo segnala come deprecato e pg 9 le rifiuterà:
 * qui le mettiamo in fila, in un solo punto, per tutta la durata della transazione. Il client è quello
 * della sessione di Drizzle; se la sua forma cambiasse, la funzione non fa nulla.
 */
export function mettiInFilaLeQuery(tx: Transazione): () => void {
  const client = (tx as unknown as { session?: { client?: { query?: unknown } } }).session?.client;
  if (!client || typeof client.query !== "function") return () => {};
  const originale = client.query as Interrogazione;
  let coda: Promise<unknown> = Promise.resolve();
  const inFila: Interrogazione = (...argomenti) => {
    // Solo la forma con promessa usata da Drizzle; callback e oggetti con submit passano invariati.
    const conCallback = argomenti.some((a) => typeof a === "function");
    const inviabile = typeof (argomenti[0] as { submit?: unknown } | undefined)?.submit === "function";
    if (conCallback || inviabile) return originale.apply(client, argomenti);
    const risultato = coda.then(() => originale.apply(client, argomenti));
    coda = risultato.catch(() => undefined);
    return risultato;
  };
  client.query = inFila;
  return () => {
    client.query = originale;
  };
}
