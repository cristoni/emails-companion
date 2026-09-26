import "server-only";
import { impostazioni } from "@ec/db";
import { utenteCorrente } from "./sessione";
import { composizione } from "./composizione";

/** Lingua salvata nelle preferenze dell'utente, se c'è una sessione. */
export async function linguaDellUtente(): Promise<string | null> {
  const utente = await utenteCorrente().catch(() => null);
  if (!utente) return null;
  const { dip } = await composizione();
  const preferenze = await dip.unita.perUtente(utente.id, (ctx) => impostazioni.preferenze(ctx));
  return preferenze.lingua;
}
