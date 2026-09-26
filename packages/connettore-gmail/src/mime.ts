import PostalMime, { type Address, type Email } from "postal-mime";
import MailComposer from "nodemailer/lib/mail-composer";
import type { Indirizzo, MessaggioInUscita } from "@ec/core";

const prova = (mime: Buffer): Promise<Email | null> => PostalMime.parse(mime).catch(() => null);

function intestazioniPrincipali(mime: Buffer): Buffer {
  const fine = [mime.indexOf("\n\n"), mime.indexOf("\n\r\n")].filter((i) => i >= 0);
  return fine.length > 0 ? Buffer.concat([mime.subarray(0, Math.min(...fine) + 1), Buffer.from("\r\n")]) : mime;
}

/**
 * Il parser rifiuta sempre alcuni messaggi (annidamento o intestazioni oltre i suoi limiti): un errore
 * bloccherebbe per sempre la sincronizzazione, quindi si ripiega sulle intestazioni principali o su nulla.
 */
export async function analizzaMime(rawBase64Url: string): Promise<Email> {
  const mime = Buffer.from(rawBase64Url, "base64url");
  return (
    (await prova(mime)) ?? (await prova(intestazioniPrincipali(mime))) ?? { headers: [], headerLines: [], attachments: [] }
  );
}

function indirizzo(nome: string | undefined, valore: string): Indirizzo {
  const i: Indirizzo = { indirizzo: valore.trim().toLowerCase() };
  if (nome?.trim()) i.nome = nome.trim();
  return i;
}

export function indirizzi(voci: Address[] | Address | undefined): Indirizzo[] {
  return [voci ?? []]
    .flat()
    .flatMap((v) => (v.group ? v.group : [v]))
    .filter((v) => v.address)
    .map((v) => indirizzo(v.name, v.address));
}

/** Identificativi RFC 5322 senza parentesi angolari; tollera valori senza parentesi. */
export function idMessaggi(valore: string | undefined): string[] {
  if (!valore) return [];
  const tra = valore.match(/<[^<>]*>/g);
  const voci = tra ? tra.map((v) => v.slice(1, -1)) : valore.split(/\s+/);
  return voci.map((v) => v.replace(/\s+/g, "")).filter(Boolean);
}

export function data(valore: string | undefined): Date | null {
  const d = valore ? new Date(valore) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

const destinatari = (voci: Indirizzo[]) =>
  voci.length > 0 ? voci.map((v) => ({ name: v.nome ?? "", address: v.indirizzo })) : undefined;
const tra = (id: string) => `<${id.replace(/^<|>$/g, "")}>`;

/** RFC 5322 in base64url, con il Bcc conservato: Gmail lo usa per recapitare e lo toglie dalle copie consegnate. */
export async function componiMime(m: MessaggioInUscita): Promise<string> {
  const nodo = new MailComposer({
    from: { name: m.da.nome ?? "", address: m.da.indirizzo },
    to: destinatari(m.a),
    cc: destinatari(m.cc),
    bcc: destinatari(m.bcc),
    subject: m.oggetto,
    text: m.corpo,
    messageId: tra(m.messageId),
    inReplyTo: m.inReplyTo ? tra(m.inReplyTo) : undefined,
    references: m.references.length > 0 ? m.references.map(tra) : undefined,
    newline: "win",
  }).compile();
  // In nodemailer 10 l'opzione keepBcc del costruttore viene ignorata: va impostata sul nodo compilato.
  nodo.keepBcc = true;
  return (await nodo.build()).toString("base64url");
}
