import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import type { Cassaforte, ContestoCifratura, IdUtente } from "@ec/core";
import { LUNGHEZZA_CHIAVE, validaConfigurazioneChiavi, type ConfigurazioneChiavi } from "./configurazione";
import type { ChiaveDatiCifrata, DepositoChiaviUtente } from "./deposito";
import { ErroreCassaforte } from "./errori";

const FORMATO = 1;
const LUNGHEZZA_IV = 12;
const LUNGHEZZA_TAG = 16;
const codificatore = new TextEncoder();
// Senza `ignoreBOM` un U+FEFF iniziale sparirebbe, spostando gli offset delle citazioni.
const decodificatore = new TextDecoder("utf-8", { ignoreBOM: true });

export interface OpzioniCassaforteBusta extends ConfigurazioneChiavi {
  deposito: DepositoChiaviUtente;
  /** Utenti le cui chiavi dati restano in memoria (LRU). */
  capienzaCache?: number;
}

interface VoceCache {
  dek: Uint8Array;
  chiaviIndice: Map<string, Uint8Array>;
}

export class CassaforteBusta implements Cassaforte {
  readonly #chiaviPrincipali: Map<number, Uint8Array>;
  readonly #versioneAttiva: number;
  readonly #chiaveIndiciGlobali: Uint8Array;
  readonly #deposito: DepositoChiaviUtente;
  readonly #capienzaCache: number;
  readonly #cache = new Map<IdUtente, VoceCache>();
  /** Cresce a ogni `dimenticaUtente` completato: un caricamento a cavallo non entra in cache. */
  #dimenticanze = 0;

  constructor(opzioni: OpzioniCassaforteBusta) {
    validaConfigurazioneChiavi(opzioni);
    this.#chiaviPrincipali = new Map(
      Object.entries(opzioni.chiaviPrincipali).map(([versione, chiave]) => [Number(versione), Uint8Array.from(chiave)]),
    );
    this.#versioneAttiva = opzioni.versioneAttiva;
    this.#chiaveIndiciGlobali = Uint8Array.from(opzioni.chiaveIndiciGlobali);
    this.#deposito = opzioni.deposito;
    this.#capienzaCache = opzioni.capienzaCache ?? 1000;
  }

  async cifra(contesto: ContestoCifratura, testo: string): Promise<Uint8Array> {
    const aad = datiAssociati(contesto);
    const { dek } = await this.#voce(contesto.utenteId, true);
    return sigilla(dek, codificatore.encode(testo), aad);
  }

  async decifra(contesto: ContestoCifratura, cifrato: Uint8Array): Promise<string> {
    const aad = datiAssociati(contesto);
    const { dek } = await this.#voce(contesto.utenteId, false);
    return decodificatore.decode(apri(dek, cifrato, aad));
  }

  async indice(utenteId: IdUtente, dominio: string, valore: string): Promise<string> {
    const voce = await this.#voce(utenteId, true);
    let chiave = voce.chiaviIndice.get(dominio);
    if (!chiave) {
      chiave = new Uint8Array(hkdfSync("sha256", voce.dek, "ec-indici", `indice:${dominio}`, LUNGHEZZA_CHIAVE));
      voce.chiaviIndice.set(dominio, chiave);
    }
    return createHmac("sha256", chiave).update(valore, "utf8").digest("hex");
  }

  indiceGlobale(dominio: "account_esterno" | "indirizzo_casella", valore: string): string {
    return createHmac("sha256", this.#chiaveIndiciGlobali).update(`${dominio}:${valore}`, "utf8").digest("hex");
  }

  async dimenticaUtente(utenteId: IdUtente): Promise<void> {
    await this.#deposito.elimina(utenteId);
    this.#dimenticanze++;
    this.#cache.delete(utenteId);
  }

  /** Ricifra la chiave dati con la chiave principale attiva; `false` se non c'era nulla da ruotare. */
  async ruotaChiaveUtente(utenteId: IdUtente): Promise<boolean> {
    const busta = await this.#deposito.leggi(utenteId);
    if (!busta || busta.versioneKek >= this.#versioneAttiva) return false;
    const dek = this.#svolgi(utenteId, busta);
    await this.#deposito.aggiorna(utenteId, this.#avvolgi(utenteId, dek), this.#versioneAttiva);
    return true;
  }

  async #voce(utenteId: IdUtente, crea: boolean): Promise<VoceCache> {
    const inCache = this.#cache.get(utenteId);
    if (inCache) return this.#ricorda(utenteId, inCache);
    const dimenticanze = this.#dimenticanze;
    let busta = await this.#deposito.leggi(utenteId);
    if (!busta) {
      if (!crea) throw new ErroreCassaforte("chiave_utente_assente");
      const dekCifrata = this.#avvolgi(utenteId, randomBytes(LUNGHEZZA_CHIAVE));
      busta = await this.#deposito.creaSeAssente(utenteId, dekCifrata, this.#versioneAttiva);
    }
    const voce: VoceCache = { dek: this.#svolgi(utenteId, busta), chiaviIndice: new Map() };
    return dimenticanze === this.#dimenticanze ? this.#ricorda(utenteId, voce) : voce;
  }

  #ricorda(utenteId: IdUtente, voce: VoceCache): VoceCache {
    this.#cache.delete(utenteId);
    this.#cache.set(utenteId, voce);
    for (const piuVecchio of this.#cache.keys()) {
      if (this.#cache.size <= this.#capienzaCache) break;
      this.#cache.delete(piuVecchio);
    }
    return voce;
  }

  #avvolgi(utenteId: IdUtente, dek: Uint8Array): Uint8Array {
    const versione = this.#versioneAttiva;
    return sigilla(this.#chiavePrincipale(versione), dek, aadChiave(utenteId, versione));
  }

  #svolgi(utenteId: IdUtente, { dekCifrata, versioneKek }: ChiaveDatiCifrata): Uint8Array {
    const kek = this.#chiavePrincipale(versioneKek);
    const aad = aadChiave(utenteId, versioneKek);
    try {
      return apri(kek, dekCifrata, aad);
    } catch {
      throw new ErroreCassaforte("chiave_utente_non_valida");
    }
  }

  #chiavePrincipale(versione: number): Uint8Array {
    const chiave = this.#chiaviPrincipali.get(versione);
    if (!chiave) throw new ErroreCassaforte("versione_chiave_principale_sconosciuta");
    return chiave;
  }
}

