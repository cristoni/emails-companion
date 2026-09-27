import type { Direzione, Email, Indirizzo, MotivoPausa, StatoBozza, StatoInvio } from "@ec/core/dominio";
import { caselle, impostazioni, operativo, posta, type ContestoUtente } from "@ec/db";
import { MINUTO_MS, type Dipendenze } from "../dipendenze";
import { statoCollegamentoEffettivo, statoRispostaEffettivo } from "../viste/calcolo";
import type { Istante } from "../viste/tipi";
import { idValido, oggettoRisposta } from "./busta";
import { bozze, type Bozza, type Invio, type OrigineVersione, type TipoBozza } from "./repository";
import { casellaPronta, leggiBozza, type AvvisoBozza } from "./richiesta";

/**
 * Viste delle bozze per la webapp: DTO semplici e serializzabili (istanti ISO 8601 UTC), senza indici
 * ciechi né altri valori interni dell'invio. Il testo di oggetto e corpo è quello salvato nella versione.
 */

/** Oltre questo tempo senza versione la generazione è "in ritardo" e l'interfaccia offre "Rigenera". */
export const RITARDO_GENERAZIONE_MS = 2 * MINUTO_MS;

/** Errori dopo i quali l'invocazione è già ripianificata da sola (`riprova`): la generazione non è fallita. */
const ERRORI_RITENTATI: readonly string[] = ["temporaneo", "timeout", "budget_in_volo"];

export interface EmailDellaBozzaDto {
  id: string;
  direzione: Direzione;
  mittente: Indirizzo;
  oggetto: string;
  ricevutaIl: Istante;
  lingua: string;
}

export interface VoceBozzaDto {
  id: string;
  tipo: TipoBozza;
  stato: StatoBozza;
  /** 0 finché la prima versione non esiste (generazione in corso). */
  versioneCorrente: number;
  /** Chi ha scritto la versione corrente: "ai" è una Proposta finché l'utente non la invia. null senza versione. */
  origine: OrigineVersione | null;
  /** Oggetto della versione corrente (anche vuoto, se l'utente lo ha cancellato); null finché la prima versione non esiste. */
  oggetto: string | null;
  /** Destinatari della versione corrente, calcolati dal codice; vuoto finché la prima versione non esiste. */
  destinatari: Indirizzo[];
  casella: { id: string; indirizzo: string };
  /** Lingua dell'email a cui si risponde: la bozza è scritta in questa lingua. */
  lingua: string | null;
  /** Email a cui si risponde (o della richiesta, per un sollecito): porta all'originale. */
  emailRispostaId: string | null;
  attesaId: string | null;
  ultimoInvio: { stato: StatoInvio; errore: string | null; aggiornatoIl: Istante } | null;
  creataIl: Istante;
  aggiornataIl: Istante;
}

export type StatoGenerazioneBozza = "in_corso" | "in_ritardo" | "in_pausa" | "fallita";

