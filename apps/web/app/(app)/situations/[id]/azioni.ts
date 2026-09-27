"use server";

import { revalidatePath } from "next/cache";
import { PRIORITA, VALUTAZIONI, type Priorita, type Valutazione } from "@ec/core/dominio";
import {
  annullaAttesa,
  annullaCorrezioni,
  archivia,
  cambiaUrgenza,
  completaAttivita,
  confermaElemento,
  correggiValutazione,
  modificaAttivita,
  riapriAttivita,
  riapriSituazione,
  rifiutaCollegamento,
  rifiutaRisposta,
  scartaElemento,
  segnaAttesaSoddisfatta,
  segnaGestita,
  segnaRispostaVista,
  type EsitoCorrezione,
  type ModificheAttivita,
} from "@ec/applicazione";
import type { StatoAzione } from "@/components/comuni/modulo-azione";
import { eseguiAzione, leggiId, leggiTesto } from "@/lib/server/azioni";
import { comeUtente } from "@/lib/server/sessione";

/**
 * Azioni del dettaglio della Situazione. Ognuna rilegge la sessione, valida l'input, chiama un caso d'uso
 * di correzione e restituisce solo il codice d'esito (`EsitoCorrezione`), tradotto dalla pagina.
 */

type Lavoro = Parameters<typeof comeUtente<EsitoCorrezione>>[0];

const MASSIMO_CORREZIONI = 20;
const DESCRIZIONE_MASSIMA = 1000;

async function esegui(lavoro: Lavoro): Promise<StatoAzione> {
  return eseguiAzione(async () => {
    const esito = await comeUtente(lavoro);
    // La Situazione, la home e la posta mostrano valori effettivi: tutte le pagine possono essere cambiate.
    // Anche un esito diverso da "ok" ricarica: di solito vuol dire che la pagina mostrava dati superati.
    revalidatePath("/", "layout");
    return esito.codice;
  });
}

function conId(dati: FormData, nome: string, lavoro: (id: string) => Lavoro): Promise<StatoAzione> {
  const id = leggiId(dati, nome);
  if (!id) return Promise.resolve({ esito: "non_trovato" });
  return esegui(lavoro(id));
}

// ── Situazione ─────────────────────────────────────────────────────────────

export async function segnaGestitaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return conId(dati, "situazione", (id) => (ctx, dip) => segnaGestita(dip, ctx, id));
}

export async function archiviaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return conId(dati, "situazione", (id) => (ctx, dip) => archivia(dip, ctx, id));
}

export async function riapriSituazioneAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return conId(dati, "situazione", (id) => (ctx, dip) => riapriSituazione(dip, ctx, id));
}

export async function cambiaUrgenzaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const valore = leggiTesto(dati, "urgente", 8);
  if (valore !== "si" && valore !== "no") return { esito: "non_valido" };
  return conId(dati, "email", (id) => (ctx, dip) => cambiaUrgenza(dip, ctx, id, valore === "si"));
}

// ── Conferma e scarto ──────────────────────────────────────────────────────

const CONFERMABILI = ["attivita", "attesa", "collegamento", "risposta"] as const;
const SCARTABILI = ["attivita", "attesa"] as const;

export async function confermaElementoAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const tipo = CONFERMABILI.find((t) => t === leggiTesto(dati, "tipo", 16));
  if (!tipo) return { esito: "non_valido" };
  return conId(dati, "id", (id) => (ctx, dip) => confermaElemento(dip, ctx, { tipo, id }));
}

export async function scartaElementoAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const tipo = SCARTABILI.find((t) => t === leggiTesto(dati, "tipo", 16));
  if (!tipo) return { esito: "non_valido" };
  return conId(dati, "id", (id) => (ctx, dip) => scartaElemento(dip, ctx, { tipo, id }));
}

// ── Attività ───────────────────────────────────────────────────────────────

/** A capo del browser (CRLF) come nel testo salvato, senza spazi ai bordi. */
function normalizzaTesto(testo: string): string {
  return testo.replace(/\r\n?/g, "\n").trim();
}

/** Confronto che ignora le sole differenze di spaziatura (a capo e spazi introdotti dal browser). */
function stessoTesto(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
}

