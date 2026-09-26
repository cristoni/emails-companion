import type { Cartella, Indirizzo } from "../dominio/tipi";

export interface CapacitaConnettore {
  notifiche: boolean;
  threadNativi: boolean;
  invio: boolean;
  linkOriginale: boolean;
  alias: boolean;
}

/** Copia di un messaggio come la vede il connettore, già normalizzata. */
export interface CopiaNormalizzata {
  idConnettore: string;
  threadConnettore: string | null;
  cartelle: Cartella[];
  etichette: string[];
  /** Istante di ricezione secondo il provider (per Gmail internalDate). */
  ricevutaIl: Date;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  dataIntestazione: Date | null;
  mittente: Indirizzo;
  a: Indirizzo[];
  cc: Indirizzo[];
  replyTo: Indirizzo[];
  oggetto: string;
  /** Testo normalizzato per l'analisi (elementi nascosti rimossi, troncato). */
  testo: string;
  nomiAllegati: string[];
}

export interface CambioCartelle {
  idConnettore: string;
  cartelle: Cartella[];
  etichette: string[];
}

export interface PaginaModifiche {
  aggiunte: string[];
  eliminate: string[];
  cambiCartelle: CambioCartelle[];
  /** Cursore da salvare dopo aver applicato questa pagina. */
  cursore: string;
}

export interface FiltroElenco {
  dopo: Date;
  prima?: Date;
  tipo: "ricevute" | "inviate";
  /** Limita ai messaggi scambiati con questi indirizzi (per le risposte fuori finestra). */
  interlocutori?: string[];
  thread?: string;
}

export interface MessaggioInUscita {
  messageId: string;
  da: Indirizzo;
  a: Indirizzo[];
  cc: Indirizzo[];
  bcc: Indirizzo[];
  oggetto: string;
  corpo: string;
  inReplyTo: string | null;
  references: string[];
  threadConnettore: string | null;
}

export interface EsitoInvioConnettore {
  idConnettore: string;
  threadConnettore: string | null;
  messageId: string | null;
}

export const CODICI_ERRORE_CONNETTORE = [
  "autorizzazione_revocata",
  "permessi_insufficienti",
  "limite_frequenza",
  "temporaneo",
  "cursore_scaduto",
  "timeout_invio",
  "non_trovato",
] as const;
export type CodiceErroreConnettore = (typeof CODICI_ERRORE_CONNETTORE)[number];

/** Errore del connettore già ridotto a codice: non contiene mai testo del provider. */
export class ErroreConnettore extends Error {
  readonly codice: CodiceErroreConnettore;
  readonly riprovaDopoMs: number | null;
  constructor(codice: CodiceErroreConnettore, riprovaDopoMs: number | null = null) {
    super(codice);
    this.name = "ErroreConnettore";
    this.codice = codice;
    this.riprovaDopoMs = riprovaDopoMs;
  }
}

/** Accesso a una Casella collegata tramite un Connettore di posta. */
export interface ConnettorePosta {
  readonly capacita: CapacitaConnettore;
  cursoreAttuale(): Promise<string>;
  /** Pagine di modifiche dal cursore; lancia ErroreConnettore("cursore_scaduto") se non più valido. */
  modifiche(cursore: string): AsyncIterable<PaginaModifiche>;
  elenca(filtro: FiltroElenco): AsyncIterable<string[]>;
  /** null se il messaggio non esiste più. */
  leggi(idConnettore: string): Promise<CopiaNormalizzata | null>;
  leggiHtml(idConnettore: string): Promise<string | null>;
  cartelle(idConnettore: string): Promise<CambioCartelle | null>;
  alias(): Promise<string[]>;
  invia(messaggio: MessaggioInUscita): Promise<EsitoInvioConnettore>;
  cercaInviati(criteri: { messageId: string; dopo: Date }): Promise<string[]>;
  avviaNotifiche(): Promise<{ scadenza: Date } | null>;
  fermaNotifiche(): Promise<void>;
  revoca(): Promise<void>;
  linkOriginale(idConnettore: string, threadConnettore: string | null): string | null;
}

export interface FabbricaConnettori {
  /** Connettore per una casella; le credenziali sono risolte dall'infrastruttura. */
  per(casellaId: string): Promise<ConnettorePosta>;
}
