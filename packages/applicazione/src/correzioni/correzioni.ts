import {
  inFinestraNews,
  CATEGORIE,
  PRIORITA,
  VALUTAZIONI,
  correzioniAttive,
  toccatoDallUtente,
  valoreEffettivo,
  type Categoria,
  type CicloAttesa,
  type Correzione,
  type FonteLingua,
  type Priorita,
  type Soggetto,
  type StatoCollegamento,
  type StatoElemento,
  type StatoRevisione,
  type Valutazione,
} from "@ec/core/dominio";
import { operativo, posta, riconciliazione, type ContestoUtente } from "@ec/db";
import { opzioniRiconciliazione } from "../analisi/analizza-email";
import { invalidaRiepilogoNews, programmaRiepilogoNews } from "../news/riepilogo";
import type { Dipendenze } from "../dipendenze";
import { attivitaEffettiva, calcolaSituazioni, comeData, UUID } from "../viste/calcolo";
import { viste } from "../viste/repository";
import { correzioniDb } from "./repository";

/**
 * Correzioni dell'utente (§10.7). Ogni azione scrive una `correzione` e un `evento_situazione` nella
 * transazione del chiamante (la webapp) e accoda il lavoro che ne deriva. Il valore effettivo è sempre
 * "correzione prima dell'AI"; alcune correzioni sono rispecchiate anche sulla riga perché il
 * riconciliatore le legge da lì (collegamenti e risposte rifiutati, ciclo delle Attese, marcatori della
 * Situazione, lingua dell'email). Ogni correzione restituita si annulla con `annullaCorrezioni`.
 */

type DipendenzeCorrezioni = Dipendenze;

export type EsitoCorrezione =
  | { codice: "ok"; correzioni: string[] }
  | { codice: "non_trovato" | "non_valido" | "nessuna_modifica" };

export type ElementoCorreggibile = { tipo: "attivita" | "attesa" | "collegamento" | "risposta"; id: string };

const NON_TROVATO: EsitoCorrezione = { codice: "non_trovato" };
const NON_VALIDO: EsitoCorrezione = { codice: "non_valido" };
const INVARIATO: EsitoCorrezione = { codice: "nessuna_modifica" };
const ok = (correzioni: string[]): EsitoCorrezione => ({ codice: "ok", correzioni });

const LINGUA = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const DESCRIZIONE_MASSIMA = 1000;

async function effettivo<T>(ctx: ContestoUtente, soggetto: Soggetto, campo: string, valoreAi: T): Promise<T> {
  const correzioni = await operativo.correzioniPer(ctx, [soggetto]);
  return valoreEffettivo<T>(valoreAi, correzioni, soggetto, campo).valore;
}

/**
 * Scrive una correzione. L'istante è strettamente successivo a quello delle correzioni già presenti sullo
 * stesso campo: il valore effettivo è "l'ultima correzione attiva" e due correzioni nello stesso
 * millisecondo sarebbero altrimenti ordinate per id, cioè a caso.
 */
async function correggi(ctx: ContestoUtente, soggetto: Soggetto, campo: string, valore: unknown, precedente: unknown, ora: Date): Promise<string> {
  const ultima = (await operativo.correzioniPer(ctx, [soggetto]))
    .filter((c) => c.campo === campo && c.soggetto.tipo === soggetto.tipo && c.soggetto.id === soggetto.id)
    .reduce<Date | null>((max, c) => (max === null || c.creataIl > max ? c.creataIl : max), null);
  const istante = ultima !== null && ultima.getTime() >= ora.getTime() ? new Date(ultima.getTime() + 1) : ora;
  return operativo.correggi(ctx, soggetto, campo, valore, precedente, istante);
}

async function evento(ctx: ContestoUtente, situazioneId: string, tipo: string, riferimenti: Record<string, string>, ora: Date) {
  await operativo.evento(ctx, { situazioneId, attore: "utente", tipo, riferimenti, dettagli: null, creatoIl: ora });
}

async function eventoPerEmail(ctx: ContestoUtente, emailId: string, tipo: string, riferimenti: Record<string, string>, ora: Date) {
  for (const s of await correzioniDb.situazioniDellEmail(ctx, emailId)) await evento(ctx, s, tipo, { email: emailId, ...riferimenti }, ora);
}

/** Rimette l'email nella coda del riconciliatore: la convergenza la rielabora con i valori effettivi nuovi. */
async function rielabora(ctx: ContestoUtente, emailId: string) {
  await riconciliazione.rimettiInCoda(ctx, [emailId]);
  await ctx.coda.accoda("riconcilia_utente", { utenteId: ctx.utenteId }, opzioniRiconciliazione(ctx.utenteId));
}

// ── Conferma, modifica, scarto ─────────────────────────────────────────────

