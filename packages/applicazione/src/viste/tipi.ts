import type {
  Area,
  Attore,
  Base,
  Cartella,
  Categoria,
  CicloAttesa,
  Direzione,
  FaseImportazione,
  FonteLingua,
  FunzioneAI,
  Indirizzo,
  MotivoPausa,
  MotivoUrgenza,
  OrigineCollegamento,
  Priorita,
  RuoloCollegamento,
  StatoAttesa,
  StatoCasella,
  StatoCollegamento,
  StatoElemento,
  StatoFunzioneEmail,
  StatoRevisione,
  TipoSoggetto,
  Valutazione,
} from "@ec/core/dominio";
import type { CompatibilitaModello } from "@ec/core/porte";

/**
 * DTO delle viste: oggetti semplici e serializzabili (istanti come stringhe ISO 8601 UTC), con id e testo
 * già decifrato. Nessun campo può trasportare la chiave OpenRouter, token o valori cifrati.
 * I testi mostrati dall'interfaccia sono codici da tradurre, tranne i testi delle email e dell'AI.
 */
export type Istante = string;

export interface EvidenzaDto {
  emailId: string;
  citazione: string;
  inizio: number | null;
  fine: number | null;
  verificata: boolean;
}

/** Correzione attiva su un elemento: l'id serve all'annullamento. */
export interface CorrezioneDto {
  id: string;
  campo: string;
  valore: unknown;
  creataIl: Istante;
}

export type ProssimaAzioneDto =
  | {
      tipo: "rivedi_risposta";
      rispostaId: string;
      attesaId: string;
      emailId: string;
      oggettoAttesa: string;
      /** Valutazione effettiva; `valutazioneCorretta` dice se viene da una correzione dell'utente e non dall'AI. */
      valutazione: Valutazione;
      valutazioneCorretta: boolean;
    }
  | { tipo: "attivita"; attivitaId: string; descrizione: string; scadenza: Istante | null; priorita: Priorita }
  | { tipo: "sollecito"; attesaId: string; oggetto: string; destinatari: string[]; dataAttesa: Istante | null }
  | { tipo: "attendi"; attesaId: string; oggetto: string; destinatari: string[]; dataAttesa: Istante | null }
  | { tipo: "gestisci_urgenza"; motivo: MotivoUrgenza | null }
  | { tipo: "nessuna" };

export interface CardSituazione {
  id: string;
  titolo: string;
  lingua: string;
  areaPrincipale: Area;
  /** Altre aree in cui la Situazione rientrerebbe, in ordine di precedenza. */
  indicatori: Area[];
  urgente: boolean;
  motivoUrgenza: MotivoUrgenza | null;
  prossimaAzione: ProssimaAzioneDto;
  /** Badge "proposta AI": elementi o collegamenti non ancora confermati. */
  haProposte: boolean;
  scadenzaPiuVicina: Istante | null;
  /** Indirizzi delle Caselle collegate in cui si trovano le email della Situazione. */
  caselle: string[];
  ultimaAttivita: Istante;
}

export type Avviso =
  | { codice: "casella_da_ricollegare" | "permessi_incompleti"; casellaId: string; indirizzo: string }
  | { codice: "importazione_da_confermare"; casellaId: string; indirizzo: string; numeroEmail: number | null; costoStimato: number | null }
  | { codice: "analisi_in_pausa"; motivo: MotivoPausa; funzione: FunzioneAI | "*" }
  | { codice: "chiave_non_valida" | "credito_esaurito" | "consenso_mancante" };

export interface AvanzamentoDto {
  totale: number;
  acquisite: number;
  elenchiPendenti: number;
  lottiPendenti: number;
}

export interface ImportazioneDto {
  casellaId: string;
  indirizzo: string;
  fase: FaseImportazione;
  avanzamento: AvanzamentoDto | null;
  stima: { numeroEmail: number; costoStimato: number; calcolataIl: Istante } | null;
}

export interface VistaNewsDto {
  /** "Nessuna News nelle ultime 24 ore". */
  vuoto: boolean;
  generatoIl: Istante | null;
  /** Solo le voci le cui fonti sono tutte ancora incluse. */
  voci: { testo: string; emailIds: string[] }[];
  /** Email della finestra non ancora nel riepilogo. */
  nonIncluse: string[];
  /** Email incluse, dalla più recente, con accesso all'originale. */
  membri: { emailId: string; mittente: Indirizzo; oggetto: string; anteprima: string; ricevutaIl: Istante; casella: string | null; nelRiepilogo: boolean }[];
  /** Codice dell'ultimo errore del riepilogo. */
  errore: string | null;
}