export interface DettaglioBozzaDto {
  id: string;
  tipo: TipoBozza;
  stato: StatoBozza;
  /** Istante della lettura, dall'Orologio dell'app. */
  ora: Istante;
  /** Situazione attuale della bozza (segue un eventuale assorbimento). */
  situazioneId: string | null;
  /** Lingua dell'email a cui si risponde, se nota: è la lingua della bozza. */
  lingua: string | null;
  casella: { id: string; indirizzo: string; pronta: boolean };
  emailRisposta: EmailDellaBozzaDto | null;
  attesa: { id: string; oggetto: string } | null;
  /** Oggetto calcolato dal server ("Re: " e l'oggetto originale), che mantiene il thread del provider. */
  oggettoCalcolato: string | null;
  versione: {
    numero: number;
    origine: OrigineVersione;
    creataIl: Istante;
    oggetto: string;
    corpo: string;
    a: Indirizzo[];
    cc: Indirizzo[];
    bcc: Indirizzo[];
    inReplyTo: string | null;
    references: string[];
    /** Da restituire alla conferma insieme al numero di versione: lega l'invio a questa busta esatta. */
    hashBusta: string;
  } | null;
  /** Email effettivamente usate per scrivere la versione corrente, dalla più vecchia. */
  emailContesto: EmailDellaBozzaDto[];
  invio: {
    id: string;
    stato: StatoInvio;
    /** Codice d'errore o motivo dell'annullamento, da tradurre. */
    errore: string | null;
    versione: number;
    confermatoIl: Istante;
    inviatoIl: Istante | null;
    aggiornatoIl: Istante;
  } | null;
  /** Con un esito incerto: da quando l'utente può decidere. */
  decisioneDal: Istante | null;
  /** true se l'esito è incerto e la verifica automatica è terminata. */
  puoDecidere: boolean;
  avvisi: AvvisoBozza[];
  /** Solo mentre la prima versione non esiste: perché non è ancora arrivata. */
  generazione: { stato: StatoGenerazioneBozza; motivoPausa: MotivoPausa | null; errore: string | null; richiestaIl: Istante } | null;
}

const iso = (d: Date): string => d.toISOString();
const isoOpz = (d: Date | null): string | null => (d ? d.toISOString() : null);

function emailDto(e: Email): EmailDellaBozzaDto {
  return { id: e.id, direzione: e.direzione, mittente: e.mittente, oggetto: e.oggetto, ricevutaIl: iso(e.ricevutaIl), lingua: e.lingua };
}

function indirizzi(lista: readonly Indirizzo[]): Indirizzo[] {
  return lista.map((i) => (i.nome ? { nome: i.nome, indirizzo: i.indirizzo } : { indirizzo: i.indirizzo }));
}

function invioDto(i: Invio): NonNullable<DettaglioBozzaDto["invio"]> {
  return {
    id: i.id,
    stato: i.stato,
    errore: i.errore,
    versione: i.versione,
    confermatoIl: iso(i.confermatoIl),
    inviatoIl: isoOpz(i.inviatoIl),
    aggiornatoIl: iso(i.aggiornatoIl),
  };
}

async function indirizziCaselle(ctx: ContestoUtente, ids: readonly string[]): Promise<Map<string, string>> {
  const risultato = new Map<string, string>();
  for (const id of new Set(ids)) {
    const c = await caselle.leggi(ctx, id);
    if (c) risultato.set(id, c.indirizzo);
  }
  return risultato;
}

/**
 * Email della Situazione a cui l'utente può chiedere una risposta dal suo dettaglio: l'origine, le email
 * collegate e le Risposte arrivate, anche solo proposte, esclusi i collegamenti rifiutati.
 */
async function emailDellaSituazione(ctx: ContestoUtente, situazioneId: string): Promise<string[]> {
  const [agg] = await operativo.aggregati(ctx, [situazioneId]);
  if (!agg) return [];
  return [
    ...new Set([
      agg.situazione.emailOrigineId,
      ...agg.collegamenti.filter((c) => statoCollegamentoEffettivo(c, agg.correzioni) !== "rifiutato").map((c) => c.emailId),
      ...agg.risposte.filter((r) => statoRispostaEffettivo(r, agg.correzioni) !== "rifiutato").map((r) => r.emailId),
    ]),
  ];
}

/**
 * Elenco delle bozze di una Situazione per il suo dettaglio, comprese quelle nate in Situazioni poi
 * assorbite. Un id assorbito è risolto nella Situazione che lo contiene. Id malformati o altrui: vuoto.
 * Comprende anche le bozze rimaste senza Situazione (l'email aveva solo un collegamento proposto quando
 * è stata chiesta la risposta) che rispondono a un'email di questa Situazione: altrimenti, lasciato
 * l'editor, non sarebbero più raggiungibili.
 */
