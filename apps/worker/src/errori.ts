/**
 * Riduce un errore a codice e nome: i messaggi delle librerie esterne possono contenere
 * token, indirizzi o testo delle email e non devono arrivare nei log né in `last_error` dei job.
 */
export function serializzaErrore(errore: unknown): { codice: string; nome: string } {
  if (errore && typeof errore === "object") {
    const e = errore as { codice?: unknown; name?: unknown; code?: unknown };
    const codice = typeof e.codice === "string" ? e.codice : typeof e.code === "string" && /^[A-Z0-9_]{2,40}$/.test(e.code) ? e.code : "inatteso";
    return { codice, nome: typeof e.name === "string" ? e.name : "Error" };
  }
  return { codice: "inatteso", nome: "sconosciuto" };
}