function datiAssociati({ utenteId, tabella, colonna, id }: ContestoCifratura): Buffer {
  if (!id) throw new ErroreCassaforte("contesto_non_valido");
  return Buffer.from(`${componente(utenteId)}:${componente(tabella)}:${componente(colonna)}:${id}`, "utf8");
}

function aadChiave(utenteId: IdUtente, versione: number): Buffer {
  return Buffer.from(`dek:${componente(utenteId)}:v${versione}`, "utf8");
}

/** Solo l'ultimo componente può contenere `:` senza rendere ambigui i dati associati. */
function componente(parte: string): string {
  if (!parte || parte.includes(":")) throw new ErroreCassaforte("contesto_non_valido");
  return parte;
}

// `sigilla` e `apri` copiano il risultato in un ArrayBuffer proprio: le Buffer piccole di Node
// condividono un'area comune con altri dati del processo, esposta a chi legge `.buffer`.
function sigilla(chiave: Uint8Array, testo: Uint8Array, aad: Uint8Array): Uint8Array {
  const iv = randomBytes(LUNGHEZZA_IV);
  const cifratore = createCipheriv("aes-256-gcm", chiave, iv, { authTagLength: LUNGHEZZA_TAG });
  cifratore.setAAD(aad);
  const corpo = Buffer.concat([cifratore.update(testo), cifratore.final()]);
  return new Uint8Array(Buffer.concat([Buffer.of(FORMATO), iv, corpo, cifratore.getAuthTag()]));
}

function apri(chiave: Uint8Array, cifrato: Uint8Array, aad: Uint8Array): Uint8Array {
  if (cifrato.length < 1 + LUNGHEZZA_IV + LUNGHEZZA_TAG || cifrato[0] !== FORMATO) {
    throw new ErroreCassaforte("formato_non_supportato");
  }
  const iv = cifrato.subarray(1, 1 + LUNGHEZZA_IV);
  const corpo = cifrato.subarray(1 + LUNGHEZZA_IV, cifrato.length - LUNGHEZZA_TAG);
  const tag = cifrato.subarray(cifrato.length - LUNGHEZZA_TAG);
  try {
    const decifratore = createDecipheriv("aes-256-gcm", chiave, iv, { authTagLength: LUNGHEZZA_TAG });
    decifratore.setAAD(aad);
    decifratore.setAuthTag(tag);
    return new Uint8Array(Buffer.concat([decifratore.update(corpo), decifratore.final()]));
  } catch {
    throw new ErroreCassaforte("decifratura_fallita");
  }
}