export async function bozzeDellaSituazione(ctx: ContestoUtente, situazioneId: string): Promise<VoceBozzaDto[]> {
  if (!idValido(situazioneId)) return [];
  const attuale = await bozze.situazioneAttuale(ctx, situazioneId);
  if (!attuale) return [];
  const proprie = await bozze.perSituazione(ctx, attuale);
  const senzaSituazione = await bozze.senzaSituazionePerEmail(ctx, await emailDellaSituazione(ctx, attuale));
  const elenco = [...proprie, ...senzaSituazione].sort(
    (x, y) => y.creataIl.getTime() - x.creataIl.getTime() || (x.id < y.id ? 1 : x.id > y.id ? -1 : 0),
  );
  if (elenco.length === 0) return [];
  // Query in sequenza: condividono il client della transazione.
  const indirizziCasella = await indirizziCaselle(ctx, elenco.map((b) => b.casellaId));
  const email = await posta.leggiMolte(ctx, [...new Set(elenco.flatMap((b) => (b.emailRispostaId ? [b.emailRispostaId] : [])))], false);
  const lingue = new Map(email.map((e) => [e.id, e.lingua]));
  const risultato: VoceBozzaDto[] = [];
  for (const b of elenco) {
    const versione = b.versioneCorrente > 0 ? await bozze.versione(ctx, b.id, b.versioneCorrente) : null;
    const invio = await bozze.ultimoInvio(ctx, b.id);
    risultato.push({
      id: b.id,
      tipo: b.tipo,
      stato: b.stato,
      versioneCorrente: b.versioneCorrente,
      origine: versione?.origine ?? null,
      oggetto: versione?.busta.oggetto ?? null,
      destinatari: versione ? indirizzi([...versione.busta.a, ...versione.busta.cc, ...versione.busta.bcc]) : [],
      casella: { id: b.casellaId, indirizzo: indirizziCasella.get(b.casellaId) ?? "" },
      lingua: (b.emailRispostaId && lingue.get(b.emailRispostaId)) || null,
      emailRispostaId: b.emailRispostaId,
      attesaId: b.attesaId,
      ultimoInvio: invio ? { stato: invio.stato, errore: invio.errore, aggiornatoIl: iso(invio.aggiornatoIl) } : null,
      creataIl: iso(b.creataIl),
      aggiornataIl: iso(b.aggiornataIl),
    });
  }
  return risultato;
}

/**
 * Motivo per cui "Bozze assistite" non può chiamare il modello adesso, con le stesse regole
 * dell'invocazione: una generazione trovata in pausa non viene ripresa da sola e va rigenerata.
 */
async function motivoPausaBozze(dip: Pick<Dipendenze, "configurazione">, ctx: ContestoUtente): Promise<MotivoPausa | null> {
  if (!(await impostazioni.haConsenso(ctx, dip.configurazione.versioneInformativa))) return "consenso_mancante";
  if ((await impostazioni.preferenze(ctx)).pausaManuale) return "pausa_manuale";
  const chiave = await impostazioni.infoChiave(ctx);
  if (!chiave) return "chiave_mancante";
  if (chiave.stato === "non_valida") return "chiave_non_valida";
  if (chiave.stato === "credito_esaurito" || chiave.stato === "limitata") return "credito_esaurito";
  const pausa = (await impostazioni.pauseAttive(ctx)).find((p) => p.funzione === "*" || p.funzione === "bozze_assistite");
  if (pausa) return pausa.motivo;
  const modello = (await impostazioni.modelli(ctx)).bozze_assistite;
  if (modello.stato === "incompatibile") return "modello_incompatibile";
  if (modello.stato === "non_disponibile") return "modello_non_disponibile";
  return null;
}