export async function confermaElemento(dip: DipendenzeCorrezioni, ctx: ContestoUtente, elemento: ElementoCorreggibile): Promise<EsitoCorrezione> {
  if (!UUID.test(elemento.id)) return NON_TROVATO;
  const ora = dip.orologio.ora();
  const { id } = elemento;
  switch (elemento.tipo) {
    case "attivita": {
      const a = await correzioniDb.attivita(ctx, id);
      if (!a) return NON_TROVATO;
      const soggetto = { tipo: "attivita", id } as const;
      const stato = await effettivo<StatoElemento>(ctx, soggetto, "stato", a.stato);
      if (stato === "confermata") return INVARIATO;
      if (stato !== "proposta") return NON_VALIDO;
      const c = await correggi(ctx, soggetto, "stato", "confermata", stato, ora);
      await evento(ctx, a.situazioneId, "attivita_confermata", { attivita: id, email: a.emailSorgenteId, correzione: c }, ora);
      return ok([c]);
    }
    case "attesa": {
      const a = await correzioniDb.attesa(ctx, id);
      if (!a) return NON_TROVATO;
      const soggetto = { tipo: "attesa", id } as const;
      const ciclo = await effettivo<CicloAttesa>(ctx, soggetto, "ciclo", a.ciclo);
      if (ciclo === "confermata") return INVARIATO;
      if (ciclo !== "proposta") return NON_VALIDO;
      const c = await correggi(ctx, soggetto, "ciclo", "confermata", ciclo, ora);
      await operativo.aggiornaAttesa(ctx, id, { ciclo: "confermata" }, ora);
      await evento(ctx, a.situazioneId, "attesa_confermata", { attesa: id, email: a.emailRichiestaId, correzione: c }, ora);
      return ok([c]);
    }
    case "collegamento": {
      const l = await correzioniDb.collegamento(ctx, id);
      if (!l) return NON_TROVATO;
      const soggetto = { tipo: "collegamento", id } as const;
      const stato = await effettivo<StatoCollegamento>(ctx, soggetto, "stato", l.stato);
      if (stato === "confermato") return INVARIATO;
      if (stato === "rifiutato") return NON_VALIDO;
      const c = await correggi(ctx, soggetto, "stato", "confermato", stato, ora);
      await correzioniDb.impostaStatoCollegamento(ctx, id, "confermato", ora);
      await evento(ctx, l.situazioneId, "collegamento_confermato", { collegamento: id, email: l.emailId, correzione: c }, ora);
      return ok([c]);
    }
    case "risposta": {
      const r = await correzioniDb.risposta(ctx, id);
      if (!r) return NON_TROVATO;
      const soggetto = { tipo: "risposta", id } as const;
      const stato = await effettivo<StatoCollegamento>(ctx, soggetto, "statoCollegamento", r.statoCollegamento);
      if (stato === "confermato") return INVARIATO;
      if (stato === "rifiutato") return NON_VALIDO;
      const correzioni = [await correggi(ctx, soggetto, "statoCollegamento", "confermato", stato, ora)];
      await correzioniDb.impostaStatoCollegamentoRisposta(ctx, id, "confermato", ora);
      // Confermare la risposta conferma anche il collegamento dell'email alla Situazione dell'Attesa.
      const l = await correzioniDb.collegamentoTra(ctx, r.emailId, r.situazioneId);
      if (l) {
        const soggettoL = { tipo: "collegamento", id: l.id } as const;
        const statoL = await effettivo<StatoCollegamento>(ctx, soggettoL, "stato", l.stato);
        if (statoL === "proposto") {
          correzioni.push(await correggi(ctx, soggettoL, "stato", "confermato", statoL, ora));
          await correzioniDb.impostaStatoCollegamento(ctx, l.id, "confermato", ora);
        }
      }
      await evento(ctx, r.situazioneId, "risposta_confermata", { risposta: id, attesa: r.attesaId, email: r.emailId, correzione: correzioni[0]! }, ora);
      return ok(correzioni);
    }
  }
}

export interface ModificheAttivita {
  descrizione?: string;
  /** Data `YYYY-MM-DD` o istante ISO con fuso; null toglie la scadenza. */
  scadenza?: string | null;
  priorita?: Priorita;
}

function leggiScadenza(valore: string): Date | null {
  const soloData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valore.trim());
  if (soloData) {
    const [anno, mese, giorno] = soloData.slice(1).map(Number) as [number, number, number];
    const d = new Date(Date.UTC(anno, mese - 1, giorno));
    return d.getUTCFullYear() === anno && d.getUTCMonth() === mese - 1 && d.getUTCDate() === giorno ? d : null;
  }
  return comeData(valore);
}

export async function modificaAttivita(dip: DipendenzeCorrezioni, ctx: ContestoUtente, attivitaId: string, modifiche: ModificheAttivita): Promise<EsitoCorrezione> {
  if (!UUID.test(attivitaId)) return NON_TROVATO;
  const riga = await correzioniDb.attivita(ctx, attivitaId);
  if (!riga) return NON_TROVATO;
  const descrizione = modifiche.descrizione?.trim();
  if (descrizione !== undefined && (descrizione.length === 0 || descrizione.length > DESCRIZIONE_MASSIMA)) return NON_VALIDO;
  if (modifiche.priorita !== undefined && !PRIORITA.includes(modifiche.priorita)) return NON_VALIDO;
  const scadenza = modifiche.scadenza === undefined || modifiche.scadenza === null ? modifiche.scadenza : leggiScadenza(modifiche.scadenza);
  if (scadenza === null && modifiche.scadenza !== null && modifiche.scadenza !== undefined) return NON_VALIDO;

  const soggetto = { tipo: "attivita", id: attivitaId } as const;
  const correzioni = await operativo.correzioniPer(ctx, [soggetto]);
  const attuale = (await operativo.attivitaDellEmail(ctx, riga.emailSorgenteId)).find((a) => a.id === attivitaId);
  if (!attuale) return NON_TROVATO;
  const effettiva = attivitaEffettiva(attuale, correzioni);
  if (effettiva.stato !== "proposta" && effettiva.stato !== "confermata") return NON_VALIDO;

  const ora = dip.orologio.ora();
  const scritte: string[] = [];
  const campi: string[] = [];
  if (descrizione !== undefined && descrizione !== effettiva.descrizione) {
    scritte.push(await correggi(ctx, soggetto, "descrizione", descrizione, effettiva.descrizione, ora));
    campi.push("descrizione");
  }
  if (scadenza !== undefined && (scadenza?.getTime() ?? null) !== (effettiva.scadenza?.getTime() ?? null)) {
    scritte.push(await correggi(ctx, soggetto, "scadenza", scadenza?.toISOString() ?? null, effettiva.scadenza?.toISOString() ?? null, ora));
    campi.push("scadenza");
  }
  if (modifiche.priorita !== undefined && modifiche.priorita !== effettiva.priorita) {
    scritte.push(await correggi(ctx, soggetto, "priorita", modifiche.priorita, effettiva.priorita, ora));
    campi.push("priorita");
  }
  if (scritte.length === 0) return INVARIATO;
  await evento(ctx, riga.situazioneId, "attivita_modificata", { attivita: attivitaId, email: riga.emailSorgenteId, campi: campi.join(","), correzione: scritte[0]! }, ora);
  return ok(scritte);
}

