export const CODICI_ERRORE_AI = ["parametro_non_valido", "catalogo_non_disponibile", "schema_non_supportato"] as const;
export type CodiceErroreAI = (typeof CODICI_ERRORE_AI)[number];

/** Porta solo un codice: mai valori ricevuti, corpi di risposta o chiavi. */
export class ErroreAI extends Error {
  readonly codice: CodiceErroreAI;

  constructor(codice: CodiceErroreAI) {
    super(codice);
    this.name = "ErroreAI";
    this.codice = codice;
  }
}