/**
 * Modifica in linea. Descrizione e scadenza sono inviate solo se l'utente le ha cambiate rispetto ai valori
 * mostrati: un salvataggio della sola priorità non deve scrivere una correzione della descrizione (che
 * toglierebbe l'Attività alla rianalisi) né spostare una scadenza (una data senza ora vale mezzanotte UTC,
 * come per l'AI).
 */
export async function modificaAttivitaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const modifiche: ModificheAttivita = {};
  if (dati.has("descrizione")) {
    // Letta con margine per i CRLF: oltre il massimo dopo la normalizzazione la rifiuta il caso d'uso.
    const descrizione = normalizzaTesto(leggiTesto(dati, "descrizione", 2 * DESCRIZIONE_MASSIMA + 2));
    const iniziale = leggiTesto(dati, "descrizioneIniziale", 20_000);
    if (!stessoTesto(descrizione, iniziale)) modifiche.descrizione = descrizione.slice(0, DESCRIZIONE_MASSIMA + 1);
  }
  if (dati.has("scadenza")) {
    const scadenza = leggiTesto(dati, "scadenza", 10).trim();
    const iniziale = leggiTesto(dati, "scadenzaIniziale", 10).trim();
    if (scadenza !== iniziale) modifiche.scadenza = scadenza === "" ? null : scadenza;
  }
  if (dati.has("priorita")) {
    const priorita = PRIORITA.find((p) => p === leggiTesto(dati, "priorita", 8));
    if (!priorita) return { esito: "non_valido" };
    modifiche.priorita = priorita satisfies Priorita;
  }
  return conId(dati, "attivita", (id) => (ctx, dip) => modificaAttivita(dip, ctx, id, modifiche));
}

export async function completaAttivitaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return conId(dati, "attivita", (id) => (ctx, dip) => completaAttivita(dip, ctx, id));
}

export async function riapriAttivitaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return conId(dati, "attivita", (id) => (ctx, dip) => riapriAttivita(dip, ctx, id));
}

// ── Attese e Risposte arrivate ─────────────────────────────────────────────

export async function annullaAttesaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return conId(dati, "attesa", (id) => (ctx, dip) => annullaAttesa(dip, ctx, id));
}

export async function segnaAttesaSoddisfattaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return conId(dati, "attesa", (id) => (ctx, dip) => segnaAttesaSoddisfatta(dip, ctx, id));
}

export async function rifiutaRispostaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return conId(dati, "risposta", (id) => (ctx, dip) => rifiutaRisposta(dip, ctx, id));
}

/** Corregge la valutazione; con `non_pertinente` riapre anche l'Attesa chiusa dall'AI con quella risposta (§10.3). */
export async function correggiValutazioneAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const valutazione = VALUTAZIONI.find((v) => v === leggiTesto(dati, "valutazione", 16));
  if (!valutazione) return { esito: "non_valido" };
  return conId(dati, "risposta", (id) => (ctx, dip) => correggiValutazione(dip, ctx, id, valutazione satisfies Valutazione));
}

export async function segnaRispostaVistaAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return conId(dati, "risposta", (id) => (ctx, dip) => segnaRispostaVista(dip, ctx, id));
}

// ── Collegamenti ───────────────────────────────────────────────────────────

export async function rifiutaCollegamentoAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  return conId(dati, "collegamento", (id) => (ctx, dip) => rifiutaCollegamento(dip, ctx, id));
}

// ── Annullamento ───────────────────────────────────────────────────────────

/** Annulla le correzioni indicate (id separati da virgole, come restituiti da un'azione o elencati nel DTO). */
export async function annullaCorrezioniAzione(_: StatoAzione, dati: FormData): Promise<StatoAzione> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = [
    ...new Set(
      leggiTesto(dati, "correzioni", (36 + 1) * MASSIMO_CORREZIONI)
        .split(",")
        .map((id) => id.trim())
        .filter((id) => UUID.test(id)),
    ),
  ].slice(0, MASSIMO_CORREZIONI);
  if (ids.length === 0) return { esito: "non_trovato" };
  return esegui((ctx, dip) => annullaCorrezioni(dip, ctx, ids));
}