export async function scartaElemento(dip: DipendenzeCorrezioni, ctx: ContestoUtente, elemento: ElementoCorreggibile): Promise<EsitoCorrezione> {
  if (!UUID.test(elemento.id)) return NON_TROVATO;
  if (elemento.tipo === "collegamento") return rifiutaCollegamento(dip, ctx, elemento.id);
  if (elemento.tipo === "risposta") return rifiutaRisposta(dip, ctx, elemento.id);
  const ora = dip.orologio.ora();
  if (elemento.tipo === "attivita") {
    const a = await correzioniDb.attivita(ctx, elemento.id);
    if (!a) return NON_TROVATO;
    const soggetto = { tipo: "attivita", id: a.id } as const;
    const stato = await effettivo<StatoElemento>(ctx, soggetto, "stato", a.stato);
    if (stato === "scartata") return INVARIATO;
    if (stato !== "proposta" && stato !== "confermata") return NON_VALIDO;
    const c = await correggi(ctx, soggetto, "stato", "scartata", stato, ora);
    await evento(ctx, a.situazioneId, "attivita_scartata", { attivita: a.id, email: a.emailSorgenteId, correzione: c }, ora);
    return ok([c]);
  }
  const a = await correzioniDb.attesa(ctx, elemento.id);
  if (!a) return NON_TROVATO;
  const soggetto = { tipo: "attesa", id: a.id } as const;
  const ciclo = await effettivo<CicloAttesa>(ctx, soggetto, "ciclo", a.ciclo);
  if (ciclo === "scartata") return INVARIATO;
  if (ciclo !== "proposta" && ciclo !== "confermata") return NON_VALIDO;
  const c = await correggi(ctx, soggetto, "ciclo", "scartata", ciclo, ora);
  await operativo.aggiornaAttesa(ctx, a.id, { ciclo: "scartata" }, ora);
  await evento(ctx, a.situazioneId, "attesa_scartata", { attesa: a.id, email: a.emailRichiestaId, correzione: c }, ora);
  return ok([c]);
}

// ── Attività ───────────────────────────────────────────────────────────────

export async function completaAttivita(dip: DipendenzeCorrezioni, ctx: ContestoUtente, attivitaId: string): Promise<EsitoCorrezione> {
  if (!UUID.test(attivitaId)) return NON_TROVATO;
  const a = await correzioniDb.attivita(ctx, attivitaId);
  if (!a) return NON_TROVATO;
  const soggetto = { tipo: "attivita", id: attivitaId } as const;
  const stato = await effettivo<StatoElemento>(ctx, soggetto, "stato", a.stato);
  if (stato === "completata") return INVARIATO;
  if (stato !== "proposta" && stato !== "confermata") return NON_VALIDO;
  const ora = dip.orologio.ora();
  const c = await correggi(ctx, soggetto, "stato", "completata", stato, ora);
  await evento(ctx, a.situazioneId, "attivita_completata", { attivita: attivitaId, email: a.emailSorgenteId, correzione: c }, ora);
  return ok([c]);
}

/** Riapre un'Attività completata (anche dall'AI), scartata o superata: torna aperta e confermata dall'utente. */
export async function riapriAttivita(dip: DipendenzeCorrezioni, ctx: ContestoUtente, attivitaId: string): Promise<EsitoCorrezione> {
  if (!UUID.test(attivitaId)) return NON_TROVATO;
  const a = await correzioniDb.attivita(ctx, attivitaId);
  if (!a) return NON_TROVATO;
  const soggetto = { tipo: "attivita", id: attivitaId } as const;
  const stato = await effettivo<StatoElemento>(ctx, soggetto, "stato", a.stato);
  if (stato === "proposta" || stato === "confermata") return INVARIATO;
  const ora = dip.orologio.ora();
  const c = await correggi(ctx, soggetto, "stato", "confermata", stato, ora);
  await evento(ctx, a.situazioneId, "attivita_riaperta", { attivita: attivitaId, email: a.emailSorgenteId, correzione: c }, ora);
  return ok([c]);
}

// ── Collegamenti e Risposte arrivate ───────────────────────────────────────

/**
 * Rifiuta il collegamento di un'email a una Situazione (§10.2): resta come vincolo negativo, le Risposte
 * arrivate dell'email alle Attese di quella Situazione sono rifiutate, le Attività e le Attese nate
 * dall'email si spostano nella Situazione con la sua chiave e l'email torna al riconciliatore.
 */
