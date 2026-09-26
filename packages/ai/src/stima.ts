import type { FunzioneAI } from "@ec/core/dominio";
import type { PrezziModello } from "@ec/core/porte";
import { ErroreAI } from "./errori";

/** Medie iniziali per email: prompt di sistema, direttive ed email; uscita compresi i token di ragionamento. */
export const TOKEN_MEDI_INGRESSO = 3000;
export const TOKEN_MEDI_USCITA = 800;

export interface InputStima {
  numeroEmail: number;
  funzioni: readonly FunzioneAI[];
  prezzi: Partial<Record<FunzioneAI, PrezziModello>>;
  tokenMediIngresso?: number;
  tokenMediUscita?: number;
}

export interface VoceStima {
  funzione: FunzioneAI;
  tokenIngresso: number;
  tokenUscita: number;
  /** null se il prezzo del modello della funzione non è noto. */
  costo: number | null;
}

export interface Stima {
  /** Somma delle sole voci con prezzo noto. */
  costoStimato: number;
  dettaglio: VoceStima[];
  prezziMancanti: FunzioneAI[];
}

export function stimaCosto(input: InputStima): Stima {
  const { numeroEmail, tokenMediIngresso = TOKEN_MEDI_INGRESSO, tokenMediUscita = TOKEN_MEDI_USCITA } = input;
  if (![numeroEmail, tokenMediIngresso, tokenMediUscita].every((n) => Number.isFinite(n) && n >= 0)) {
    throw new ErroreAI("parametro_non_valido");
  }
  const dettaglio = [...new Set(input.funzioni)].map((funzione): VoceStima => {
    const tokenIngresso = numeroEmail * tokenMediIngresso;
    const tokenUscita = numeroEmail * tokenMediUscita;
    const prezzi = input.prezzi[funzione];
    const costo = prezzi ? tokenIngresso * prezzi.ingressoPerToken + tokenUscita * prezzi.uscitaPerToken : null;
    return { funzione, tokenIngresso, tokenUscita, costo };
  });
  return {
    costoStimato: dettaglio.reduce((totale, v) => totale + (v.costo ?? 0), 0),
    dettaglio,
    prezziMancanti: dettaglio.filter((v) => v.costo === null).map((v) => v.funzione),
  };
}
