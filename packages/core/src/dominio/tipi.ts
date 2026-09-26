/**
 * Vocabolario del dominio (CONTEXT.md). I valori sono in chiaro e decifrati:
 * cifratura e indici ciechi appartengono all'infrastruttura.
 */

export type IdUtente = string;
export type IdCasella = string;
export type IdEmail = string;
export type IdCopia = string;
export type IdSituazione = string;
export type IdAttivita = string;
export type IdAttesa = string;
export type IdRequisito = string;
export type IdRisposta = string;
export type IdAnalisi = string;
export type IdBozza = string;
export type IdInvio = string;

export const DIREZIONI = ["entrata", "uscita", "interna"] as const;
export type Direzione = (typeof DIREZIONI)[number];

export const CARTELLE = ["in_arrivo", "inviata", "spam", "cestino", "bozza", "chat", "archiviata"] as const;
export type Cartella = (typeof CARTELLE)[number];

/** Cartelle le cui copie non vengono mai analizzate. */
export const CARTELLE_ESCLUSE: readonly Cartella[] = ["spam", "cestino", "bozza", "chat"];

export const STATI_CASELLA = [
  "collegata",
  "permessi_incompleti",
  "da_ricollegare",
  "scollegamento_in_corso",
  "scollegata",
] as const;
export type StatoCasella = (typeof STATI_CASELLA)[number];

export const FASI_IMPORTAZIONE = [
  "da_stimare",
  "stimata",
  "confermata",
  "rifiutata",
  "in_corso",
  "completata",
  "errore",
] as const;
export type FaseImportazione = (typeof FASI_IMPORTAZIONE)[number];

export const CATEGORIE = ["news", "operativa", "informativa"] as const;
export type Categoria = (typeof CATEGORIE)[number];

export const PRIORITA = ["alta", "media", "bassa"] as const;
export type Priorita = (typeof PRIORITA)[number];

export const BASI = ["rilevato", "dedotto"] as const;
export type Base = (typeof BASI)[number];

export const ORIGINI_COLLEGAMENTO = ["thread", "intestazioni", "invio_app", "ai", "utente"] as const;
export type OrigineCollegamento = (typeof ORIGINI_COLLEGAMENTO)[number];

export const RUOLI_COLLEGAMENTO = ["origine", "risposta", "sollecito", "contesto"] as const;
export type RuoloCollegamento = (typeof RUOLI_COLLEGAMENTO)[number];

export const STATI_COLLEGAMENTO = ["proposto", "confermato", "rifiutato"] as const;
export type StatoCollegamento = (typeof STATI_COLLEGAMENTO)[number];

export const STATI_ELEMENTO = ["proposta", "confermata", "completata", "scartata", "superata"] as const;
/** Stato di un'Attività come prodotto dall'AI o dal riconciliatore. */
export type StatoElemento = (typeof STATI_ELEMENTO)[number];

export const VALUTAZIONI = ["completa", "parziale", "non_pertinente"] as const;
export type Valutazione = (typeof VALUTAZIONI)[number];

export const STATI_REVISIONE = ["da_vedere", "vista"] as const;
export type StatoRevisione = (typeof STATI_REVISIONE)[number];

export const STATI_ATTESA = ["aperta", "parziale", "soddisfatta", "annullata"] as const;
/** Stato derivato di un'Attesa (mai memorizzato). */
export type StatoAttesa = (typeof STATI_ATTESA)[number];

export const AREE = ["urgente", "risposte_arrivate", "da_fare", "in_attesa"] as const;
/** Aree operative in ordine di precedenza. */
export type Area = (typeof AREE)[number];

export const ATTORI = ["ai", "utente", "sistema"] as const;
export type Attore = (typeof ATTORI)[number];

/** Chiavi del registro delle Funzioni AI (PROJECT.md §4.4). */
export const FUNZIONI_AI = [
  "classificazione_priorita",
  "estrazione_attivita",
  "attese_risposte",
  "riepilogo_news",
  "bozze_assistite",
] as const;
export type FunzioneAI = (typeof FUNZIONI_AI)[number];

export const MODELLO_PREDEFINITO = "openai/gpt-6-luna";

export const STATI_FUNZIONE_EMAIL = ["da_eseguire", "in_pausa", "eseguita", "non_necessaria", "errore"] as const;
export type StatoFunzioneEmail = (typeof STATI_FUNZIONE_EMAIL)[number];

export const MOTIVI_PAUSA = [
  "consenso_mancante",
  "chiave_mancante",
  "chiave_non_valida",
  "credito_esaurito",
  "modello_incompatibile",
  "modello_non_disponibile",
  "pausa_manuale",
] as const;
export type MotivoPausa = (typeof MOTIVI_PAUSA)[number];

export const STATI_BOZZA = ["modificabile", "in_invio", "inviata"] as const;
export type StatoBozza = (typeof STATI_BOZZA)[number];

export const STATI_INVIO = ["confermato", "in_invio", "inviato", "fallito", "esito_incerto", "annullato"] as const;
export type StatoInvio = (typeof STATI_INVIO)[number];

/** Stati di invio che bloccano un nuovo invio della stessa bozza. */
export const STATI_INVIO_ATTIVI: readonly StatoInvio[] = ["confermato", "in_invio", "inviato", "esito_incerto"];

export interface Indirizzo {
  nome?: string;
  indirizzo: string;
}

/** Evidenza: citazione letterale di un'Email, con l'intervallo nel testo normalizzato. */
export interface Evidenza {
  emailId: IdEmail;
  citazione: string;
  inizio: number | null;
  fine: number | null;
  verificata: boolean;
}

/** Affermazione dell'AI su un campo, con base ed evidenze. */
export interface Affermazione<T> {
  valore: T;
  base: Base;
  motivazione?: string;
  evidenze: Evidenza[];
}