export async function rifiutaCollegamento(dip: DipendenzeCorrezioni, ctx: ContestoUtente, collegamentoId: string): Promise<EsitoCorrezione> {
  if (!UUID.test(collegamentoId)) return NON_TROVATO;
  const l = await correzioniDb.collegamento(ctx, collegamentoId);
  if (!l) return NON_TROVATO;
  const situazione = await correzioniDb.situazione(ctx, l.situazioneId);
  if (!situazione) return NON_TROVATO;
  if (l.ruolo === "origine" || situazione.emailOrigineId === l.emailId) return NON_VALIDO;
  const soggetto = { tipo: "collegamento", id: collegamentoId } as const;
  const stato = await effettivo<StatoCollegamento>(ctx, soggetto, "stato", l.stato);
  if (stato === "rifiutato") return INVARIATO;

  const ora = dip.orologio.ora();
  const correzioni = [await correggi(ctx, soggetto, "stato", "rifiutato", stato, ora)];
  await correzioniDb.impostaStatoCollegamento(ctx, collegamentoId, "rifiutato", ora);
  for (const r of await correzioniDb.risposteDellEmailNellaSituazione(ctx, l.emailId, l.situazioneId)) {
    const soggettoR = { tipo: "risposta", id: r.id } as const;
    const statoR = await effettivo<StatoCollegamento>(ctx, soggettoR, "statoCollegamento", r.statoCollegamento);
    if (statoR === "rifiutato") continue;
    correzioni.push(await correggi(ctx, soggettoR, "statoCollegamento", "rifiutato", statoR, ora));
    await correzioniDb.impostaStatoCollegamentoRisposta(ctx, r.id, "rifiutato", ora);
  }
  const spostati = await separaElementi(dip, ctx, l.emailId, l.situazioneId, ora);
  await evento(ctx, l.situazioneId, "collegamento_rifiutato", { collegamento: collegamentoId, email: l.emailId, correzione: correzioni[0]!, ...(spostati ? { a: spostati.situazioneId } : {}) }, ora);
  if (spostati) {
    // Gli id spostati restano nell'evento: l'annullamento riporta indietro esattamente questi elementi.
    await evento(
      ctx,
      spostati.situazioneId,
      "elementi_spostati",
      { email: l.emailId, da: l.situazioneId, correzione: correzioni[0]!, attivita: spostati.attivita.join(","), attese: spostati.attese.join(",") },
      ora,
    );
  }
  await rielabora(ctx, l.emailId);
  return ok(correzioni);
}

/** Sposta gli elementi nati dall'email nella Situazione con la sua chiave, creandola se serve. */
async function separaElementi(
  dip: DipendenzeCorrezioni,
  ctx: ContestoUtente,
  emailId: string,
  daSituazioneId: string,
  ora: Date,
): Promise<{ situazioneId: string; attivita: string[]; attese: string[] } | null> {
  const [attivita, attese] = await Promise.all([operativo.attivitaDellEmail(ctx, emailId), operativo.atteseDellEmail(ctx, emailId)]);
  const daSpostare = attivita.some((a) => a.situazioneId === daSituazioneId) || attese.some((a) => a.attesa.situazioneId === daSituazioneId);
  if (!daSpostare) return null;
  const email = await posta.leggi(ctx, emailId, false);
  if (!email) return null;

  const esistente = await correzioniDb.situazioneDiOrigine(ctx, emailId);
  let destinazione: string;
  if (esistente) {
    if (esistente.id === daSituazioneId) return null;
    if (esistente.assorbitaIn) await operativo.separa(ctx, esistente.id, [], ora);
    destinazione = esistente.id;
  } else {
    const classificazione = await posta.leggiClassificazione(ctx, emailId);
    destinazione = await operativo.creaSituazione(ctx, {
      id: dip.ids.nuovo(),
      emailOrigineId: emailId,
      titolo: classificazione?.titoloSituazione?.trim() || email.oggetto || "—",
      descrizione: classificazione?.descrizioneSituazione?.trim() ?? "",
      lingua: email.lingua,
      creataIl: email.ricevutaIl,
    });
  }
  // Stesso collegamento d'origine che crea il riconciliatore: dopo un annullamento la Situazione vuota può essere riassorbita.
  await operativo.collega(ctx, { emailId, situazioneId: destinazione, origine: "thread", ruolo: "origine", stato: "confermato", confidenza: null, analisiId: null }, ora);
  const spostati = await correzioniDb.spostaElementiDellEmail(ctx, emailId, daSituazioneId, destinazione, ora);
  await operativo.toccaSituazione(ctx, destinazione, email.ricevutaIl);
  return { situazioneId: destinazione, ...spostati };
}

/**
 * Inverso di `separaElementi` per il rifiuto registrato con `correzioneId`: riporta nella Situazione di
 * partenza solo gli elementi che quel rifiuto aveva spostato e che sono ancora dove li aveva messi.
 */
async function ricongiungiElementi(ctx: ContestoUtente, correzioneId: string, situazioneId: string, ora: Date) {
  const spostamento = await correzioniDb.spostamentoDi(ctx, correzioneId);
  if (!spostamento || spostamento.situazioneId === situazioneId) return;
  await correzioniDb.spostaElementi(ctx, spostamento, spostamento.situazioneId, situazioneId, ora);
}

