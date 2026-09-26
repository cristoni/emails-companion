/** Serializzazione JSON con chiavi ordinate: stessa struttura, stessa stringa. */
export function serializzazioneCanonica(valore: unknown): string {
  return JSON.stringify(ordina(valore));
}

function ordina(valore: unknown): unknown {
  if (valore instanceof Date) return valore.toISOString();
  if (Array.isArray(valore)) return valore.map(ordina);
  if (valore !== null && typeof valore === "object") {
    const risultato: Record<string, unknown> = {};
    for (const chiave of Object.keys(valore).sort()) {
      const v = (valore as Record<string, unknown>)[chiave];
      if (v !== undefined) risultato[chiave] = ordina(v);
    }
    return risultato;
  }
  return valore;
}