export interface VistaHome {
  ora: Istante;
  /** Caselle collegate dall'utente: con una sola, la casella di provenienza non si ripete su ogni Situazione. */
  numeroCaselle: number;
  aree: Record<Area, CardSituazione[]>;
  avvisi: Avviso[];
  importazioni: ImportazioneDto[];
  news: VistaNewsDto;
}

// ── Dettaglio della Situazione ──

export interface AttivitaDto {
  id: string;
  emailSorgenteId: string;
  descrizione: string;
  scadenza: Istante | null;
  scadenzaCitazione: string | null;
  priorita: Priorita;
  urgente: boolean;
  base: Base;
  stato: StatoElemento;
  proposta: boolean;
  confermata: boolean;
  completata: boolean;
  completataDaAi: boolean;
  completataDa: "ai" | "utente" | null;
  completataIl: Istante | null;
  emailCompletamentoId: string | null;
  evidenze: EvidenzaDto[];
  analisiId: string | null;
  correzioni: CorrezioneDto[];
}

export interface RispostaDto {
  id: string;
  emailId: string;
  origine: OrigineCollegamento;
  statoCollegamento: StatoCollegamento;
  proposta: boolean;
  valutazione: Valutazione;
  valutazioneAi: Valutazione;
  revisione: StatoRevisione;
  arrivataIl: Istante;
  confidenza: number | null;
  motivazione: string | null;
  /** Evidenze della risposta per ogni requisito che dichiara soddisfatto. */
  requisiti: { requisitoId: string; evidenze: EvidenzaDto[] }[];
  analisiId: string | null;
  correzioni: CorrezioneDto[];
}

export interface AttesaDto {
  id: string;
  emailRichiestaId: string;
  oggetto: string;
  destinatari: Indirizzo[];
  dataAttesa: Istante | null;
  ciclo: CicloAttesa;
  proposta: boolean;
  confermata: boolean;
  base: Base;
  evidenze: EvidenzaDto[];
  analisiId: string | null;
  stato: StatoAttesa;
  chiusaDa: "ai" | "utente" | null;
  rispostaDiChiusura: string | null;
  /** Risposte con affermazioni dell'AI senza evidenza verificata: restano proposte. */
  daVerificare: string[];
  sollecitoConsigliato: boolean;
  requisiti: { id: string; descrizione: string; soddisfatto: boolean }[];
  risposte: RispostaDto[];
  correzioni: CorrezioneDto[];
}

export interface CollegamentoDto {
  id: string;
  emailId: string;
  origine: OrigineCollegamento;
  ruolo: RuoloCollegamento;
  stato: StatoCollegamento;
  confidenza: number | null;
  analisiId: string | null;
  correzioni: CorrezioneDto[];
}

export interface CopiaDto {
  casellaId: string;
  indirizzo: string;
  idConnettore: string;
  thread: string | null;
  cartelle: Cartella[];
  origineInvio: "app" | "esterna" | null;
  eliminataNelProvider: boolean;
  /** Costruito dalla webapp con il connettore: qui sempre null. */
  linkOriginale: string | null;
}

export interface FonteDto {
  emailId: string;
  direzione: Direzione;
  mittente: Indirizzo;
  destinatari: { a: Indirizzo[]; cc: Indirizzo[] };
  oggetto: string;
  anteprima: string;
  ricevutaIl: Istante;
  lingua: string;
  thread: string | null;
  caselle: CopiaDto[];
}

export interface PercheDto {
  soggetto: { tipo: TipoSoggetto | "classificazione"; id: string };
  analisiId: string;
  funzione: FunzioneAI;
  modelloRichiesto: string;
  modelloServito: string | null;
  contestoAiVersione: number | null;
  completataIl: Istante | null;
}

export interface EventoDto {
  id: string;
  attore: Attore;
  tipo: string;
  riferimenti: Record<string, string>;
  creatoIl: Istante;
}

export interface VistaSituazioneDto {
  id: string;
  /** Id richiesto se diverso: la Situazione è stata assorbita in questa. */
  reindirizzataDa: string | null;
  situazione: {
    id: string;
    titolo: string;
    descrizione: string;
    lingua: string;
    emailOrigineId: string;
    creataIl: Istante;
    ultimaAttivita: Istante;
    gestitaIl: Istante | null;
    archiviata: boolean;
    analisiId: string | null;
    correzioni: CorrezioneDto[];
  };
  stato: {
    attiva: boolean;
    archiviata: boolean;
    aree: Area[];
    areaPrincipale: Area | null;
    urgente: boolean;
    motivoUrgenza: MotivoUrgenza | null;
    haProposte: boolean;
    scadenzaPiuVicina: Istante | null;
    prioritaMassima: Priorita | null;
  };
  prossimaAzione: ProssimaAzioneDto;
  attivita: AttivitaDto[];
  attese: AttesaDto[];
  collegamenti: CollegamentoDto[];
  fonti: FonteDto[];
  perche: PercheDto[];
  eventi: EventoDto[];
}

