import { randomBytes } from "node:crypto";
import { ErroreConfigurazioneChiavi } from "./errori";

export interface ConfigurazioneChiavi {
  chiaviPrincipali: Record<number, Uint8Array>;
  versioneAttiva: number;
  chiaveIndiciGlobali: Uint8Array;
}

export const LUNGHEZZA_CHIAVE = 32;

const PREFISSO_PRINCIPALE = "EC_CHIAVE_PRINCIPALE_V";
const ATTIVA = "EC_CHIAVE_PRINCIPALE_ATTIVA";
const INDICI_GLOBALI = "EC_CHIAVE_INDICI_GLOBALI";

export function generaChiaveBase64(): string {
  return randomBytes(LUNGHEZZA_CHIAVE).toString("base64");
}

/** Legge le chiavi da `EC_CHIAVE_PRINCIPALE_V<n>`, `EC_CHIAVE_PRINCIPALE_ATTIVA` e `EC_CHIAVE_INDICI_GLOBALI`. */
export function caricaConfigurazioneChiavi(env: Record<string, string | undefined>): ConfigurazioneChiavi {
  const chiaviPrincipali: Record<number, Uint8Array> = {};
  for (const [nome, valore] of Object.entries(env)) {
    if (!nome.startsWith(PREFISSO_PRINCIPALE) || !valore?.trim()) continue;
    chiaviPrincipali[versione(nome.slice(PREFISSO_PRINCIPALE.length), nome)] = chiave(valore, nome);
  }
  const versioneAttiva = versione(richiesta(env, ATTIVA), ATTIVA);
  if (!chiaviPrincipali[versioneAttiva]) {
    throw new ErroreConfigurazioneChiavi("variabile_mancante", `${PREFISSO_PRINCIPALE}${versioneAttiva}`);
  }
  const chiaveIndiciGlobali = chiave(richiesta(env, INDICI_GLOBALI), INDICI_GLOBALI);
  if (Object.values(chiaviPrincipali).some((principale) => uguali(principale, chiaveIndiciGlobali))) {
    throw new ErroreConfigurazioneChiavi("chiavi_non_distinte", INDICI_GLOBALI);
  }
  return { chiaviPrincipali, versioneAttiva, chiaveIndiciGlobali };
}

/** Stesse regole del caricamento, per chi costruisce la configurazione in codice. */
export function validaConfigurazioneChiavi({ chiaviPrincipali, versioneAttiva, chiaveIndiciGlobali }: ConfigurazioneChiavi) {
  const principali = Object.entries(chiaviPrincipali);
  for (const [numero, principale] of principali) {
    versione(numero, "chiaviPrincipali");
    if (principale.length !== LUNGHEZZA_CHIAVE) throw new ErroreConfigurazioneChiavi("chiave_non_valida", "chiaviPrincipali");
  }
  if (!principali.some(([numero]) => Number(numero) === versioneAttiva)) {
    throw new ErroreConfigurazioneChiavi("versione_attiva_senza_chiave", "versioneAttiva");
  }
  if (chiaveIndiciGlobali.length !== LUNGHEZZA_CHIAVE) {
    throw new ErroreConfigurazioneChiavi("chiave_non_valida", "chiaveIndiciGlobali");
  }
  if (principali.some(([, principale]) => uguali(principale, chiaveIndiciGlobali))) {
    throw new ErroreConfigurazioneChiavi("chiavi_non_distinte", "chiaveIndiciGlobali");
  }
}

function richiesta(env: Record<string, string | undefined>, nome: string): string {
  const valore = env[nome]?.trim();
  if (!valore) throw new ErroreConfigurazioneChiavi("variabile_mancante", nome);
  return valore;
}

/** `chiave_utente.versione_kek` è un `integer` di Postgres. */
const VERSIONE_MASSIMA = 2_147_483_647;

function versione(testo: string, voce: string): number {
  const numero = Number(testo);
  if (!/^[1-9]\d*$/.test(testo) || numero > VERSIONE_MASSIMA) {
    throw new ErroreConfigurazioneChiavi("versione_non_valida", voce);
  }
  return numero;
}

function chiave(base64: string, voce: string): Uint8Array {
  const pulita = base64.trim();
  const byte = Buffer.from(pulita, "base64");
  if (byte.length !== LUNGHEZZA_CHIAVE || byte.toString("base64") !== pulita) {
    throw new ErroreConfigurazioneChiavi("chiave_non_valida", voce);
  }
  return new Uint8Array(byte);
}

function uguali(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.from(a).equals(Buffer.from(b));
}
