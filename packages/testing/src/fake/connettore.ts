import {
  ErroreConnettore,
  type CambioCartelle,
  type CapacitaConnettore,
  type ConnettorePosta,
  type CopiaNormalizzata,
  type EsitoInvioConnettore,
  type FabbricaConnettori,
  type FiltroElenco,
  type MessaggioInUscita,
  type PaginaModifiche,
} from "@ec/core/porte";
import type { Cartella, Indirizzo } from "@ec/core/dominio";

interface VoceStorico {
  id: number;
  tipo: "aggiunto" | "eliminato" | "cartelle";
  idMessaggio: string;
}

export interface MessaggioFinto {
  da: Indirizzo | string;
  a: (Indirizzo | string)[];
  cc?: (Indirizzo | string)[];
  oggetto: string;
  testo: string;
  il: Date | string;
  messageId?: string;
  inReplyTo?: string | null;
  references?: string[];
  thread?: string;
  cartelle?: Cartella[];
  allegati?: string[];
}

const ind = (x: Indirizzo | string): Indirizzo => (typeof x === "string" ? { indirizzo: x.toLowerCase() } : { ...x, indirizzo: x.indirizzo.toLowerCase() });

/** Casella Gmail simulata: storico incrementale, cursore scadibile, invii che generano la copia inviata. */
export class CasellaFinta implements ConnettorePosta {
  readonly indirizzo: string;
  readonly capacita: CapacitaConnettore = { notifiche: false, threadNativi: true, invio: true, linkOriginale: true, alias: true };
  readonly messaggi = new Map<string, CopiaNormalizzata & { html: string | null }>();
  readonly storico: VoceStorico[] = [];
  readonly inviati: MessaggioInUscita[] = [];
  readonly alias_: string[] = [];
  #prossimoStorico = 1000;
  #prossimoId = 1;
  #cursoreMinimo = 0;
  revocata = false;
  ora: () => Date = () => new Date();
  erroreInvio: ErroreConnettore | null = null;
  erroreProssimaLettura: ErroreConnettore | null = null;
  dimensionePagina = 3;

  constructor(indirizzo: string) {
    this.indirizzo = indirizzo.toLowerCase();
  }

