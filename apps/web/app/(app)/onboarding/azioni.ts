"use server";

import { revalidatePath } from "next/cache";
import { accettaInformativa, decidiImportazioneImpostazioni, salvaChiaveOpenRouter, salvaContestoAi } from "@ec/applicazione";
import { eseguiAzione, leggiId, leggiTesto } from "@/lib/server/azioni";
import { comeUtente } from "@/lib/server/sessione";

/** Stesso limite delle impostazioni: un testo più lungo è rifiutato, mai tagliato in silenzio. */
const MASSIMO_CONTESTO = 20_000;

export type EsitoAzione = { esito: string } | undefined;

export async function accettaInformativaAzione(): Promise<EsitoAzione> {
  await comeUtente((ctx, dip) => accettaInformativa(dip, ctx));
  revalidatePath("/onboarding");
  return { esito: "ok" };
}

export async function salvaChiaveAzione(_: EsitoAzione, dati: FormData): Promise<EsitoAzione> {
  const chiave = String(dati.get("chiave") ?? "");
  const esito = await comeUtente((ctx, dip) => salvaChiaveOpenRouter(dip, ctx, chiave));
  revalidatePath("/onboarding");
  return { esito };
}

export async function salvaContestoAzione(_: EsitoAzione, dati: FormData): Promise<EsitoAzione> {
  return eseguiAzione(async () => {
    const testo = leggiTesto(dati, "contesto", MASSIMO_CONTESTO + 1);
    if (testo.length > MASSIMO_CONTESTO) return "troppo_lungo";
    if (!testo.trim()) return "vuoto";
    await comeUtente((ctx, dip) => salvaContestoAi(dip, ctx, testo));
    revalidatePath("/onboarding");
    return "ok";
  });
}

export async function decidiImportazioneAzione(dati: FormData): Promise<void> {
  const casellaId = leggiId(dati, "casella");
  const scelta = leggiTesto(dati, "scelta", 20) === "conferma" ? "conferma" : "rinvia";
  if (!casellaId) return;
  // Stesse verifiche delle impostazioni (casella dell'utente e in grado di leggere la posta); l'esito si vede dallo stato.
  await eseguiAzione(async () => comeUtente((ctx, dip) => decidiImportazioneImpostazioni(dip, ctx, casellaId, scelta)));
  revalidatePath("/onboarding");
  revalidatePath("/");
}
