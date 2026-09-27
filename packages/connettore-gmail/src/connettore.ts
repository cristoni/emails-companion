import {
  ErroreConnettore,
  type CambioCartelle,
  type CapacitaConnettore,
  type ConnettorePosta,
  type CopiaNormalizzata,
  type EsitoInvioConnettore,
  type FiltroElenco,
  type MessaggioInUscita,
  type PaginaModifiche,
} from "@ec/core";
import { testoPerAnalisi } from "@ec/testo";
import type { ClientGmail, ParametriElenco, RecordHistory } from "./client";
import { cartelleDaEtichette } from "./cartelle";
import { attendi, conRitentativi, erroreConnettore, esitoIgnoto } from "./errori";
import { analizzaMime, componiMime, data, idMessaggi, indirizzi } from "./mime";

const TIPI_HISTORY = ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"];
const DIMENSIONE_PAGINA = 500;
/** Caratteri che altererebbero la sintassi di ricerca di Gmail. */
const TERMINE_SICURO = /^[^\s"'(){}<>\\]+$/;

export interface OpzioniConnettoreGmail {
  client: ClientGmail;
  /** Indirizzo principale della casella. */
  indirizzo: string;
  /** Topic Pub/Sub per `users.watch`; senza topic la casella va interrogata periodicamente. */
  topicNotifiche?: string | null;
  revocaToken?: () => Promise<void>;
  /** Attesa tra i tentativi di lettura (sostituibile nei test). */
  attesa?: (ms: number) => Promise<void>;
}

const secondi = (d: Date) => Math.floor(d.getTime() / 1000);
const unici = (valori: string[]) => [...new Set(valori)];
const decimale = (v: string | null | undefined): v is string => !!v && /^\d+$/.test(v);

function maggiore(a: string, b: string | null | undefined): string {
  if (!decimale(b)) return a;
  return !decimale(a) || BigInt(b) > BigInt(a) ? b : a;
}

function cambio(idConnettore: string, etichette: string[]): CambioCartelle {
  return { idConnettore, cartelle: cartelleDaEtichette(etichette), etichette };
}

function query(filtro: FiltroElenco): string | null {
  const finestra = [`after:${secondi(filtro.dopo)}`, ...(filtro.prima ? [`before:${secondi(filtro.prima)}`] : [])];
  const parti =
    filtro.tipo === "ricevute" ? [...finestra, "-in:sent", "-in:chats", "-in:drafts"] : ["in:sent", ...finestra];
  if (filtro.interlocutori) {
    const validi = unici(filtro.interlocutori.map((i) => i.trim().toLowerCase())).filter(
      (i) => TERMINE_SICURO.test(i) && i.includes("@"),
    );
    if (validi.length === 0) return null;
    const operatori = filtro.tipo === "ricevute" ? ["from"] : ["to", "cc", "bcc"];
    parti.push(`(${validi.flatMap((i) => operatori.map((o) => `${o}:${i}`)).join(" OR ")})`);
  }
  return parti.join(" ");
}

/** Link all'email nell'interfaccia web di Gmail, per l'account della casella. */
export function linkGmail(indirizzo: string, idConnettore: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(indirizzo)}#all/${encodeURIComponent(idConnettore)}`;
}

export class ConnettoreGmail implements ConnettorePosta {
  readonly capacita: CapacitaConnettore;
  readonly #client: ClientGmail;
  readonly #indirizzo: string;
  readonly #topic: string | null;
  readonly #revocaToken: (() => Promise<void>) | undefined;
  readonly #attesa: (ms: number) => Promise<void>;

  constructor(opzioni: OpzioniConnettoreGmail) {
    this.#client = opzioni.client;
    this.#indirizzo = opzioni.indirizzo.trim().toLowerCase();
    this.#topic = opzioni.topicNotifiche || null;
    this.#revocaToken = opzioni.revocaToken;
    this.#attesa = opzioni.attesa ?? attendi;
    this.capacita = { notifiche: this.#topic !== null, threadNativi: true, invio: true, linkOriginale: true, alias: true };
  }

  async cursoreAttuale(): Promise<string> {
    return (await this.#leggi((c) => c.getProfile())).historyId;
  }

  async *modifiche(cursore: string): AsyncGenerator<PaginaModifiche> {
    let raggiunto = cursore;
    let pageToken: string | undefined;
    do {
      const parametri = {
        startHistoryId: cursore,
        historyTypes: [...TIPI_HISTORY],
        maxResults: DIMENSIONE_PAGINA,
        ...(pageToken ? { pageToken } : {}),
      };
      const pagina = await this.#leggi((c) => c.historyList(parametri)).catch((e: ErroreConnettore) => {
        throw e.codice === "non_trovato" ? new ErroreConnettore("cursore_scaduto") : e;
      });
      pageToken = pagina.nextPageToken ?? undefined;
      for (const record of pagina.history) raggiunto = maggiore(raggiunto, record.id);
      if (!pageToken) raggiunto = maggiore(raggiunto, pagina.historyId);
      yield { ...(await this.#modifichePagina(pagina.history)), cursore: raggiunto };
    } while (pageToken);
  }

  async #modifichePagina(history: RecordHistory[]): Promise<Omit<PaginaModifiche, "cursore">> {
    const aggiunte = unici(history.flatMap((r) => r.messagesAdded.map((m) => m.id)));
    const eliminate = unici(history.flatMap((r) => r.messagesDeleted.map((m) => m.id)));
    const ultimeEtichette = new Map<string, string[] | null>();
    for (const record of history) {
      for (const m of [...record.labelsAdded, ...record.labelsRemoved]) {
        ultimeEtichette.delete(m.id);
        ultimeEtichette.set(m.id, m.labelIds);
      }
    }
    const eliminati = new Set(eliminate);
    const cambiCartelle: CambioCartelle[] = [];
    for (const [id, etichette] of ultimeEtichette) {
      if (eliminati.has(id)) continue;
      const c = etichette ? cambio(id, etichette) : await this.cartelle(id);
      if (c) cambiCartelle.push(c);
    }
    return { aggiunte, eliminate, cambiCartelle };
  }

  async *elenca(filtro: FiltroElenco): AsyncGenerator<string[]> {
    if (filtro.thread) {
      const idThread = filtro.thread;
      const thread = await this.#oNull((c) => c.threadsGetMinimal(idThread));
      if (thread && thread.messages.length > 0) yield thread.messages.map((m) => m.id);
      return;
    }
    const q = query(filtro);
    if (q !== null) yield* this.#pagine(q);
  }

  async *#pagine(q: string): AsyncGenerator<string[]> {
    let pageToken: string | undefined;
    do {
      const parametri: ParametriElenco = { q, maxResults: DIMENSIONE_PAGINA, ...(pageToken ? { pageToken } : {}) };
      const pagina = await this.#leggi((c) => c.messagesList(parametri));
      if (pagina.ids.length > 0) yield pagina.ids;
      pageToken = pagina.nextPageToken ?? undefined;
    } while (pageToken);
  }

