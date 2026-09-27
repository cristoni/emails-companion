import "server-only";
import type { StatoAzione } from "@/components/comuni/modulo-azione";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Testo da un FormData, tagliato alla lunghezza massima: mai fidarsi della dimensione inviata dal browser. */
export function leggiTesto(dati: FormData, nome: string, massimo = 1000): string {
  const valore = dati.get(nome);
  return typeof valore === "string" ? valore.slice(0, massimo) : "";
}

/** Id da un FormData: null se non è un UUID, così un valore malformato non arriva al database. */
export function leggiId(dati: FormData, nome: string): string | null {
  const valore = leggiTesto(dati, nome, 64).trim();
  return UUID.test(valore) ? valore : null;
}

function erroreDiNext(errore: unknown): boolean {
  if (!errore || typeof errore !== "object" || !("digest" in errore)) return false;
  const digest = (errore as { digest: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/**
 * Esegue il corpo di una Server Action restituendo solo un codice d'esito. Un errore inatteso diventa
 * `errore` senza dettagli: messaggi di librerie e dati dell'utente non arrivano al browser né ai log.
 * `redirect()` e `notFound()` di Next vengono rilanciati.
 */
export async function eseguiAzione(corpo: () => Promise<string>): Promise<StatoAzione> {
  try {
    return { esito: await corpo() };
  } catch (errore) {
    if (erroreDiNext(errore)) throw errore;
    const codice = errore && typeof errore === "object" && "codice" in errore ? String((errore as { codice: unknown }).codice) : "sconosciuto";
    console.error(JSON.stringify({ evento: "azione_fallita", codice }));
    return { esito: "errore" };
  }
}
