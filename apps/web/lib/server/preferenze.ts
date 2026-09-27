import "server-only";
import { impostazioni } from "@ec/db";
import { utenteCorrente } from "./sessione";
import { composizione } from "./composizione";

/** Lingua e fuso salvati nelle preferenze dell'utente, se c'è una sessione. */
export async function preferenzeDellUtente(): Promise<{ lingua: string; fusoOrario: string } | null> {
  const utente = await utenteCorrente().catch(() => null);
  if (!utente) return null;
  const { dip } = await composizione();
  const preferenze = await dip.unita.perUtente(utente.id, (ctx) => impostazioni.preferenze(ctx));
  return { lingua: preferenze.lingua, fusoOrario: preferenze.fusoOrario };
}

/** Fuso IANA valido, altrimenti UTC: un valore non riconosciuto non deve rompere la formattazione. */
export function fusoValido(fuso: string | null | undefined): string {
  if (!fuso) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: fuso });
    return fuso;
  } catch {
    return "UTC";
  }
}
