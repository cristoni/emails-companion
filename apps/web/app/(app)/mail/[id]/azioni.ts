"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  annullaCorrezioni,
  cambiaCategoria,
  cambiaLingua,
  cambiaUrgenza,
  confermaRianalisi,
  stimaRianalisi,
  vistaEmail,
  vistaRianalisiEmail,
} from "@ec/applicazione";
import { CATEGORIE, type Categoria } from "@ec/core/dominio";
import type { StatoAzione } from "@/components/comuni/modulo-azione";
import { eseguiAzione, leggiId, leggiTesto } from "@/lib/server/azioni";
import { comeUtente } from "@/lib/server/sessione";

/** Stesso formato accettato da `cambiaLingua`: codice ISO 639 con eventuali sottotag (per esempio pt-br). */
const LINGUA = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const MASSIMO_CORREZIONI = 10;

/** Le correzioni dell'email cambiano l'elenco, la home (urgenze, Situazioni) e le News. */
function aggiorna(emailId: string) {
  revalidatePath(`/mail/${emailId}`);
  revalidatePath("/mail");
  revalidatePath("/");
  revalidatePath("/news");
}

export async function cambiaCategoriaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const emailId = leggiId(dati, "email");
    const categoria = leggiTesto(dati, "categoria", 32);
    if (!emailId || !(CATEGORIE as readonly string[]).includes(categoria)) return "non_valido";
    const esito = await comeUtente((ctx, dip) => cambiaCategoria(dip, ctx, emailId, categoria as Categoria));
    aggiorna(emailId);
    return esito.codice;
  });
}

export async function cambiaUrgenzaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const emailId = leggiId(dati, "email");
    const valore = leggiTesto(dati, "urgente", 5);
    if (!emailId || (valore !== "true" && valore !== "false")) return "non_valido";
    const esito = await comeUtente((ctx, dip) => cambiaUrgenza(dip, ctx, emailId, valore === "true"));
    aggiorna(emailId);
    return esito.codice;
  });
}

export async function cambiaLinguaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const emailId = leggiId(dati, "email");
    const scelta = leggiTesto(dati, "lingua", 40).trim();
    const lingua = (scelta === "altra" ? leggiTesto(dati, "linguaAltra", 40) : scelta).trim().toLowerCase();
    if (!emailId || !LINGUA.test(lingua)) return "non_valido";
    const esito = await comeUtente((ctx, dip) => cambiaLingua(dip, ctx, emailId, lingua));
    aggiorna(emailId);
    return esito.codice;
  });
}

/**
 * Annulla correzioni dell'email: accetta solo gli id presenti tra le correzioni attive della sua vista,
 * così il modulo non può revocare correzioni di altri elementi.
 */
export async function annullaCorrezioniAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const emailId = leggiId(dati, "email");
    const richieste = leggiTesto(dati, "correzioni", 64 * MASSIMO_CORREZIONI)
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean);
    if (!emailId || richieste.length === 0) return "non_valido";
    const esito = await comeUtente(async (ctx, dip) => {
      const email = await vistaEmail(dip, ctx, emailId);
      const attive = new Set(email?.correzioni.map((c) => c.id.toLowerCase()) ?? []);
      const ids = richieste.filter((id) => attive.has(id));
      if (ids.length === 0) return { codice: "non_trovato" as const };
      return annullaCorrezioni(dip, ctx, ids);
    });
    aggiorna(emailId);
    return esito.codice;
  });
}

/**
 * "Rianalizza questa email": calcola soltanto la stima (nessun modello viene chiamato) e porta alla pagina
 * dell'email, che la mostra con il comando di conferma. Un id che non appartiene all'utente risulta non
 * trovato e non registra alcuna richiesta. Il redirect avviene dopo il commit della stima.
 */
export async function stimaRianalisiAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const emailId = leggiId(dati, "email");
    if (!emailId) return "non_valido";
    const stima = await comeUtente(async (ctx, dip) => {
      const email = await vistaEmail(dip, ctx, emailId);
      return email ? stimaRianalisi(dip, ctx, { tipo: "email", emailId: email.id }) : null;
    });
    if (!stima) return "non_trovato";
    const parametri = new URLSearchParams({ rianalisi: stima.richiestaId });
    if (stima.prezziMancanti.length > 0) parametri.set("prezzi", "incompleti");
    redirect(`/mail/${emailId}?${parametri.toString()}#rianalisi`);
  });
}

/** Conferma esplicita della stima mostrata: solo una richiesta stimata per questa email può partire. */
export async function confermaRianalisiAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const emailId = leggiId(dati, "email");
    const richiestaId = leggiId(dati, "richiesta");
    if (!emailId || !richiestaId) return "non_valido";
    const avviata = await comeUtente(async (ctx, dip) => {
      const richiesta = await vistaRianalisiEmail(dip, ctx, emailId, richiestaId);
      if (!richiesta || richiesta.stato !== "stimata" || richiesta.numeroEmail === 0) return false;
      return confermaRianalisi(dip, ctx, richiesta.richiestaId);
    });
    revalidatePath(`/mail/${emailId}`);
    return avviata ? "ok" : "non_confermabile";
  });
}