export async function rifiutaRisposta(dip: DipendenzeCorrezioni, ctx: ContestoUtente, rispostaId: string): Promise<EsitoCorrezione> {
  if (!UUID.test(rispostaId)) return NON_TROVATO;
  const r = await correzioniDb.risposta(ctx, rispostaId);
  if (!r) return NON_TROVATO;
  const soggetto = { tipo: "risposta", id: rispostaId } as const;
  const stato = await effettivo<StatoCollegamento>(ctx, soggetto, "statoCollegamento", r.statoCollegamento);
  if (stato === "rifiutato") return INVARIATO;
  const ora = dip.orologio.ora();
  const c = await correggi(ctx, soggetto, "statoCollegamento", "rifiutato", stato, ora);
  await correzioniDb.impostaStatoCollegamentoRisposta(ctx, rispostaId, "rifiutato", ora);
  await evento(ctx, r.situazioneId, "risposta_rifiutata", { risposta: rispostaId, attesa: r.attesaId, email: r.emailId, correzione: c }, ora);
  return ok([c]);
}

/**
 * Corregge la valutazione di una Risposta arrivata (§10.3). Con `non_pertinente` riapre l'Attesa chiusa
 * da quella risposta: la rianalisi non la richiude, una nuova risposta completa sì.
 */
export async function correggiValutazione(dip: DipendenzeCorrezioni, ctx: ContestoUtente, rispostaId: string, valutazione: Valutazione): Promise<EsitoCorrezione> {
  if (!VALUTAZIONI.includes(valutazione)) return NON_VALIDO;
  if (!UUID.test(rispostaId)) return NON_TROVATO;
  const r = await correzioniDb.risposta(ctx, rispostaId);
  if (!r) return NON_TROVATO;
  const soggetto = { tipo: "risposta", id: rispostaId } as const;
  const attuale = await effettivo<Valutazione>(ctx, soggetto, "valutazione", r.valutazione);
  if (attuale === valutazione) return INVARIATO;
  const ora = dip.orologio.ora();
  const c = await correggi(ctx, soggetto, "valutazione", valutazione, attuale, ora);
  await evento(ctx, r.situazioneId, "valutazione_corretta", { risposta: rispostaId, attesa: r.attesaId, email: r.emailId, valutazione, correzione: c }, ora);
  return ok([c]);
}

export async function segnaRispostaVista(dip: DipendenzeCorrezioni, ctx: ContestoUtente, rispostaId: string): Promise<EsitoCorrezione> {
  if (!UUID.test(rispostaId)) return NON_TROVATO;
  const r = await correzioniDb.risposta(ctx, rispostaId);
  if (!r) return NON_TROVATO;
  const soggetto = { tipo: "risposta", id: rispostaId } as const;
  const revisione = await effettivo<StatoRevisione>(ctx, soggetto, "revisione", r.revisione);
  if (revisione === "vista") return INVARIATO;
  const ora = dip.orologio.ora();
  const c = await correggi(ctx, soggetto, "revisione", "vista", revisione, ora);
  await evento(ctx, r.situazioneId, "risposta_vista", { risposta: rispostaId, attesa: r.attesaId, email: r.emailId, correzione: c }, ora);
  return ok([c]);
}

// ── Decisioni terminali sulle Attese ───────────────────────────────────────

async function decisioneAttesa(dip: DipendenzeCorrezioni, ctx: ContestoUtente, attesaId: string, decisione: "annullata" | "soddisfatta"): Promise<EsitoCorrezione> {
  if (!UUID.test(attesaId)) return NON_TROVATO;
  const a = await correzioniDb.attesa(ctx, attesaId);
  if (!a) return NON_TROVATO;
  const soggetto = { tipo: "attesa", id: attesaId } as const;
  const correzioni = await operativo.correzioniPer(ctx, [soggetto]);
  const ciclo = valoreEffettivo<CicloAttesa>(a.ciclo, correzioni, soggetto, "ciclo").valore;
  if (ciclo === "scartata" || ciclo === "superata") return NON_VALIDO;
  const attuale = valoreEffettivo<unknown>(null, correzioni, soggetto, "stato").valore;
  if (attuale === decisione) return INVARIATO;
  const ora = dip.orologio.ora();
  const c = await correggi(ctx, soggetto, "stato", decisione, attuale ?? null, ora);
  await evento(ctx, a.situazioneId, decisione === "annullata" ? "attesa_annullata" : "attesa_soddisfatta", { attesa: attesaId, email: a.emailRichiestaId, correzione: c }, ora);
  return ok([c]);
}

export function annullaAttesa(dip: DipendenzeCorrezioni, ctx: ContestoUtente, attesaId: string): Promise<EsitoCorrezione> {
  return decisioneAttesa(dip, ctx, attesaId, "annullata");
}

export function segnaAttesaSoddisfatta(dip: DipendenzeCorrezioni, ctx: ContestoUtente, attesaId: string): Promise<EsitoCorrezione> {
  return decisioneAttesa(dip, ctx, attesaId, "soddisfatta");
}

// ── Email: categoria, urgenza, lingua ──────────────────────────────────────

async function categoriaEffettiva(ctx: ContestoUtente, emailId: string, correzioni?: readonly Correzione[]): Promise<Categoria | null> {
  const ai = (await viste.classificazioni(ctx, [emailId])).get(emailId)?.categoria ?? null;
  const lista = correzioni ?? (await operativo.correzioniPer(ctx, [{ tipo: "email", id: emailId }]));
  return valoreEffettivo<Categoria | null>(ai, lista, { tipo: "email", id: emailId }, "categoria").valore;
}