async function statoGenerazione(
  dip: Pick<Dipendenze, "configurazione">,
  ctx: ContestoUtente,
  b: Bozza,
  ora: Date,
): Promise<DettaglioBozzaDto["generazione"]> {
  const ultima = b.emailRispostaId ? await bozze.ultimaGenerazione(ctx, b.emailRispostaId, b.creataIl) : null;
  const richiestaIl = ultima && ultima.avviataIl > b.creataIl ? ultima.avviataIl : b.creataIl;
  const motivoPausa = await motivoPausaBozze(dip, ctx);
  let stato: StatoGenerazioneBozza;
  if (motivoPausa) stato = "in_pausa";
  else if (ultima && (ultima.stato === "interrotta" || (ultima.stato === "fallita" && !ERRORI_RITENTATI.includes(ultima.errore ?? "")))) stato = "fallita";
  else if (ora.getTime() - richiestaIl.getTime() > RITARDO_GENERAZIONE_MS) stato = "in_ritardo";
  else stato = "in_corso";
  return {
    stato,
    motivoPausa,
    errore: stato === "fallita" ? (ultima?.errore ?? null) : null,
    richiestaIl: iso(richiestaIl),
  };
}

/**
 * Dettaglio di una bozza per l'editor, la schermata di conferma e lo stato dell'invio: versione corrente
 * con busta e hash, email effettivamente usate, ultimo invio, avvisi e, finché la prima versione non
 * esiste, il motivo per cui la generazione non è ancora arrivata. Id malformati o altrui: null.
 */
export async function dettaglioBozza(
  dip: Pick<Dipendenze, "orologio" | "configurazione">,
  ctx: ContestoUtente,
  bozzaId: string,
): Promise<DettaglioBozzaDto | null> {
  const vista = await leggiBozza(ctx, bozzaId);
  if (!vista) return null;
  const ora = dip.orologio.ora();
  const { bozza: b, versione, invio } = vista;
  // Query in sequenza: condividono il client della transazione.
  const casella = await caselle.leggi(ctx, b.casellaId);
  const situazioneId = await bozze.situazioneAttuale(ctx, b.situazioneId);
  const emailRisposta = b.emailRispostaId ? await posta.leggi(ctx, b.emailRispostaId, false) : null;
  const voceAttesa = b.attesaId ? await bozze.attesa(ctx, b.attesaId) : null;
  const contesto = versione && versione.emailContesto.length > 0 ? await posta.leggiMolte(ctx, [...new Set(versione.emailContesto)], false) : [];
  contesto.sort((x, y) => x.ricevutaIl.getTime() - y.ricevutaIl.getTime() || (x.id < y.id ? -1 : 1));
  const decisioneDal = vista.decisioneDal;
  return {
    id: b.id,
    tipo: b.tipo,
    stato: b.stato,
    ora: iso(ora),
    situazioneId,
    lingua: emailRisposta?.lingua ?? null,
    casella: { id: b.casellaId, indirizzo: casella?.indirizzo ?? "", pronta: casellaPronta(casella) },
    emailRisposta: emailRisposta ? emailDto(emailRisposta) : null,
    attesa: voceAttesa ? { id: voceAttesa.attesa.id, oggetto: voceAttesa.attesa.oggetto } : null,
    oggettoCalcolato: emailRisposta ? oggettoRisposta(emailRisposta.oggetto) : null,
    versione: versione
      ? {
          numero: versione.versione,
          origine: versione.origine,
          creataIl: iso(versione.creataIl),
          oggetto: versione.busta.oggetto,
          corpo: versione.busta.corpo,
          a: indirizzi(versione.busta.a),
          cc: indirizzi(versione.busta.cc),
          bcc: indirizzi(versione.busta.bcc),
          inReplyTo: versione.busta.inReplyTo,
          references: [...versione.busta.references],
          hashBusta: versione.hashBusta,
        }
      : null,
    emailContesto: contesto.map(emailDto),
    invio: invio ? invioDto(invio) : null,
    decisioneDal: isoOpz(decisioneDal),
    puoDecidere: invio?.stato === "esito_incerto" && decisioneDal !== null && ora.getTime() >= decisioneDal.getTime(),
    avvisi: [...vista.avvisi],
    generazione: !versione && b.stato === "modificabile" ? await statoGenerazione(dip, ctx, b, ora) : null,
  };
}
