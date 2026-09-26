import type {
  Attore,
  Base,
  Cartella,
  Categoria,
  Direzione,
  Evidenza,
  FaseImportazione,
  IdAnalisi,
  IdAttesa,
  IdAttivita,
  IdCasella,
  IdCopia,
  IdEmail,
  IdRequisito,
  IdRisposta,
  IdSituazione,
  IdUtente,
  Indirizzo,
  OrigineCollegamento,
  Priorita,
  RuoloCollegamento,
  StatoCasella,
  StatoCollegamento,
  StatoElemento,
  StatoRevisione,
  Valutazione,
} from "./tipi";

/** Entità del dominio in forma decifrata. */

export interface CasellaCollegata {
  id: IdCasella;
  utenteId: IdUtente;
  connettore: string;
  indirizzo: string;
  stato: StatoCasella;
  scopeConcessi: string[];
  collegataIl: Date;
  faseImportazione: FaseImportazione;
}

export const FONTI_LINGUA = ["rilevata", "thread", "risposta", "interfaccia", "utente"] as const;
export type FonteLingua = (typeof FONTI_LINGUA)[number];

/** Email logica: una per messaggio dell'utente, anche se presente in più caselle. */
export interface Email {
  id: IdEmail;
  utenteId: IdUtente;
  messageId: string | null;
  direzione: Direzione;
  mittente: Indirizzo;
  a: Indirizzo[];
  cc: Indirizzo[];
  replyTo: Indirizzo[];
  oggetto: string;
  testo: string;
  anteprima: string;
  ricevutaIl: Date;
  inReplyTo: string | null;
  references: string[];
  lingua: string;
  fonteLingua: FonteLingua;
  nomiAllegati: string[];
  /** true se l'email è stata acquisita solo per valutare risposte fuori dalla finestra di importazione. */
  soloPerRisposte: boolean;
}

/** Presenza di un'Email in una casella. */
export interface CopiaEmail {
  id: IdCopia;
  utenteId: IdUtente;
  casellaId: IdCasella;
  emailId: IdEmail;
  idConnettore: string;
  threadConnettore: string | null;
  cartelle: Cartella[];
  etichette: string[];
  origineInvio: "app" | "esterna" | null;
  eliminataNelProvider: boolean;
}

export interface Classificazione {
  emailId: IdEmail;
  categoria: Categoria;
  urgente: boolean;
  priorita: Priorita;
  motivazione: string;
  titoloSituazione: string | null;
  descrizioneSituazione: string | null;
  evidenze: Evidenza[];
  analisiId: IdAnalisi | null;
}

export interface Situazione {
  id: IdSituazione;
  utenteId: IdUtente;
  emailOrigineId: IdEmail;
  titolo: string;
  descrizione: string;
  lingua: string;
  assorbitaIn: IdSituazione | null;
  gestitaIl: Date | null;
  archiviataIl: Date | null;
  creataIl: Date;
}

export interface Collegamento {
  id: string;
  utenteId: IdUtente;
  emailId: IdEmail;
  situazioneId: IdSituazione;
  origine: OrigineCollegamento;
  ruolo: RuoloCollegamento;
  stato: StatoCollegamento;
  confidenza: number | null;
  analisiId: IdAnalisi | null;
}

export interface Attivita {
  id: IdAttivita;
  utenteId: IdUtente;
  situazioneId: IdSituazione;
  emailSorgenteId: IdEmail;
  slot: number;
  descrizione: string;
  scadenza: Date | null;
  scadenzaCitazione: string | null;
  priorita: Priorita;
  urgente: boolean;
  base: Base;
  stato: StatoElemento;
  completataDa: "ai" | "utente" | null;
  emailCompletamentoId: IdEmail | null;
  completataIl: Date | null;
  evidenze: Evidenza[];
  analisiId: IdAnalisi | null;
  creataIl: Date;
}

/** Stato di un'Attesa come elemento proposto dall'AI; lo stato operativo è derivato. */
export type CicloAttesa = "proposta" | "confermata" | "scartata" | "superata";

export interface Attesa {
  id: IdAttesa;
  utenteId: IdUtente;
  situazioneId: IdSituazione;
  emailRichiestaId: IdEmail;
  slot: number;
  destinatari: Indirizzo[];
  oggetto: string;
  dataAttesa: Date | null;
  ciclo: CicloAttesa;
  base: Base;
  evidenze: Evidenza[];
  analisiId: IdAnalisi | null;
  creataIl: Date;
}

export interface Requisito {
  id: IdRequisito;
  attesaId: IdAttesa;
  descrizione: string;
  ordine: number;
}

export interface RispostaArrivata {
  id: IdRisposta;
  utenteId: IdUtente;
  attesaId: IdAttesa;
  emailId: IdEmail;
  origine: OrigineCollegamento;
  statoCollegamento: StatoCollegamento;
  confidenza: number | null;
  valutazione: Valutazione;
  /** Evidenze della risposta per ciascun requisito che dichiara soddisfatto. */
  requisitiSoddisfatti: { requisitoId: IdRequisito; evidenze: Evidenza[] }[];
  revisione: StatoRevisione;
  arrivataIl: Date;
  analisiId: IdAnalisi | null;
}

export const TIPI_SOGGETTO = ["situazione", "attivita", "attesa", "risposta", "email", "collegamento"] as const;
export type TipoSoggetto = (typeof TIPI_SOGGETTO)[number];

export interface Soggetto {
  tipo: TipoSoggetto;
  id: string;
}

export interface Correzione {
  id: string;
  utenteId: IdUtente;
  soggetto: Soggetto;
  campo: string;
  valore: unknown;
  valorePrecedente: unknown;
  creataIl: Date;
  revocataIl: Date | null;
}

export interface EventoSituazione {
  id: string;
  situazioneId: IdSituazione;
  attore: Attore;
  tipo: string;
  riferimenti: Record<string, string>;
  dettagli: string | null;
  creatoIl: Date;
}
