export type CodiceErroreCassaforte =
  | "contesto_non_valido"
  | "formato_non_supportato"
  | "decifratura_fallita"
  | "chiave_utente_assente"
  | "chiave_utente_non_valida"
  | "versione_chiave_principale_sconosciuta";

/** Il messaggio è solo il codice: mai testo, contesto o materiale di chiave. */
export class ErroreCassaforte extends Error {
  readonly codice: CodiceErroreCassaforte;

  constructor(codice: CodiceErroreCassaforte) {
    super(codice);
    this.name = "ErroreCassaforte";
    this.codice = codice;
  }
}

export type CodiceErroreConfigurazioneChiavi =
  | "variabile_mancante"
  | "chiave_non_valida"
  | "versione_non_valida"
  | "versione_attiva_senza_chiave"
  | "chiavi_non_distinte";

/** Nomina la voce di configurazione, mai il suo valore. */
export class ErroreConfigurazioneChiavi extends Error {
  readonly codice: CodiceErroreConfigurazioneChiavi;
  readonly voce: string;

  constructor(codice: CodiceErroreConfigurazioneChiavi, voce: string) {
    super(`${codice}: ${voce}`);
    this.name = "ErroreConfigurazioneChiavi";
    this.codice = codice;
    this.voce = voce;
  }
}