  async leggi(idConnettore: string): Promise<CopiaNormalizzata | null> {
    const m = await this.#oNull((c) => c.messagesGetRaw(idConnettore));
    if (!m) return null;
    const email = await analizzaMime(m.raw);
    const [messageId = null] = idMessaggi(email.messageId);
    const [inReplyTo = null] = idMessaggi(email.inReplyTo);
    return {
      ...cambio(m.id, m.labelIds),
      threadConnettore: m.threadId,
      ricevutaIl: new Date(Number(m.internalDate)),
      messageId,
      inReplyTo,
      references: idMessaggi(email.references),
      dataIntestazione: data(email.date),
      mittente: indirizzi(email.from)[0] ?? { indirizzo: "" },
      a: indirizzi(email.to),
      cc: indirizzi(email.cc),
      replyTo: indirizzi(email.replyTo),
      oggetto: email.subject ?? "",
      testo: testoPerAnalisi({ testo: email.text ?? null, html: email.html ?? null }),
      nomiAllegati: email.attachments.flatMap((a) => (a.filename && !a.related ? [a.filename] : [])),
    };
  }

  async leggiHtml(idConnettore: string): Promise<string | null> {
    const m = await this.#oNull((c) => c.messagesGetRaw(idConnettore));
    return m ? ((await analizzaMime(m.raw)).html ?? null) : null;
  }

  async cartelle(idConnettore: string): Promise<CambioCartelle | null> {
    const m = await this.#oNull((c) => c.messagesGetMinimal(idConnettore));
    return m && cambio(m.id, m.labelIds);
  }

  async alias(): Promise<string[]> {
    const indirizzi = await this.#leggi((c) => c.sendAsList());
    return unici([this.#indirizzo, ...indirizzi.map((a) => a.trim().toLowerCase())].filter(Boolean));
  }

  async invia(messaggio: MessaggioInUscita): Promise<EsitoInvioConnettore> {
    const raw = await componiMime(messaggio).catch((e: unknown) => {
      throw erroreConnettore(e);
    });
    const inviato = await this.#client.messagesSend(raw, messaggio.threadConnettore).catch((e: unknown) => {
      throw esitoIgnoto(e) ? new ErroreConnettore("timeout_invio") : erroreConnettore(e);
    });
    const metadati = await this.#leggi((c) => c.messagesGetMetadata(inviato.id, ["Message-ID"])).catch(() => null);
    const intestazione = metadati?.headers.find((h) => h.name.toLowerCase() === "message-id");
    const [messageId = null] = idMessaggi(intestazione?.value);
    return { idConnettore: inviato.id, threadConnettore: inviato.threadId, messageId };
  }

  async cercaInviati(criteri: { messageId: string; dopo: Date }): Promise<string[]> {
    const [id] = idMessaggi(criteri.messageId);
    if (!id || !TERMINE_SICURO.test(id)) return [];
    const trovati: string[] = [];
    for await (const ids of this.#pagine(`in:sent rfc822msgid:${id} after:${secondi(criteri.dopo)}`)) {
      trovati.push(...ids);
    }
    return trovati;
  }

  async avviaNotifiche(): Promise<{ scadenza: Date } | null> {
    const topic = this.#topic;
    if (!topic) return null;
    const { expiration } = await this.#chiama((c) => c.watch(topic));
    return { scadenza: new Date(Number(expiration)) };
  }

  async fermaNotifiche(): Promise<void> {
    await this.#chiama((c) => c.stop());
  }

  async revoca(): Promise<void> {
    const revoca = this.#revocaToken;
    if (revoca) await this.#chiama(() => revoca());
  }

  linkOriginale(idConnettore: string, _threadConnettore?: string | null): string {
    return linkGmail(this.#indirizzo, idConnettore);
  }

  #leggi<T>(operazione: (client: ClientGmail) => Promise<T>): Promise<T> {
    return conRitentativi(() => operazione(this.#client), { attesa: this.#attesa });
  }

  async #oNull<T>(operazione: (client: ClientGmail) => Promise<T>): Promise<T | null> {
    try {
      return await this.#leggi(operazione);
    } catch (e) {
      if ((e as ErroreConnettore).codice === "non_trovato") return null;
      throw e;
    }
  }

  async #chiama<T>(operazione: (client: ClientGmail) => Promise<T>): Promise<T> {
    try {
      return await operazione(this.#client);
    } catch (e) {
      throw erroreConnettore(e);
    }
  }
}