/**
 * Conseguenze di un cambio di categoria (§9.4). Verso `news`: gli elementi dell'email non toccati
 * dall'utente diventano `superata` (correzioni legate a questa, restituite per l'annullamento). Fuori da
 * `news`: gli elementi superati per questo motivo tornano come prima e l'estrazione, se non ancora fatta,
 * passa a `da_eseguire`.
 */
async function effettiCategoria(ctx: ContestoUtente, emailId: string, prima: Categoria | null, dopo: Categoria | null, ora: Date): Promise<string[]> {
  const eraNews = prima === "news";
  const saraNews = dopo === "news";
  if (eraNews === saraNews) return [];
  const attivita = await operativo.attivitaDellEmail(ctx, emailId);
  const correzioni = await operativo.correzioniPer(ctx, attivita.map((a) => ({ tipo: "attivita" as const, id: a.id })));

  if (saraNews) {
    const superate: string[] = [];
    for (const a of attivita) {
      const soggetto = { tipo: "attivita", id: a.id } as const;
      if (toccatoDallUtente(correzioni, soggetto) || (a.stato !== "proposta" && a.stato !== "confermata")) continue;
      const c = await correggi(ctx, soggetto, "stato", "superata", a.stato, ora);
      await evento(ctx, a.situazioneId, "attivita_superata", { attivita: a.id, email: emailId, correzione: c }, ora);
      superate.push(c);
    }
    // Un'estrazione non ancora eseguita (in coda o in pausa) non serve più: le News non generano Attività.
    // L'analisi riparte per concludere l'email senza di essa e passarla al riconciliatore.
    const estrazione = (await posta.statiFunzione(ctx, emailId)).estrazione_attivita?.stato;
    if (estrazione === "da_eseguire" || estrazione === "in_pausa") {
      await posta.impostaStatoFunzione(ctx, emailId, "estrazione_attivita", "non_necessaria", ora);
      await ctx.coda.accoda("analizza_email", { utenteId: ctx.utenteId, emailId }, { chiave: `analisi:${emailId}` });
    }
    return superate;
  }

  const daRipristinare = attivita.flatMap((a) =>
    correzioniAttive(correzioni, { tipo: "attivita", id: a.id }, "stato").filter((c) => c.valore === "superata"),
  );
  for (const c of daRipristinare) await operativo.revocaCorrezione(ctx, c.id, ora);
  const stati = await posta.statiFunzione(ctx, emailId);
  const classificata = stati.classificazione_priorita?.stato === "eseguita" || stati.classificazione_priorita?.stato === "errore";
  const estrazione = stati.estrazione_attivita?.stato;
  if (classificata && (estrazione === undefined || estrazione === "non_necessaria")) {
    await posta.impostaStatoFunzione(ctx, emailId, "estrazione_attivita", "da_eseguire", ora);
    await ctx.coda.accoda("analizza_email", { utenteId: ctx.utenteId, emailId }, { chiave: `analisi:${emailId}` });
  } else if (estrazione === "eseguita") {
    await rielabora(ctx, emailId);
  }
  return [];
}

export async function cambiaCategoria(dip: DipendenzeCorrezioni, ctx: ContestoUtente, emailId: string, categoria: Categoria): Promise<EsitoCorrezione> {
  if (!CATEGORIE.includes(categoria)) return NON_VALIDO;
  if (!UUID.test(emailId)) return NON_TROVATO;
  const e = await correzioniDb.email(ctx, emailId);
  if (!e) return NON_TROVATO;
  if (e.direzione !== "entrata") return NON_VALIDO;
  const prima = await categoriaEffettiva(ctx, emailId);
  if (prima === categoria) return INVARIATO;
  const ora = dip.orologio.ora();
  const c = await correggi(ctx, { tipo: "email", id: emailId }, "categoria", categoria, prima, ora);
  const conseguenti = await effettiCategoria(ctx, emailId, prima, categoria, ora);
  if (prima === "news" || categoria === "news") await programmaRiepilogoNews(dip, ctx);
  await eventoPerEmail(ctx, emailId, "categoria_corretta", { categoria, correzione: c }, ora);
  return ok([c, ...conseguenti]);
}

export async function cambiaUrgenza(dip: DipendenzeCorrezioni, ctx: ContestoUtente, emailId: string, urgente: boolean): Promise<EsitoCorrezione> {
  if (typeof urgente !== "boolean") return NON_VALIDO;
  if (!UUID.test(emailId)) return NON_TROVATO;
  const e = await correzioniDb.email(ctx, emailId);
  if (!e) return NON_TROVATO;
  if (e.direzione !== "entrata") return NON_VALIDO;
  const soggetto = { tipo: "email", id: emailId } as const;
  const ai = (await viste.classificazioni(ctx, [emailId])).get(emailId)?.urgente ?? false;
  const prima = (await effettivo<boolean>(ctx, soggetto, "urgente", ai)) === true;
  if (prima === urgente) return INVARIATO;
  const ora = dip.orologio.ora();
  const c = await correggi(ctx, soggetto, "urgente", urgente, prima, ora);
  await eventoPerEmail(ctx, emailId, "urgenza_corretta", { urgente: String(urgente), correzione: c }, ora);
  // Un'email resa urgente senza Situazione ne origina una (§10.1): la decide il riconciliatore.
  if (urgente && (await correzioniDb.situazioniDellEmail(ctx, emailId)).length === 0) await rielabora(ctx, emailId);
  return ok([c]);
}

