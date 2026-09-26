import type { FunzioneAI, IdCasella, IdEmail, IdInvio, IdUtente } from "../dominio/tipi";

/** Payload dei job: solo identificativi, mai contenuti. */
export interface PayloadJob {
  pianifica_sincronizzazioni: Record<string, never>;
  sincronizza_casella: { casellaId: IdCasella };
  stima_importazione: { casellaId: IdCasella };
  importa_pagina: { casellaId: IdCasella; tipo: "ricevute" | "inviate"; paginaDa?: string };
  recupera_risposte: { casellaId: IdCasella; attesaId: string };
  analizza_email: { emailId: IdEmail };
  riconcilia_utente: { utenteId: IdUtente };
  aggiorna_riepilogo_news: { utenteId: IdUtente };
  genera_bozza: { utenteId: IdUtente; bozzaId: string; richiestaId: string };
  invia_email: { invioId: IdInvio };
  verifica_invio: { invioId: IdInvio };
  rinnova_watch_e_alias: { casellaId: IdCasella };
  verifica_chiave: { utenteId: IdUtente };
  verifica_modelli: { utenteId: IdUtente; funzione?: FunzioneAI };
  rianalizza: { utenteId: IdUtente; richiestaId: string };
  scollega_casella: { casellaId: IdCasella };
  elimina_account: { utenteId: IdUtente };
  sweeper_invii: Record<string, never>;
  pulizia: Record<string, never>;
}

export type NomeJob = keyof PayloadJob;

export const NOMI_JOB = [
  "pianifica_sincronizzazioni",
  "sincronizza_casella",
  "stima_importazione",
  "importa_pagina",
  "recupera_risposte",
  "analizza_email",
  "riconcilia_utente",
  "aggiorna_riepilogo_news",
  "genera_bozza",
  "invia_email",
  "verifica_invio",
  "rinnova_watch_e_alias",
  "verifica_chiave",
  "verifica_modelli",
  "rianalizza",
  "scollega_casella",
  "elimina_account",
  "sweeper_invii",
  "pulizia",
] as const satisfies readonly NomeJob[];

export interface OpzioniJob {
  chiave?: string;
  modalitaChiave?: "replace" | "preserve_run_at";
  coda?: string;
  esegui?: Date;
  priorita?: number;
  tentativiMassimi?: number;
}

/** Coda legata alla transazione corrente: il job esiste solo se la transazione va a buon fine. */
export interface CodaJob {
  accoda<N extends NomeJob>(nome: N, payload: PayloadJob[N], opzioni?: OpzioniJob): Promise<void>;
}