  /** Aggiunge un messaggio alla casella come farebbe il provider. */
  ricevi(m: MessaggioFinto): string {
    const id = `m${this.#prossimoId++}`;
    const da = ind(m.da);
    const inviato = da.indirizzo === this.indirizzo;
    const cartelle = m.cartelle ?? (inviato ? ["inviata"] : ["in_arrivo"]);
    this.messaggi.set(id, {
      idConnettore: id,
      threadConnettore: m.thread ?? `t-${id}`,
      cartelle,
      etichette: cartelle.map((c) => c.toUpperCase()),
      ricevutaIl: new Date(m.il),
      messageId: m.messageId ?? `${id}@finto.test`,
      inReplyTo: m.inReplyTo ?? null,
      references: m.references ?? [],
      dataIntestazione: new Date(m.il),
      mittente: da,
      a: m.a.map(ind),
      cc: (m.cc ?? []).map(ind),
      replyTo: [],
      oggetto: m.oggetto,
      testo: m.testo,
      nomiAllegati: m.allegati ?? [],
      html: null,
    });
    this.storico.push({ id: this.#prossimoStorico++, tipo: "aggiunto", idMessaggio: id });
    return id;
  }

  cambiaCartelle(id: string, cartelle: Cartella[]): void {
    const m = this.messaggi.get(id);
    if (!m) return;
    m.cartelle = cartelle;
    m.etichette = cartelle.map((c) => c.toUpperCase());
    this.storico.push({ id: this.#prossimoStorico++, tipo: "cartelle", idMessaggio: id });
  }

  elimina(id: string): void {
    this.messaggi.delete(id);
    this.storico.push({ id: this.#prossimoStorico++, tipo: "eliminato", idMessaggio: id });
  }

  /** Simula la scadenza della cronologia: i cursori precedenti diventano non validi. */
  scadiCursori(): void {
    this.#cursoreMinimo = this.#prossimoStorico;
  }

  async cursoreAttuale(): Promise<string> {
    return String(this.#prossimoStorico - 1);
  }

  async *modifiche(cursore: string): AsyncIterable<PaginaModifiche> {
    this.#verificaRevoca();
    if (Number(cursore) < this.#cursoreMinimo - 1) throw new ErroreConnettore("cursore_scaduto");
    const voci = this.storico.filter((v) => v.id > Number(cursore));
    for (let i = 0; i < voci.length; i += this.dimensionePagina) {
      const pagina = voci.slice(i, i + this.dimensionePagina);
      const cambi: CambioCartelle[] = pagina
        .filter((v) => v.tipo === "cartelle" && this.messaggi.has(v.idMessaggio))
        .map((v) => ({ idConnettore: v.idMessaggio, cartelle: this.messaggi.get(v.idMessaggio)!.cartelle, etichette: this.messaggi.get(v.idMessaggio)!.etichette }));
      yield {
        aggiunte: pagina.filter((v) => v.tipo === "aggiunto").map((v) => v.idMessaggio),
        eliminate: pagina.filter((v) => v.tipo === "eliminato").map((v) => v.idMessaggio),
        cambiCartelle: cambi,
        cursore: String(pagina[pagina.length - 1]!.id),
      };
    }
  }

  async *elenca(filtro: FiltroElenco): AsyncIterable<string[]> {
    this.#verificaRevoca();
    const ids = [...this.messaggi.values()]
      .filter((m) => m.ricevutaIl >= filtro.dopo && (!filtro.prima || m.ricevutaIl <= filtro.prima))
      .filter((m) => (filtro.tipo === "inviate" ? m.cartelle.includes("inviata") : !m.cartelle.includes("inviata")))
      .filter((m) => !filtro.interlocutori || filtro.interlocutori.map((x) => x.toLowerCase()).includes(m.mittente.indirizzo))
      .filter((m) => !filtro.thread || m.threadConnettore === filtro.thread)
      .sort((a, b) => b.ricevutaIl.getTime() - a.ricevutaIl.getTime())
      .map((m) => m.idConnettore);
    if (ids.length) yield ids;
  }

  async leggi(id: string): Promise<CopiaNormalizzata | null> {
    this.#verificaRevoca();
    if (this.erroreProssimaLettura) {
      const e = this.erroreProssimaLettura;
      this.erroreProssimaLettura = null;
      throw e;
    }
    const m = this.messaggi.get(id);
    if (!m) return null;
    const { html: _html, ...copia } = m;
    return structuredClone(copia);
  }

  async leggiHtml(id: string): Promise<string | null> {
    return this.messaggi.get(id)?.html ?? null;
  }

  async cartelle(id: string): Promise<CambioCartelle | null> {
    const m = this.messaggi.get(id);
    return m ? { idConnettore: id, cartelle: m.cartelle, etichette: m.etichette } : null;
  }

  async alias(): Promise<string[]> {
    return [this.indirizzo, ...this.alias_];
  }

  async invia(messaggio: MessaggioInUscita): Promise<EsitoInvioConnettore> {
    this.#verificaRevoca();
    if (this.erroreInvio) {
      const e = this.erroreInvio;
      this.erroreInvio = null;
      throw e;
    }
    this.inviati.push(messaggio);
    const id = this.ricevi({
      da: messaggio.da,
      a: messaggio.a,
      cc: messaggio.cc,
      oggetto: messaggio.oggetto,
      testo: messaggio.corpo,
      il: this.ora(),
      messageId: messaggio.messageId,
      inReplyTo: messaggio.inReplyTo,
      references: messaggio.references,
      ...(messaggio.threadConnettore ? { thread: messaggio.threadConnettore } : {}),
      cartelle: ["inviata"],
    });
    return { idConnettore: id, threadConnettore: this.messaggi.get(id)!.threadConnettore, messageId: messaggio.messageId };
  }

  async cercaInviati(criteri: { messageId: string; dopo: Date }): Promise<string[]> {
    return [...this.messaggi.values()].filter((m) => m.messageId === criteri.messageId && m.cartelle.includes("inviata")).map((m) => m.idConnettore);
  }

  async avviaNotifiche() {
    return null;
  }

  async fermaNotifiche() {}

  async revoca() {
    this.revocata = true;
  }

  linkOriginale(id: string): string | null {
    return `https://mail.finta.test/#${id}`;
  }

  #verificaRevoca() {
    if (this.revocata) throw new ErroreConnettore("autorizzazione_revocata");
  }
}

/** Fabbrica che risolve la casella simulata dall'indirizzo della casella collegata. */
export class FabbricaConnettoriFinta implements FabbricaConnettori {
  readonly caselle = new Map<string, CasellaFinta>();
  risolviIndirizzo: (casellaId: string) => Promise<string | null> = async () => null;
  ora: () => Date = () => new Date();

  casella(indirizzo: string): CasellaFinta {
    const chiave = indirizzo.toLowerCase();
    let c = this.caselle.get(chiave);
    if (!c) {
      c = new CasellaFinta(chiave);
      c.ora = this.ora;
      this.caselle.set(chiave, c);
    }
    return c;
  }

  async per(casellaId: string): Promise<ConnettorePosta> {
    const indirizzo = await this.risolviIndirizzo(casellaId);
    if (!indirizzo) throw new ErroreConnettore("autorizzazione_revocata");
    return this.casella(indirizzo);
  }
}
