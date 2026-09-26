import type { Cassaforte } from "@ec/core/porte";

/** Cifratura dei campi di un utente: i dati associati legano ogni valore a tabella, colonna e riga. */
export class Codec {
  readonly utenteId: string;
  readonly #cassaforte: Cassaforte;

  constructor(cassaforte: Cassaforte, utenteId: string) {
    this.#cassaforte = cassaforte;
    this.utenteId = utenteId;
  }

  cifra(tabella: string, colonna: string, id: string, testo: string): Promise<Uint8Array> {
    return this.#cassaforte.cifra({ utenteId: this.utenteId, tabella, colonna, id }, testo);
  }

  decifra(tabella: string, colonna: string, id: string, dati: Uint8Array): Promise<string> {
    return this.#cassaforte.decifra({ utenteId: this.utenteId, tabella, colonna, id }, dati);
  }

  async cifraJson(tabella: string, colonna: string, id: string, valore: unknown): Promise<Uint8Array> {
    return this.cifra(tabella, colonna, id, JSON.stringify(valore ?? null));
  }

  async decifraJson<T>(tabella: string, colonna: string, id: string, dati: Uint8Array): Promise<T> {
    return JSON.parse(await this.decifra(tabella, colonna, id, dati)) as T;
  }

  async cifraOpzionale(tabella: string, colonna: string, id: string, testo: string | null): Promise<Uint8Array | null> {
    return testo === null ? null : this.cifra(tabella, colonna, id, testo);
  }

  async decifraOpzionale(tabella: string, colonna: string, id: string, dati: Uint8Array | null): Promise<string | null> {
    return dati === null ? null : this.decifra(tabella, colonna, id, dati);
  }

  /** Indice cieco per uguaglianza; il valore deve essere già normalizzato dal chiamante. */
  indice(dominio: string, valore: string): Promise<string> {
    return this.#cassaforte.indice(this.utenteId, dominio, valore);
  }

  indiceGlobale(dominio: "account_esterno" | "indirizzo_casella", valore: string): string {
    return this.#cassaforte.indiceGlobale(dominio, valore);
  }
}
