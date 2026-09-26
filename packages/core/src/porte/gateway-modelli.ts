import type { FunzioneAI } from "../dominio/tipi";

export interface RichiestaModello {
  funzione: FunzioneAI;
  modello: string;
  chiave: string;
  /** Livello di sistema: garanzie, compito della funzione, lingua di output. */
  sistema: string;
  /** Contesto AI dell'utente o Direttive predefinite. */
  direttive: string;
  /** Dati non fidati (email in JSON dentro delimitatori). */
  dati: string;
  nomeSchema: string;
  schema: Record<string, unknown>;
  maxTokenUscita: number;
}

export interface UtilizzoModello {
  modelloServito: string;
  fornitore: string | null;
  tokenIngresso: number;
  tokenUscita: number;
  costo: number | null;
  idGenerazione: string | null;
  latenzaMs: number;
}

export const CODICI_ERRORE_MODELLO = [
  "chiave_non_valida",
  "credito_esaurito",
  "limite_chiave",
  "budget_in_volo",
  "moderazione",
  "modello_incompatibile",
  "temporaneo",
  "timeout",
  "risposta_non_valida",
] as const;
export type CodiceErroreModello = (typeof CODICI_ERRORE_MODELLO)[number];

export type EsitoModello =
  | { ok: true; output: unknown; utilizzo: UtilizzoModello }
  | { ok: false; codice: CodiceErroreModello; riprovaDopoMs: number | null; utilizzo: UtilizzoModello | null };

export type StatoChiave =
  | { stato: "valida"; etichetta: string | null; limiteResiduo: number | null }
  | { stato: "non_valida" }
  | { stato: "credito_esaurito" }
  | { stato: "errore_temporaneo" };

export type CompatibilitaModello = "ok" | "incompatibile" | "non_disponibile";

export interface PrezziModello {
  ingressoPerToken: number;
  uscitaPerToken: number;
}

export interface GatewayModelli {
  invoca(richiesta: RichiestaModello): Promise<EsitoModello>;
  verificaChiave(chiave: string): Promise<StatoChiave>;
  /** Compatibile se supporta output strutturato e ha almeno un endpoint a conservazione zero. */
  verificaModello(modello: string): Promise<CompatibilitaModello>;
  prezzi(modello: string): Promise<PrezziModello | null>;
}
