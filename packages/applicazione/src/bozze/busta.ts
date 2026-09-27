import {
  dominioDi,
  normalizzaIndirizzo,
  serializzazioneCanonica,
  togliPrefissiOggetto,
  type Email,
  type Indirizzo,
} from "@ec/core/dominio";
import type { ContestoUtente } from "@ec/db";
import type { Busta } from "./repository";

/** Riferimenti conservati in `References`: i più recenti, per non superare i limiti delle intestazioni. */
const MASSIMO_RIFERIMENTI = 20;
const INVISIBILI = /[​-‍⁠﻿­͏]/g;
/** Parte del testo usata per l'impronta: la copia sincronizzata può essere troncata dal connettore. */
const LIMITE_IMPRONTA = 8000;

export const LIMITE_OGGETTO = 500;
export const LIMITE_CORPO = 100_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id ricevuto dalla webapp: un valore malformato è trattato come "non trovato", mai passato al database. */
export function idValido(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}

export function numeroVersioneValido(v: unknown, minimo: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= minimo && v <= 2_147_483_647;
}

/** Oggetto su una sola riga: niente a capo che possano diventare intestazioni. */
export function oggettoSuUnaRiga(oggetto: string): string {
  return oggetto.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Corpo con a capo uniformi. */
export function corpoNormalizzato(corpo: string): string {
  return corpo.replace(/\r\n?/g, "\n");
}

/** Oggetto di una risposta: "Re: " seguito dall'oggetto originale senza prefissi, perché il thread del provider lo richiede. */
export function oggettoRisposta(oggettoOriginale: string): string {
  const base = oggettoSuUnaRiga(togliPrefissiOggetto(oggettoOriginale));
  return base ? `Re: ${base}` : "Re:";
}

/** In-Reply-To e References di una risposta all'email indicata (RFC 5322 §3.6.4). */
export function riferimentiRisposta(email: Pick<Email, "messageId" | "inReplyTo" | "references">): { inReplyTo: string | null; references: string[] } {
  const precedenti = email.references.length > 0 ? email.references : email.inReplyTo ? [email.inReplyTo] : [];
  const tutti = [...precedenti, ...(email.messageId ? [email.messageId] : [])];
  return { inReplyTo: email.messageId, references: [...new Set(tutti)].slice(-MASSIMO_RIFERIMENTI) };
}

function unici(indirizzi: readonly Indirizzo[]): Indirizzo[] {
  const visti = new Set<string>();
  const risultato: Indirizzo[] = [];
  for (const i of indirizzi) {
    const n = normalizzaIndirizzo(i.indirizzo);
    if (!n.includes("@") || visti.has(n)) continue;
    visti.add(n);
    risultato.push(i.nome ? { nome: i.nome, indirizzo: n } : { indirizzo: n });
  }
  return risultato;
}

/**
 * Destinatari di una risposta, calcolati solo dalle intestazioni: Reply-To, altrimenti il mittente.
 * Rispondendo a una propria email inviata si scrive ai destinatari originali. Gli indirizzi
 * dell'utente sono sempre esclusi.
 */
export function destinatariRisposta(email: Pick<Email, "mittente" | "replyTo" | "a">, indirizziUtente: ReadonlySet<string>): Indirizzo[] {
  const proprio = (i: Indirizzo) => indirizziUtente.has(normalizzaIndirizzo(i.indirizzo));
  const base = proprio(email.mittente) ? email.a : email.replyTo.length > 0 ? email.replyTo : [email.mittente];
  return unici(base.filter((i) => !proprio(i)));
}

/** Destinatari di un sollecito: le persone a cui è stata fatta la richiesta, esclusi gli indirizzi dell'utente. */
export function destinatariSollecito(destinatariAttesa: readonly Indirizzo[], indirizziUtente: ReadonlySet<string>): Indirizzo[] {
  return unici(destinatariAttesa.filter((i) => !indirizziUtente.has(normalizzaIndirizzo(i.indirizzo))));
}

export function partecipanti(email: Pick<Email, "mittente" | "a" | "cc" | "replyTo">): Set<string> {
  return new Set([email.mittente, ...email.a, ...email.cc, ...email.replyTo].map((i) => normalizzaIndirizzo(i.indirizzo)));
}

/** Message-ID generato per un invio (senza parentesi angolari): l'id dell'invio nel dominio della casella mittente. */
export function messageIdPerInvio(invioId: string, indirizzoCasella: string): string | null {
  const dominio = dominioDi(indirizzoCasella);
  return dominio ? `${invioId}@${dominio}` : null;
}

function testoPerImpronta(testo: string): string {
  return testo.replace(INVISIBILI, "").replace(/\s+/g, " ").trim().slice(0, LIMITE_IMPRONTA);
}

function datiImpronta(x: { oggetto: string; corpo: string; destinatari: readonly Indirizzo[] }): string {
  return serializzazioneCanonica({
    oggetto: testoPerImpronta(x.oggetto),
    corpo: testoPerImpronta(x.corpo),
    destinatari: [...new Set(x.destinatari.map((d) => normalizzaIndirizzo(d.indirizzo)))].sort(),
  });
}

/**
 * Impronta di un invio: HMAC di oggetto, corpo normalizzato e destinatari visibili ordinati. Serve ad
 * abbinare la copia inviata quando il provider non conserva il Message-ID generato.
 */
export function improntaBusta(ctx: ContestoUtente, busta: Pick<Busta, "oggetto" | "corpo" | "a" | "cc">): Promise<string> {
  return ctx.codec.indice("impronta_invio", datiImpronta({ oggetto: busta.oggetto, corpo: busta.corpo, destinatari: [...busta.a, ...busta.cc] }));
}

export function improntaEmail(ctx: ContestoUtente, email: Pick<Email, "oggetto" | "testo" | "a" | "cc">): Promise<string> {
  return ctx.codec.indice("impronta_invio", datiImpronta({ oggetto: email.oggetto, corpo: email.testo, destinatari: [...email.a, ...email.cc] }));
}