// ── Posta ──

export type StatoAnalisiEmail = "da_analizzare" | "in_pausa" | "errore" | "analizzata" | "non_prevista";

export interface VoceEmailDto {
  id: string;
  direzione: Direzione;
  mittente: Indirizzo;
  destinatari: Indirizzo[];
  oggetto: string;
  anteprima: string;
  ricevutaIl: Istante;
  lingua: string;
  categoria: Categoria | null;
  urgente: boolean;
  allegati: string[];
  caselle: { casellaId: string; indirizzo: string }[];
  analisi: StatoAnalisiEmail;
}

export interface ElencoPostaDto {
  email: VoceEmailDto[];
  /** Da passare come `prima` per la pagina successiva; null se non ce ne sono altre. */
  cursore: string | null;
}

export interface VistaEmailDto {
  id: string;
  direzione: Direzione;
  mittente: Indirizzo;
  a: Indirizzo[];
  cc: Indirizzo[];
  replyTo: Indirizzo[];
  oggetto: string;
  testo: string;
  ricevutaIl: Istante;
  allegati: string[];
  soloPerRisposte: boolean;
  lingua: { valore: string; fonte: FonteLingua; corretta: boolean };
  classificazione: {
    categoria: Categoria;
    categoriaAi: Categoria;
    urgente: boolean;
    urgenteAi: boolean;
    priorita: Priorita;
    prioritaAi: Priorita;
    baseUrgenza: Base;
    motivazione: string;
    evidenze: EvidenzaDto[];
    analisiId: string | null;
  } | null;
  /** Correzioni attive sull'email (categoria, urgenza, lingua…). */
  correzioni: CorrezioneDto[];
  copie: CopiaDto[];
  situazioni: {
    situazioneId: string;
    titolo: string;
    collegamentoId: string | null;
    ruolo: RuoloCollegamento | null;
    origine: OrigineCollegamento | null;
    stato: StatoCollegamento | null;
    /** true se l'email ha originato la Situazione. */
    origineDellaSituazione: boolean;
  }[];
  analisi: { funzione: FunzioneAI; stato: StatoFunzioneEmail; motivo: string | null }[];
  perche: PercheDto[];
}

// ── Stato e impostazioni ──

export interface VistaStatoDto {
  ora: Istante;
  caselle: {
    casellaId: string;
    indirizzo: string;
    stato: StatoCasella;
    ultimaSyncOk: Istante | null;
    /** ora − ultima sincronizzazione riuscita. */
    ritardoMs: number | null;
    faseImportazione: FaseImportazione | null;
    avanzamento: AvanzamentoDto | null;
    erroreSincronizzazione: string | null;
    erroriConsecutivi: number;
    prossimoTentativo: Istante | null;
    erroreCasella: string | null;
  }[];
  analisi: { daEseguire: number; inPausa: number; errore: number };
  /** `dal` è null per la pausa manuale, che non registra l'istante. */
  pause: { funzione: FunzioneAI | "*"; motivo: MotivoPausa; dal: Istante | null; prossimaVerifica: Istante | null }[];
  erroriRecenti: { analisiId: string | null; funzione: FunzioneAI; emailId: string | null; codice: string; il: Istante }[];
  elaborazione: {
    riconciliazioneErrori: number;
    riconciliazioneErrore: string | null;
    newsErrori: number;
    newsErrore: string | null;
  } | null;
}

export interface VistaImpostazioniDto {
  caselle: {
    id: string;
    indirizzo: string;
    connettore: string;
    stato: StatoCasella;
    lettura: boolean;
    invio: boolean;
    faseImportazione: FaseImportazione | null;
    collegataIl: Istante;
  }[];
  /** Solo informazioni: il valore della chiave non esce mai dal server. */
  chiave: { stato: string; ultimeCifre: string; etichetta: string | null; limiteResiduo: number | null; verificataIl: Istante | null } | null;
  modelli: { funzione: FunzioneAI; etichetta: string; descrizione: string; modello: string; predefinito: string; stato: CompatibilitaModello; verificataIl: Istante | null }[];
  contestoAi: { corrente: number | null; versioni: { numero: number; creatoIl: Istante; testo: string }[] };
  preferenze: { lingua: string; tema: string; fusoOrario: string; pausaManuale: boolean };
  consumo: { funzione: string; invocazioni: number; costo: number; tokenIngresso: number; tokenUscita: number }[];
  consenso: { versione: string; accettato: boolean };
}
