"use server";

import { revalidatePath } from "next/cache";
import { accettaInformativa, confermaImportazione, rifiutaImportazione, salvaChiaveOpenRouter, salvaContestoAi } from "@ec/applicazione";
import { comeUtente } from "@/lib/server/sessione";

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
  const testo = String(dati.get("contesto") ?? "").slice(0, 20_000);
  if (!testo.trim()) return { esito: "vuoto" };
  await comeUtente((ctx, dip) => salvaContestoAi(dip, ctx, testo));
  revalidatePath("/onboarding");
  return { esito: "ok" };
}

export async function decidiImportazioneAzione(dati: FormData): Promise<void> {
  const casellaId = String(dati.get("casella") ?? "");
  const scelta = String(dati.get("scelta") ?? "");
  await comeUtente((ctx, dip) => (scelta === "conferma" ? confermaImportazione(dip, ctx, casellaId) : rifiutaImportazione(dip, ctx, casellaId)));
  revalidatePath("/onboarding");
  revalidatePath("/");
}
