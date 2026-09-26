import type {
  Attesa,
  Attivita,
  Correzione,
  RispostaArrivata,
  Situazione,
  Soggetto,
} from "../src/dominio/entita";
import type { Evidenza } from "../src/dominio/tipi";

export const T0 = new Date("2026-09-01T09:00:00Z");

export function ore(n: number, da: Date = T0): Date {
  return new Date(da.getTime() + n * 3_600_000);
}

export function minuti(n: number, da: Date = T0): Date {
  return new Date(da.getTime() + n * 60_000);
}

let contatore = 0;

export function correzione(
  soggetto: Soggetto,
  campo: string,
  valore: unknown,
  altro: Partial<Correzione> = {},
): Correzione {
  contatore += 1;
  return {
    id: `c${String(contatore).padStart(4, "0")}`,
    utenteId: "u1",
    soggetto,
    campo,
    valore,
    valorePrecedente: null,
    creataIl: ore(contatore),
    revocataIl: null,
    ...altro,
  };
}

export function evidenza(verificata: boolean, emailId = "e-risposta"): Evidenza {
  return { emailId, citazione: "ecco i dati", inizio: verificata ? 0 : null, fine: verificata ? 10 : null, verificata };
}

export function attesa(altro: Partial<Attesa> = {}): Attesa {
  return {
    id: "w1",
    utenteId: "u1",
    situazioneId: "s1",
    emailRichiestaId: "e-richiesta",
    slot: 0,
    destinatari: [{ indirizzo: "marco@cliente.it" }],
    oggetto: "dati di agosto",
    dataAttesa: null,
    ciclo: "proposta",
    base: "rilevato",
    evidenze: [],
    analisiId: null,
    creataIl: T0,
    ...altro,
  };
}

export function risposta(altro: Partial<RispostaArrivata> = {}): RispostaArrivata {
  return {
    id: "r1",
    utenteId: "u1",
    attesaId: "w1",
    emailId: "e-risposta",
    origine: "ai",
    statoCollegamento: "proposto",
    confidenza: 0.9,
    valutazione: "completa",
    requisitiSoddisfatti: [],
    revisione: "da_vedere",
    arrivataIl: ore(24),
    analisiId: null,
    ...altro,
  };
}

export function attivita(altro: Partial<Attivita> = {}): Attivita {
  return {
    id: "t1",
    utenteId: "u1",
    situazioneId: "s1",
    emailSorgenteId: "e-origine",
    slot: 0,
    descrizione: "mandare il report",
    scadenza: null,
    scadenzaCitazione: null,
    priorita: "media",
    urgente: false,
    base: "rilevato",
    stato: "proposta",
    completataDa: null,
    emailCompletamentoId: null,
    completataIl: null,
    evidenze: [],
    analisiId: null,
    creataIl: T0,
    ...altro,
  };
}

export function situazione(altro: Partial<Situazione> = {}): Situazione {
  return {
    id: "s1",
    utenteId: "u1",
    emailOrigineId: "e-origine",
    titolo: "Report di agosto",
    descrizione: "",
    lingua: "it",
    assorbitaIn: null,
    gestitaIl: null,
    archiviataIl: null,
    creataIl: T0,
    ...altro,
  };
}
