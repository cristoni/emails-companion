"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { FUNZIONI_AI, type FunzioneAI } from "@ec/core/dominio";
import {
  aggiornaPreferenze,
  avviaScollegamento,
  confermaRianalisiImpostazioni,
  decidiImportazioneImpostazioni,
  impostaModello,
  MASSIMO_GIORNI_RIANALISI,
  richiediEliminazioneAccount,
  rimuoviChiaveOpenRouter,
  ripristinaDirettivePredefiniteImpostazioni,
  ripristinaModelloPredefinitoImpostazioni,
  ripristinaVersioneContestoImpostazioni,
  salvaChiaveOpenRouter,
  salvaContestoAi,
  stimaRianalisi,
  type AmbitoRianalisi,
} from "@ec/applicazione";
import type { StatoAzione } from "@/components/comuni/modulo-azione";
import { LINGUE } from "@/i18n/lingue";
import { eseguiAzione, leggiId, leggiTesto } from "@/lib/server/azioni";
import { fusoValido } from "@/lib/server/preferenze";
import { comeUtente } from "@/lib/server/sessione";

/**
 * Server Action della pagina `/settings`. Ognuna rilegge la sessione con `comeUtente`, valida l'input,
 * chiama un caso d'uso e restituisce solo un codice d'esito. Nessuna restituisce o registra la chiave.
 * In un file "use server" si esportano solo funzioni asincrone (i tipi sono ammessi).
 */

const MASSIMO_CONTESTO = 20_000;
const TEMI = ["system", "light", "dark"] as const;

/** Ambito della stima mostrato all'utente accanto ai numeri. */
export type AmbitoStimaMostrata = { tipo: "aperti" } | { tipo: "giorni"; giorni: number };

/**
 * Stato dell'azione di stima: oltre al codice porta solo numeri e l'id della richiesta, che servono
 * a mostrare la stima e a confermarla. Nessun altro dato esce dal server.
 */
export type StatoStimaRianalisi =
  | { esito: string; stima?: { richiestaId: string; numeroEmail: number; costoStimato: number; prezziMancanti: string[]; ambito: AmbitoStimaMostrata } }
  | undefined;

function aggiorna(...percorsi: string[]) {
  for (const percorso of percorsi) revalidatePath(percorso);
}

function funzioneDa(dati: FormData): FunzioneAI | null {
  const valore = leggiTesto(dati, "funzione", 64);
  return (FUNZIONI_AI as readonly string[]).includes(valore) ? (valore as FunzioneAI) : null;
}

// ── Caselle ──

/** Una casella che non è dell'utente della sessione, o è scollegata, risulta `non_trovata`. */
export async function confermaImportazioneAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const casellaId = leggiId(dati, "casella");
    if (!casellaId) return "non_valido";
    const esito = await comeUtente((ctx, dip) => decidiImportazioneImpostazioni(dip, ctx, casellaId, "conferma"));
    aggiorna("/settings", "/", "/status", "/onboarding");
    return esito;
  });
}

export async function rinviaImportazioneAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const casellaId = leggiId(dati, "casella");
    if (!casellaId) return "non_valido";
    const esito = await comeUtente((ctx, dip) => decidiImportazioneImpostazioni(dip, ctx, casellaId, "rinvia"));
    aggiorna("/settings", "/", "/status", "/onboarding");
    return esito;
  });
}

export async function scollegaCasellaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const casellaId = leggiId(dati, "casella");
    if (!casellaId) return "non_valido";
    const ok = await comeUtente((ctx, dip) => avviaScollegamento(dip, ctx, casellaId));
    aggiorna("/settings", "/", "/status", "/mail", "/news");
    return ok ? "ok" : "non_trovata";
  });
}

// ── Chiave OpenRouter ──

export async function salvaChiaveAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const chiave = leggiTesto(dati, "chiave", 512).trim();
    if (!chiave) return "vuota";
    const esito = await comeUtente((ctx, dip) => salvaChiaveOpenRouter(dip, ctx, chiave));
    aggiorna("/settings", "/", "/status");
    return esito;
  });
}

export async function rimuoviChiaveAzione(_: StatoAzione, _dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    await comeUtente((ctx) => rimuoviChiaveOpenRouter(ctx));
    aggiorna("/settings", "/", "/status");
    return "ok";
  });
}

// ── Modelli per Funzione AI ──

export async function impostaModelloAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const funzione = funzioneDa(dati);
    if (!funzione) return "non_valido";
    const modello = leggiTesto(dati, "modello", 200).trim();
    if (!modello) return "vuoto";
    const esito = await comeUtente((ctx, dip) => impostaModello(dip, ctx, funzione, modello));
    aggiorna("/settings", "/", "/status");
    return esito;
  });
}

export async function ripristinaModelloAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const funzione = funzioneDa(dati);
    if (!funzione) return "non_valido";
    const esito = await comeUtente((ctx, dip) => ripristinaModelloPredefinitoImpostazioni(dip, ctx, funzione));
    aggiorna("/settings", "/", "/status");
    return esito;
  });
}

// ── Contesto AI ──

