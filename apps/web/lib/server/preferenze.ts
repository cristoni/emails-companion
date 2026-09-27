import "server-only";
import { cache } from "react";
import { impostazioni } from "@ec/db";
import { utenteCorrente } from "./sessione";
import { composizione } from "./composizione";

/** Lingua, fuso e tema salvati nelle preferenze dell'utente, se c'è una sessione; una lettura per richiesta. */
export const preferenzeDellUtente = cache(async (): Promise<{ lingua: string; fusoOrario: string; tema: "system" | "light" | "dark" } | null> => {
  const utente = await utenteCorrente().catch(() => null);
  if (!utente) return null;
  const { dip } = await composizione();
  const preferenze = await dip.unita.perUtente(utente.id, (ctx) => impostazioni.preferenze(ctx));
  const tema = preferenze.tema === "light" || preferenze.tema === "dark" ? preferenze.tema : "system";
  return { lingua: preferenze.lingua, fusoOrario: preferenze.fusoOrario, tema };
});

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
