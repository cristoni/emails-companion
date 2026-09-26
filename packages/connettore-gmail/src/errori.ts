import { GaxiosError } from "gaxios";
import { ErroreConnettore, type CodiceErroreConnettore } from "@ec/core";

const MOTIVI_FREQUENZA = new Set(["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "RATE_LIMIT_EXCEEDED"]);

interface Classificazione {
  errore: ErroreConnettore;
  ritentabile: boolean;
}

type Oggetto = Record<string, unknown>;

function oggetto(valore: unknown): Oggetto | undefined {
  return typeof valore === "object" && valore !== null ? (valore as Oggetto) : undefined;
}

function motivi(data: Oggetto | undefined): string[] {
  const errore = oggetto(data?.["error"]);
  const voci = [errore?.["errors"], errore?.["details"]].flatMap((v) => (Array.isArray(v) ? v : []));
  return voci.flatMap((v) => {
    const motivo = oggetto(v)?.["reason"];
    return typeof motivo === "string" ? [motivo] : [];
  });
}

function riprovaDopoMs(intestazioni: unknown): number | null {
  const valore =
    intestazioni instanceof Headers ? intestazioni.get("retry-after") : oggetto(intestazioni)?.["retry-after"];
  const secondi = typeof valore === "string" && valore.trim() !== "" ? Number(valore) : Number.NaN;
  return Number.isFinite(secondi) && secondi >= 0 ? secondi * 1000 : null;
}

function statusHttp(errore: unknown): number | undefined {
  const e = oggetto(errore);
  const status = oggetto(e?.["response"])?.["status"] ?? e?.["status"];
  return typeof status === "number" ? status : undefined;
}

function classifica(errore: unknown): Classificazione {
  const esito = (codice: CodiceErroreConnettore, ritentabile = false, ritardo: number | null = null) => ({
    errore: new ErroreConnettore(codice, ritardo),
    ritentabile,
  });

  if (errore instanceof ErroreConnettore) {
    return { errore, ritentabile: errore.codice === "temporaneo" || errore.codice === "limite_frequenza" };
  }
  const risposta = oggetto(oggetto(errore)?.["response"]);
  const data = oggetto(risposta?.["data"]);
  const status = statusHttp(errore);

  if (data?.["error"] === "invalid_grant" || (errore instanceof Error && errore.message === "invalid_grant")) {
    return esito("autorizzazione_revocata");
  }
  if (status === undefined) {
    return esito("temporaneo", errore instanceof GaxiosError);
  }
  if (status === 401) return esito("autorizzazione_revocata");
  if (status === 403) {
    return motivi(data).some((m) => MOTIVI_FREQUENZA.has(m))
      ? esito("limite_frequenza", true, riprovaDopoMs(risposta?.["headers"]))
      : esito("permessi_insufficienti");
  }
  if (status === 429) return esito("limite_frequenza", true, riprovaDopoMs(risposta?.["headers"]));
  if (status === 404) return esito("non_trovato");
  return esito("temporaneo", status === 408 || status >= 500);
}

/** Riduce qualsiasi errore a un codice: il testo del provider non viene mai conservato. */
export function erroreConnettore(errore: unknown): ErroreConnettore {
  return classifica(errore).errore;
}

/**
 * Vero se la richiesta può essere arrivata al provider senza che ne conosciamo l'esito:
 * nessuna risposta HTTP (timeout, interruzione, connessione caduta) oppure un errore del server.
 */
export function esitoIgnoto(errore: unknown): boolean {
  if (errore instanceof ErroreConnettore) return false;
  const status = statusHttp(errore);
  return status === undefined ? errore instanceof GaxiosError : status >= 500;
}

export interface OpzioniRitentativi {
  tentativi?: number;
  baseMs?: number;
  /** Oltre questa attesa l'errore torna al chiamante, che ripianifica il lavoro. */
  massimaAttesaMs?: number;
  attesa?: (ms: number) => Promise<void>;
  casuale?: () => number;
}

export const attendi = (ms: number) => new Promise<void>((risolvi) => setTimeout(risolvi, ms));

/** Esegue un'operazione idempotente riprovando su limiti di frequenza ed errori temporanei. */
export async function conRitentativi<T>(operazione: () => Promise<T>, opzioni: OpzioniRitentativi = {}): Promise<T> {
  const { tentativi = 3, baseMs = 1000, massimaAttesaMs = 30_000, attesa = attendi, casuale = Math.random } = opzioni;
  for (let tentativo = 1; ; tentativo++) {
    try {
      return await operazione();
    } catch (causa) {
      const { errore, ritentabile } = classifica(causa);
      if (!ritentabile || tentativo >= tentativi) throw errore;
      const base = baseMs * 2 ** (tentativo - 1);
      const ritardo = Math.max(errore.riprovaDopoMs ?? 0, Math.round(base * (1 + casuale())));
      if (ritardo > massimaAttesaMs) throw errore;
      await attesa(ritardo);
    }
  }
}