/** Corregge la lingua di un'email (§7.6); l'interfaccia propone poi "Rianalizza". */
export async function cambiaLingua(dip: DipendenzeCorrezioni, ctx: ContestoUtente, emailId: string, lingua: string): Promise<EsitoCorrezione> {
  const valore = typeof lingua === "string" ? lingua.trim().toLowerCase() : "";
  if (!LINGUA.test(valore)) return NON_VALIDO;
  if (!UUID.test(emailId)) return NON_TROVATO;
  const e = await correzioniDb.email(ctx, emailId);
  if (!e) return NON_TROVATO;
  if (e.lingua === valore && e.fonteLingua === "utente") return INVARIATO;
  const ora = dip.orologio.ora();
  const c = await correggi(ctx, { tipo: "email", id: emailId }, "lingua", valore, { lingua: e.lingua, fonte: e.fonteLingua }, ora);
  await posta.aggiornaLingua(ctx, emailId, valore, "utente");
  await eventoPerEmail(ctx, emailId, "lingua_corretta", { lingua: valore, correzione: c }, ora);
  const classificazione = await posta.leggiClassificazione(ctx, emailId);
  const categoria = classificazione ? await effettivo(ctx, { tipo: "email", id: emailId }, "categoria", classificazione.categoria) : null;
  if (e.direzione === "entrata" && categoria === "news" && inFinestraNews(e.ricevutaIl, ora)) await invalidaRiepilogoNews(dip, ctx);
  return ok([c]);
}

// ── Situazione: gestita, archiviata ────────────────────────────────────────

async function situazioneRisolta(ctx: ContestoUtente, situazioneId: string) {
  if (!UUID.test(situazioneId)) return null;
  const id = await viste.risolviSituazione(ctx, situazioneId);
  return id ? correzioniDb.situazione(ctx, id, true) : null;
}

/**
 * "Segna come gestita": chiude l'urgenza delle email già arrivate senza chiudere gli elementi (§10.1).
 * Senza un'urgenza che la gestione possa chiudere (una scadenza vicina resta) non scrive nulla: così un
 * doppio invio, serializzato dal blocco sulla Situazione, non lascia una seconda correzione attiva.
 */
export async function segnaGestita(dip: DipendenzeCorrezioni, ctx: ContestoUtente, situazioneId: string): Promise<EsitoCorrezione> {
  const s = await situazioneRisolta(ctx, situazioneId);
  if (!s) return NON_TROVATO;
  const ora = dip.orologio.ora();
  const [calcolata] = await calcolaSituazioni(ctx, [s.id], ora);
  const motivo = calcolata?.vista.motivoUrgenza ?? null;
  if (motivo === null || motivo === "scadenza_vicina") return INVARIATO;
  const soggetto = { tipo: "situazione", id: s.id } as const;
  const prima = await effettivo<unknown>(ctx, soggetto, "gestitaIl", s.gestitaIl?.toISOString() ?? null);
  const c = await correggi(ctx, soggetto, "gestitaIl", ora.toISOString(), prima instanceof Date ? prima.toISOString() : (prima ?? null), ora);
  await operativo.impostaMarcatoriSituazione(ctx, s.id, { gestitaIl: ora });
  await evento(ctx, s.id, "situazione_gestita", { correzione: c }, ora);
  return ok([c]);
}

async function archiviazione(dip: DipendenzeCorrezioni, ctx: ContestoUtente, situazioneId: string, archiviata: boolean): Promise<EsitoCorrezione> {
  const s = await situazioneRisolta(ctx, situazioneId);
  if (!s) return NON_TROVATO;
  const soggetto = { tipo: "situazione", id: s.id } as const;
  const prima = (await effettivo<unknown>(ctx, soggetto, "archiviata", s.archiviataIl !== null)) === true;
  if (prima === archiviata) return INVARIATO;
  const ora = dip.orologio.ora();
  const c = await correggi(ctx, soggetto, "archiviata", archiviata, prima, ora);
  await operativo.impostaMarcatoriSituazione(ctx, s.id, { archiviataIl: archiviata ? ora : null });
  await evento(ctx, s.id, archiviata ? "situazione_archiviata" : "situazione_riaperta", { correzione: c }, ora);
  return ok([c]);
}

export function archivia(dip: DipendenzeCorrezioni, ctx: ContestoUtente, situazioneId: string): Promise<EsitoCorrezione> {
  return archiviazione(dip, ctx, situazioneId, true);
}

export function riapriSituazione(dip: DipendenzeCorrezioni, ctx: ContestoUtente, situazioneId: string): Promise<EsitoCorrezione> {
  return archiviazione(dip, ctx, situazioneId, false);
}

// ── Annullamento ───────────────────────────────────────────────────────────

/** Situazioni a cui mostrare l'annullamento nella cronologia. */
async function situazioniDelSoggetto(ctx: ContestoUtente, soggetto: Soggetto): Promise<string[]> {
  switch (soggetto.tipo) {
    case "situazione":
      return [soggetto.id];
    case "attivita":
      return [(await correzioniDb.attivita(ctx, soggetto.id))?.situazioneId].filter((x): x is string => Boolean(x));
    case "attesa":
      return [(await correzioniDb.attesa(ctx, soggetto.id))?.situazioneId].filter((x): x is string => Boolean(x));
    case "risposta":
      return [(await correzioniDb.risposta(ctx, soggetto.id))?.situazioneId].filter((x): x is string => Boolean(x));
    case "collegamento":
      return [(await correzioniDb.collegamento(ctx, soggetto.id))?.situazioneId].filter((x): x is string => Boolean(x));
    case "email":
      return correzioniDb.situazioniDellEmail(ctx, soggetto.id);
  }
}

