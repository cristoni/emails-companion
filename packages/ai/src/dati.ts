import type { Direzione, FunzioneAI, Priorita } from "@ec/core/dominio";

/**
 * Forma del livello "dati" per ogni Funzione AI: è il contratto descritto nei prompt.
 * Gli alias seguono PROJECT.md: e1 è sempre l'email in esame, e2… il contesto.
 */
export interface EmailPerModello {
  alias: string;
  direzione: Direzione;
  mittente: string;
  destinatari: string[];
  cc: string[];
  oggetto: string;
  /** ISO 8601 con offset, nel fuso dell'utente. */
  data: string;
  lingua: string;
  testo: string;
  /** Solo i nomi dei file. */
  allegati: string[];
}

export interface ElementoEsistentePerModello {
  alias: string;
  descrizione: string;
  scadenza_iso: string | null;
  priorita: Priorita;
  urgente: boolean;
}

export interface RequisitoPerModello {
  alias: string;
  descrizione: string;
  soddisfatto: boolean;
}

export interface AttesaEsistentePerModello {
  alias: string;
  destinatari: string[];
  oggetto: string;
  data_attesa_iso: string | null;
  requisiti: RequisitoPerModello[];
}

export interface AttesaCandidataPerModello extends AttesaEsistentePerModello {
  situazione: string | null;
  email_richiesta: string;
}

export interface SituazionePerModello {
  alias: string;
  titolo: string;
  descrizione: string;
  email: string[];
}

export interface AttivitaCandidataPerModello {
  alias: string;
  email_sorgente: string;
  descrizione: string;
  scadenza_iso: string | null;
}

export interface DatiClassificazione {
  email: EmailPerModello;
}

export interface DatiEstrazione {
  email: EmailPerModello;
  contesto: EmailPerModello[];
  elementi_esistenti: ElementoEsistentePerModello[];
}

export interface DatiAtteseRisposte {
  email: EmailPerModello;
  contesto: EmailPerModello[];
  attese_esistenti: AttesaEsistentePerModello[];
  situazioni_candidate: SituazionePerModello[];
  attese_candidate: AttesaCandidataPerModello[];
  attivita_candidate: AttivitaCandidataPerModello[];
}

export interface DatiRiepilogoNews {
  email: EmailPerModello[];
}

export interface DatiBozza {
  tipo: "risposta" | "sollecito";
  email: EmailPerModello;
  contesto: EmailPerModello[];
  attesa: AttesaEsistentePerModello | null;
}

export interface DatiPerFunzione {
  classificazione_priorita: DatiClassificazione;
  estrazione_attivita: DatiEstrazione;
  attese_risposte: DatiAtteseRisposte;
  riepilogo_news: DatiRiepilogoNews;
  bozze_assistite: DatiBozza;
}

export type DatiFunzione<F extends FunzioneAI> = DatiPerFunzione[F];
