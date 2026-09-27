"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  confermaInvio,
  decidiEsitoIncerto,
  LIMITE_CORPO,
  LIMITE_OGGETTO,
  modificaBozza,
  richiediBozza,
  rigeneraBozza,
  type RichiestaBozza,
} from "@ec/applicazione";
import type { StatoAzione } from "@/components/comuni/modulo-azione";
import { eseguiAzione, leggiId, leggiTesto } from "@/lib/server/azioni";
import { comeUtente } from "@/lib/server/sessione";

/**
 * Azioni di bozze e invio. Ognuna rilegge la sessione con `comeUtente`, valida l'input, chiama un caso
 * d'uso e restituisce solo un codice d'esito. `redirect()` avviene sempre DOPO `comeUtente`: lanciato
 * dentro la transazione la annullerebbe.
 */

/** Numero di versione: solo cifre, altrimenti null (il caso d'uso rifiuta anche i valori fuori intervallo). */
function leggiVersione(dati: FormData): number | null {
  const valore = leggiTesto(dati, "versione", 12).trim();
  return /^\d{1,10}$/.test(valore) ? Number(valore) : null;
}

function aggiornaPagine(bozzaId: string) {
  revalidatePath(`/drafts/${bozzaId}`);
  revalidatePath(`/drafts/${bozzaId}/confirm`);
  revalidatePath("/situations/[id]", "page");
}

async function proponi(richiesta: RichiestaBozza): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const esito = await comeUtente((ctx, dip) => richiediBozza(dip, ctx, richiesta));
    if (esito.esito !== "richiesta") return esito.esito;
    aggiornaPagine(esito.bozzaId);
    redirect(`/drafts/${esito.bozzaId}`);
  });
}

/** "Proponi risposta": crea la bozza e porta al suo editor. Generare una bozza non è inviare. */
export async function proponiRispostaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const emailId = leggiId(dati, "email");
  if (!emailId) return { esito: "email_non_trovata" };
  return proponi({ tipo: "risposta", emailId });
}

/** "Proponi sollecito" per un'Attesa. */
export async function proponiSollecitoAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const attesaId = leggiId(dati, "attesa");
  if (!attesaId) return { esito: "attesa_non_trovata" };
  return proponi({ tipo: "sollecito", attesaId });
}

/** Salva oggetto e corpo come nuova versione, a partire dalla versione mostrata nell'editor. */
export async function salvaBozzaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const bozzaId = leggiId(dati, "bozza");
  if (!bozzaId) return { esito: "non_trovata" };
  const versioneAttesa = leggiVersione(dati);
  if (versioneAttesa === null) return { esito: "versione_superata" };
  // Margine per gli a capo CRLF dell'invio del modulo: la lunghezza la verifica il caso d'uso, senza tagliare in silenzio.
  const oggetto = leggiTesto(dati, "oggetto", LIMITE_OGGETTO * 2 + 2);
  const corpo = leggiTesto(dati, "corpo", LIMITE_CORPO * 2 + 2);
  return eseguiAzione(async () => {
    const esito = await comeUtente((ctx, dip) => modificaBozza(dip, ctx, bozzaId, { oggetto, corpo, versioneAttesa }));
    aggiornaPagine(bozzaId);
    return esito.esito;
  });
}

/** "Rigenera": nuova richiesta di generazione per una bozza ancora modificabile. */
export async function rigeneraBozzaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const bozzaId = leggiId(dati, "bozza");
  if (!bozzaId) return { esito: "non_trovata" };
  return eseguiAzione(async () => {
    const richiesta = await comeUtente((ctx, dip) => rigeneraBozza(dip, ctx, bozzaId));
    aggiornaPagine(bozzaId);
    return richiesta ? "ok" : "non_modificabile";
  });
}

/**
 * Invio confermato: l'unica via verso l'invio. Versione e hash della busta arrivano dalla schermata di
 * conferma, così parte esattamente la versione che l'utente ha visto.
 */
export async function confermaInvioAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const bozzaId = leggiId(dati, "bozza");
  if (!bozzaId) return { esito: "non_trovata" };
  const versione = leggiVersione(dati);
  const hashBusta = leggiTesto(dati, "hashBusta", 256).trim();
  if (versione === null || !hashBusta) return { esito: "versione_superata" };
  return eseguiAzione(async () => {
    const esito = await comeUtente((ctx, dip) => confermaInvio(dip, ctx, { bozzaId, versione, hashBusta }));
    aggiornaPagine(bozzaId);
    if (esito.esito === "confermato" || esito.esito === "gia_in_corso") redirect(`/drafts/${bozzaId}`);
    return esito.esito;
  });
}

/**
 * Decisione su un esito incerto, possibile solo al termine della verifica automatica. "Invia di nuovo"
 * non invia: sblocca la bozza e porta a una nuova conferma esplicita con l'avviso di possibile duplicato.
 */
export async function decidiEsitoAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const invioId = leggiId(dati, "invio");
  const bozzaId = leggiId(dati, "bozza");
  const decisione = leggiTesto(dati, "decisione", 20);
  if (!invioId || (decisione !== "non_inviato" && decisione !== "reinvia")) return { esito: "non_trovato" };
  return eseguiAzione(async () => {
    const esito = await comeUtente((ctx, dip) => decidiEsitoIncerto(dip, ctx, invioId, decisione));
    if (bozzaId) aggiornaPagine(bozzaId);
    if (esito.esito === "annullato") {
      aggiornaPagine(esito.bozzaId);
      if (esito.nuovaConfermaRichiesta) redirect(`/drafts/${esito.bozzaId}/confirm`);
    }
    return esito.esito;
  });
}
