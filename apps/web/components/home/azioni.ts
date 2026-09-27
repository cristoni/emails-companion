"use server";

import { revalidatePath } from "next/cache";
import {
  aggiornaOra,
  aggiornaPreferenze,
  annullaSpostamentoDalleNews,
  cambiaCategoria,
  confermaImportazione,
  rifiutaImportazione,
} from "@ec/applicazione";
import type { StatoAzione } from "@/components/comuni/modulo-azione";
import { eseguiAzione, leggiId, leggiTesto } from "@/lib/server/azioni";
import { comeUtente } from "@/lib/server/sessione";

/**
 * Server Action della home e della pagina `/news`. Ognuna rilegge la sessione con `comeUtente`, valida
 * l'input, chiama un caso d'uso e restituisce solo un codice d'esito.
 */

/** Categorie verso cui "Sposta fuori dalle News" può portare un'email. */
const CATEGORIE_FUORI_DALLE_NEWS = new Set(["operativa", "informativa"] as const);
type CategoriaFuoriDalleNews = "operativa" | "informativa";

function aggiornaViste(): void {
  revalidatePath("/");
  revalidatePath("/news");
}

/** Conferma dell'Importazione iniziale di una casella, dopo che l'utente ha visto numero di email e costo stimato. */
export async function confermaImportazioneAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const casellaId = leggiId(dati, "casella");
    if (!casellaId) return "non_valido";
    const avviata = await comeUtente((ctx, dip) => confermaImportazione(dip, ctx, casellaId));
    aggiornaViste();
    revalidatePath("/status");
    return avviata ? "ok" : "gia_decisa";
  });
}

/** "Più tardi": rinvia l'Importazione iniziale; si può confermare in seguito dalle impostazioni. */
export async function rinviaImportazioneAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const casellaId = leggiId(dati, "casella");
    if (!casellaId) return "non_valido";
    const rinviata = await comeUtente((ctx, dip) => rifiutaImportazione(dip, ctx, casellaId));
    aggiornaViste();
    revalidatePath("/status");
    return rinviata ? "ok" : "gia_decisa";
  });
}

/** Riprende l'analisi messa in pausa manualmente dall'utente. */
export async function riprendiAnalisiAzione(): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    await comeUtente((ctx, dip) => aggiornaPreferenze(dip, ctx, { pausaManuale: false }));
    aggiornaViste();
    revalidatePath("/settings");
    revalidatePath("/status");
    return "ok";
  });
}

/** "Aggiorna" del Riepilogo News: accoda subito la rigenerazione (il worker la esegue). */
export async function aggiornaRiepilogoAzione(): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    await comeUtente((ctx, dip) => aggiornaOra(dip, ctx));
    aggiornaViste();
    return "ok";
  });
}

/** "Sposta fuori dalle News": correzione della categoria verso `operativa` o `informativa`. */
export async function spostaFuoriDalleNewsAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const emailId = leggiId(dati, "email");
    const categoria = leggiTesto(dati, "categoria", 20);
    if (!emailId || !CATEGORIE_FUORI_DALLE_NEWS.has(categoria as CategoriaFuoriDalleNews)) return "non_valido";
    const esito = await comeUtente((ctx, dip) => cambiaCategoria(dip, ctx, emailId, categoria as CategoriaFuoriDalleNews));
    aggiornaViste();
    revalidatePath(`/mail/${emailId}`);
    return esito.codice;
  });
}

/** Annulla lo spostamento fuori dalle News: le correzioni da annullare sono ricalcolate sul server. */
export async function annullaSpostamentoAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const emailId = leggiId(dati, "email");
    if (!emailId) return "non_valido";
    const esito = await comeUtente((ctx, dip) => annullaSpostamentoDalleNews(dip, ctx, emailId));
    aggiornaViste();
    revalidatePath(`/mail/${emailId}`);
    return esito.codice;
  });
}