export async function salvaContestoAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const testo = leggiTesto(dati, "contesto", MASSIMO_CONTESTO + 1);
    if (testo.length > MASSIMO_CONTESTO) return "troppo_lungo";
    if (!testo.trim()) return "vuoto";
    await comeUtente((ctx, dip) => salvaContestoAi(dip, ctx, testo));
    aggiorna("/settings");
    return "ok";
  });
}

export async function ripristinaVersioneContestoAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const valore = leggiTesto(dati, "versione", 10).trim();
    const numero = /^[1-9]\d{0,8}$/.test(valore) ? Number(valore) : null;
    if (numero === null) return "non_valido";
    const nuova = await comeUtente((ctx, dip) => ripristinaVersioneContestoImpostazioni(dip, ctx, numero));
    aggiorna("/settings");
    return nuova === null ? "non_trovata" : "ok";
  });
}

export async function ripristinaDirettivePredefiniteAzione(_: StatoAzione, _dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    await comeUtente((ctx, dip) => ripristinaDirettivePredefiniteImpostazioni(dip, ctx));
    aggiorna("/settings");
    return "ok";
  });
}

// ── Preferenze ──

export async function impostaLinguaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const lingua = leggiTesto(dati, "lingua", 8);
    if (!(LINGUE as readonly string[]).includes(lingua)) return "non_valido";
    await comeUtente((ctx, dip) => aggiornaPreferenze(dip, ctx, { lingua }));
    // Anche il cookie, così la pagina di accesso resta nella stessa lingua dopo l'uscita.
    (await cookies()).set("ec_lingua", lingua, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
    revalidatePath("/", "layout");
    return "ok";
  });
}

export async function impostaTemaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const tema = leggiTesto(dati, "tema", 16);
    if (!(TEMI as readonly string[]).includes(tema)) return "non_valido";
    await comeUtente((ctx, dip) => aggiornaPreferenze(dip, ctx, { tema }));
    aggiorna("/settings");
    return "ok";
  });
}

export async function impostaFusoAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const ricevuto = leggiTesto(dati, "fuso", 100).trim();
    if (!ricevuto || fusoValido(ricevuto) !== ricevuto) return "non_valido";
    // Forma canonica del fuso ("europe/rome" diventa "Europe/Rome"), così coincide con le voci dell'elenco.
    const fuso = new Intl.DateTimeFormat("en", { timeZone: ricevuto }).resolvedOptions().timeZone;
    await comeUtente((ctx, dip) => aggiornaPreferenze(dip, ctx, { fusoOrario: fuso }));
    revalidatePath("/", "layout");
    return "ok";
  });
}

export async function pausaAnalisiAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const valore = leggiTesto(dati, "pausa", 1);
    if (valore !== "1" && valore !== "0") return "non_valido";
    await comeUtente((ctx, dip) => aggiornaPreferenze(dip, ctx, { pausaManuale: valore === "1" }));
    aggiorna("/settings", "/", "/status");
    return "ok";
  });
}

// ── Rianalizza ──

function ambitoDa(dati: FormData): AmbitoStimaMostrata | null {
  const tipo = leggiTesto(dati, "ambito", 16);
  if (tipo === "aperti") return { tipo: "aperti" };
  if (tipo !== "giorni") return null;
  const valore = leggiTesto(dati, "giorni", 4).trim();
  if (!/^\d{1,3}$/.test(valore)) return null;
  const giorni = Number(valore);
  return giorni >= 1 && giorni <= MASSIMO_GIORNI_RIANALISI ? { tipo: "giorni", giorni } : null;
}

/** Stima senza chiamare modelli: registra la richiesta e restituisce numeri e id per la conferma esplicita. */
export async function stimaRianalisiAzione(_: StatoStimaRianalisi, dati: FormData): Promise<StatoStimaRianalisi> {
  const risultato: { stima?: NonNullable<NonNullable<StatoStimaRianalisi>["stima"]> } = {};
  const stato = await eseguiAzione(async () => {
    const ambito = ambitoDa(dati);
    if (!ambito) return "non_valido";
    const stima = await comeUtente((ctx, dip) => stimaRianalisi(dip, ctx, ambito satisfies AmbitoRianalisi));
    risultato.stima = {
      richiestaId: stima.richiestaId,
      numeroEmail: stima.numeroEmail,
      costoStimato: stima.costoStimato,
      prezziMancanti: [...new Set(stima.prezziMancanti)],
      ambito,
    };
    return "ok";
  });
  return stato?.esito === "ok" && risultato.stima ? { esito: "ok", stima: risultato.stima } : stato;
}

export async function confermaRianalisiAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const richiestaId = leggiId(dati, "richiesta");
    if (!richiestaId) return "non_trovata";
    // Una richiesta di un altro utente risulta `non_trovata`; una già confermata `stima_scaduta`.
    const esito = await comeUtente((ctx, dip) => confermaRianalisiImpostazioni(dip, ctx, richiestaId));
    aggiorna("/settings", "/status");
    return esito;
  });
}

// ── Account ──

/** Primo passo lato server dell'eliminazione: ferma l'analisi e accoda il lavoro al worker. Il client poi esce. */
export async function eliminaAccountAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    if (leggiTesto(dati, "conferma", 16) !== "elimina") return "non_valido";
    await comeUtente((ctx, dip) => richiediEliminazioneAccount(dip, ctx));
    return "ok";
  });
}