/** Valore del campo dopo la revoca: l'ultima correzione rimasta attiva, altrimenti il valore prima della prima correzione. */
function valoreRimasto(correzioni: readonly Correzione[], soggetto: Soggetto, campo: string): { valore: unknown; corretto: boolean; creataIl: Date | null } {
  const attiva = correzioniAttive(correzioni, soggetto, campo).at(-1);
  if (attiva) return { valore: attiva.valore, corretto: true, creataIl: attiva.creataIl };
  const prima = correzioni
    .filter((c) => c.soggetto.tipo === soggetto.tipo && c.soggetto.id === soggetto.id && c.campo === campo)
    .sort((a, b) => a.creataIl.getTime() - b.creataIl.getTime() || (a.id < b.id ? -1 : 1))[0];
  return { valore: prima?.valorePrecedente ?? null, corretto: false, creataIl: null };
}

/** Riallinea le righe che rispecchiano la correzione revocata (`revocata`) e ne ripete le conseguenze. */
async function ripristina(
  dip: DipendenzeCorrezioni,
  ctx: ContestoUtente,
  revocata: string,
  soggetto: Soggetto,
  campo: string,
  prima: readonly Correzione[],
  dopo: readonly Correzione[],
  ora: Date,
) {
  const rimasto = valoreRimasto(dopo, soggetto, campo);
  switch (`${soggetto.tipo}.${campo}`) {
    case "collegamento.stato": {
      const l = await correzioniDb.collegamento(ctx, soggetto.id);
      if (!l) return;
      const nuovo = (rimasto.valore as StatoCollegamento | null) ?? "proposto";
      await correzioniDb.impostaStatoCollegamento(ctx, l.id, nuovo, ora);
      if (l.stato === "rifiutato" && nuovo !== "rifiutato") {
        await ricongiungiElementi(ctx, revocata, l.situazioneId, ora);
        await rielabora(ctx, l.emailId);
      }
      return;
    }
    case "risposta.statoCollegamento": {
      await correzioniDb.impostaStatoCollegamentoRisposta(ctx, soggetto.id, (rimasto.valore as StatoCollegamento | null) ?? "proposto", ora);
      return;
    }
    case "attesa.ciclo": {
      await operativo.aggiornaAttesa(ctx, soggetto.id, { ciclo: (rimasto.valore as CicloAttesa | null) ?? "proposta" }, ora);
      return;
    }
    case "situazione.gestitaIl": {
      await operativo.impostaMarcatoriSituazione(ctx, soggetto.id, { gestitaIl: comeData(rimasto.valore) });
      return;
    }
    case "situazione.archiviata": {
      await operativo.impostaMarcatoriSituazione(ctx, soggetto.id, { archiviataIl: rimasto.valore === true ? (rimasto.creataIl ?? ora) : null });
      return;
    }
    case "email.lingua": {
      const v = rimasto.valore;
      if (rimasto.corretto && typeof v === "string") await posta.aggiornaLingua(ctx, soggetto.id, v, "utente");
      else if (v && typeof v === "object" && "lingua" in v && "fonte" in v) {
        const { lingua, fonte } = v as { lingua: string; fonte: FonteLingua };
        await posta.aggiornaLingua(ctx, soggetto.id, lingua, fonte);
      }
      return;
    }
    case "email.categoria": {
      const categoriaPrima = await categoriaEffettiva(ctx, soggetto.id, prima);
      const categoriaDopo = await categoriaEffettiva(ctx, soggetto.id, dopo);
      await effettiCategoria(ctx, soggetto.id, categoriaPrima, categoriaDopo, ora);
      if ((categoriaPrima === "news") !== (categoriaDopo === "news")) await programmaRiepilogoNews(dip, ctx);
      return;
    }
    case "email.urgente": {
      if (rimasto.valore === true && (await correzioniDb.situazioniDellEmail(ctx, soggetto.id)).length === 0) await rielabora(ctx, soggetto.id);
      return;
    }
  }
}

/**
 * Annulla correzioni (anche più d'una, come restituite da un'azione), dalla più recente: le revoca,
 * riallinea le righe che le rispecchiavano e registra l'annullamento nella cronologia.
 */
export async function annullaCorrezioni(dip: DipendenzeCorrezioni, ctx: ContestoUtente, ids: readonly string[]): Promise<EsitoCorrezione> {
  const ora = dip.orologio.ora();
  const revocate: string[] = [];
  let trovate = 0;
  for (const id of [...ids].reverse()) {
    if (!UUID.test(id)) continue;
    const riga = await correzioniDb.correzione(ctx, id);
    if (!riga) continue;
    trovate += 1;
    if (riga.revocataIl) continue;
    const prima = await operativo.correzioniPer(ctx, [riga.soggetto]);
    await operativo.revocaCorrezione(ctx, id, ora);
    const dopo = prima.map((c) => (c.id === id ? { ...c, revocataIl: ora } : c));
    await ripristina(dip, ctx, id, riga.soggetto, riga.campo, prima, dopo, ora);
    const riferimento: Record<string, string> = { [riga.soggetto.tipo]: riga.soggetto.id };
    for (const s of await situazioniDelSoggetto(ctx, riga.soggetto)) {
      await evento(ctx, s, "correzione_annullata", { correzione: id, campo: riga.campo, ...riferimento }, ora);
    }
    revocate.push(id);
  }
  if (revocate.length > 0) return ok(revocate);
  return trovate > 0 ? INVARIATO : NON_TROVATO;
}
