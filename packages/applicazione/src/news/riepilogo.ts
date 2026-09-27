import {
  emailNonIncluse,
  firmaInsiemeNews,
  linguaVoceRiepilogo,
  membriNews,
  prossimaRigenerazione,
  prossimaUscitaDallaFinestra,
  valoreEffettivo,
  vociVisibili,
  type Categoria,
  type Email,
  type EmailCandidataNews,
  type Indirizzo,
} from "@ec/core/dominio";
import { caselle, impostazioni, operativo, posta, type ContestoUtente } from "@ec/db";
import { invocaFunzione } from "../analisi/invocazione";
import { emailPerModello } from "../analisi/per-modello";
import type { Dipendenze } from "../dipendenze";
import { prossimoTentativo } from "../ritentativi";
import { news, type RiepilogoSalvato, type VoceRiepilogo } from "./repository";

/** Email inviate al modello per generazione; le altre restano tra le "non ancora nel riepilogo". */
export const MASSIMO_EMAIL_RIEPILOGO = 50;

/** Chiave dei cambi di appartenenza e di "Aggiorna" (§8). */
export function chiaveRiepilogoNews(utenteId: string): string {
  return `news:${utenteId}`;
}

/**
 * Chiave distinta per l'uscita dalla finestra: con `preserve_run_at` una rigenerazione programmata
 * tra molte ore bloccherebbe quelle dovute ai cambi di appartenenza.
 */
export function chiaveUscitaNews(utenteId: string): string {
  return `news_uscita:${utenteId}`;
}

/**
 * Opzioni dei job del riepilogo. Le due chiavi condividono una coda per utente: le generazioni non si
 * sovrappongono (la seconda troverebbe l'invocazione "in corso altrove" e registrerebbe un errore temporaneo).
 */
function opzioniNews(chiave: string, modalitaChiave: "replace" | "preserve_run_at", esegui: Date, utenteId: string) {
  return { chiave, modalitaChiave, esegui, coda: `news:${utenteId}` };
}

interface Appartenenza {
  /** Dalla più recente. */
  ids: string[];
  ricevute: Date[];
}

/** Appartenenza esatta all'istante indicato, con la categoria effettiva (correzione prima dell'AI). */
async function appartenenza(ctx: ContestoUtente, ora: Date): Promise<Appartenenza> {
  const candidate = await news.candidate(ctx, ora);
  const correzioni = await operativo.correzioniPer(
    ctx,
    candidate.map((c) => ({ tipo: "email" as const, id: c.id })),
  );
  const emails: EmailCandidataNews[] = candidate.map((c) => ({
    id: c.id,
    direzione: "entrata",
    ricevutaIl: c.ricevutaIl,
    categoriaEffettiva: valoreEffettivo<Categoria | null>(c.categoriaAI, correzioni, { tipo: "email", id: c.id }, "categoria").valore,
    eliminata: false,
  }));
  const ids = membriNews(emails, ora);
  const ricevute = new Map(candidate.map((c) => [c.id, c.ricevutaIl]));
  return { ids, ricevute: ids.flatMap((id) => ricevute.get(id) ?? []) };
}

/** Il limite dei 30 minuti vale per le generazioni del modello, non per il riepilogo vuoto. */
function ultimaGenerazione(salvato: Pick<RiepilogoSalvato, "generatoIl" | "analisiId"> | null): Date | null {
  return salvato?.analisiId ? salvato.generatoIl : null;
}

/**
 * Da chiamare ogni volta che l'appartenenza alle News può cambiare (classificazione salvata, categoria
 * corretta, email eliminata, lingua dell'interfaccia cambiata). Raggruppa per 10 minuti e distanzia le
 * generazioni di almeno 30; con `preserve_run_at` una nuova chiamata non sposta un job già programmato.
 */
export async function programmaRiepilogoNews(dip: Dipendenze, ctx: ContestoUtente): Promise<Date> {
  const ora = dip.orologio.ora();
  const salvato = await news.stato(ctx);
  const elaborazione = await impostazioni.statoElaborazione(ctx);
  const prevista = prossimaRigenerazione(ora, ultimaGenerazione(salvato));
  const nonPrimaDi = elaborazione?.newsNonPrimaDi ?? null;
  const esegui = nonPrimaDi && nonPrimaDi > prevista ? nonPrimaDi : prevista;
  await ctx.coda.accoda(
    "aggiorna_riepilogo_news",
    { utenteId: ctx.utenteId },
    opzioniNews(chiaveRiepilogoNews(ctx.utenteId), "preserve_run_at", esegui, ctx.utenteId),
  );
  return esegui;
}

/**
 * Per i cambi che modificano l'input del riepilogo senza cambiarne l'insieme, per esempio la lingua corretta
 * di una fonte: invalida la firma salvata e programma con la regola dei 10/30 minuti. Se l'input resta
 * uguale, la generazione riusa l'output salvato senza chiamare il modello.
 */
export async function invalidaRiepilogoNews(dip: Dipendenze, ctx: ContestoUtente): Promise<Date> {
  await news.invalida(ctx);
  return programmaRiepilogoNews(dip, ctx);
}

/**
 * Comando "Aggiorna": esegue subito, sostituendo l'orario di un job già programmato, e rigenera anche se
 * l'insieme non è cambiato. L'invocazione riusa l'output salvato se modello, Contesto AI e lingua sono
 * gli stessi, altrimenti chiama il modello.
 */
export async function aggiornaOra(dip: Dipendenze, ctx: ContestoUtente): Promise<void> {
  await news.invalida(ctx);
  await ctx.coda.accoda(
    "aggiorna_riepilogo_news",
    { utenteId: ctx.utenteId },
    opzioniNews(chiaveRiepilogoNews(ctx.utenteId), "replace", dip.orologio.ora(), ctx.utenteId),
  );
}

export type EsitoRiepilogoNews = "vuoto" | "invariato" | "generato" | "superato" | "in_pausa" | "riprova" | "errore";

/**
 * Job `aggiorna_riepilogo_news` (§11). Calcola l'appartenenza esatta; senza News scrive il riepilogo vuoto
 * senza chiamare il modello; con la stessa firma non fa nulla (salvo `forza`, o dopo "Aggiorna" che invalida
 * la firma salvata); altrimenti genera e scrive solo se, al momento di salvare, l'insieme delle email è
 * ancora quello di partenza.
 */
export async function aggiornaRiepilogoNews(
  dip: Dipendenze,
  utenteId: string,
  opzioni: { forza?: boolean } = {},
): Promise<EsitoRiepilogoNews> {
  const inizio = await dip.unita.perUtente(utenteId, async (ctx) => {
    const ora = dip.orologio.ora();
    const preferenze = await impostazioni.preferenze(ctx);
    const membri = await appartenenza(ctx, ora);
    const firma = firmaInsiemeNews(membri.ids, preferenze.lingua);
    const salvato = await news.stato(ctx);
    if (membri.ids.length === 0) {
      if (salvato?.firmaInsieme !== firma) {
        await news.salva(ctx, { firmaInsieme: firma, voci: [], finestraFine: ora, generatoIl: ora, analisiId: null });
      }
      await azzeraErrori(ctx, ora);
      return { tipo: "vuoto" as const };
    }
    if (!opzioni.forza && salvato?.firmaInsieme === firma) return { tipo: "invariato" as const };
    const inviati = membri.ids.slice(0, MASSIMO_EMAIL_RIEPILOGO);
    const lette = new Map((await posta.leggiMolte(ctx, inviati)).map((e) => [e.id, e]));
    // Ordine stabile (dalla più recente): stessi alias per la stessa appartenenza, quindi stesso hash dell'input.
    const emails = inviati.flatMap((id): Email[] => {
      const e = lette.get(id);
      return e ? [e] : [];
    });
    return { tipo: "genera" as const, ora, firma, emails, linguaInterfaccia: preferenze.lingua, fuso: preferenze.fusoOrario };
  });
  if (inizio.tipo !== "genera") return inizio.tipo;

  const alias: Record<string, string> = {};
  const dati = {
    email: inizio.emails.map((e, i) => {
      alias[`e${i + 1}`] = e.id;
      return emailPerModello(e, `e${i + 1}`, inizio.fuso, { contesto: true });
    }),
  };
  const esito = await invocaFunzione(dip, utenteId, {
    funzione: "riepilogo_news",
    emailId: null,
    dati,
    tabella: { email: alias },
    linguaOutput: linguaVoceRiepilogo(
      inizio.emails.map((e) => e.lingua),
      inizio.linguaInterfaccia,
    ),
  });
  // In pausa non si scrive nulla: la ripresa dell'analisi deve riprogrammare il riepilogo.
  if (esito.tipo === "in_pausa") return "in_pausa";
  if (esito.tipo === "riprova" || esito.tipo === "errore") {
    await registraErrore(dip, utenteId, esito);
    return esito.tipo;
  }

  const inviati = new Set(inizio.emails.map((e) => e.id));
  const voci: VoceRiepilogo[] = esito.output.voci
    .map((v) => ({ testo: v.testo, emailIds: [...new Set(v.email)].filter((id) => inviati.has(id)) }))
    .filter((v) => v.emailIds.length > 0);

  return dip.unita.perUtente(utenteId, async (ctx): Promise<EsitoRiepilogoNews> => {
    const ora = dip.orologio.ora();
    const preferenze = await impostazioni.preferenze(ctx);
    const membri = await appartenenza(ctx, ora);
    if (firmaInsiemeNews(membri.ids, preferenze.lingua) !== inizio.firma) {
      // L'insieme è cambiato durante la generazione: si scarta e si riprogramma con la regola dei 10/30 minuti.
      await programmaRiepilogoNews(dip, ctx);
      return "superato";
    }
    await news.salva(ctx, { firmaInsieme: inizio.firma, voci, finestraFine: inizio.ora, generatoIl: ora, analisiId: esito.analisiId });
    await azzeraErrori(ctx, ora);
    const uscita = prossimaUscitaDallaFinestra(membri.ricevute, ora);
    if (uscita) {
      await ctx.coda.accoda(
        "aggiorna_riepilogo_news",
        { utenteId },
        opzioniNews(chiaveUscitaNews(utenteId), "replace", prossimaRigenerazione(uscita, ora), utenteId),
      );
    }
    return "generato";
  });
}

async function azzeraErrori(ctx: ContestoUtente, ora: Date): Promise<void> {
  const stato = await impostazioni.statoElaborazione(ctx);
  if (stato && (stato.newsErrori > 0 || stato.newsErrore !== null || stato.newsNonPrimaDi !== null)) {
    await impostazioni.aggiornaStatoElaborazione(ctx, { newsErrori: 0, newsErrore: null, newsNonPrimaDi: null }, ora);
  }
}

/**
 * Ritentativi nel dominio (§8): gli errori transitori si riaccodano con backoff; quelli definitivi restano
 * un codice e non si riaccodano. Anche dopo un errore definitivo `newsNonPrimaDi` distanzia la generazione
 * successiva: una fallita non blocca il claim, e ogni cambio che non tocca l'insieme ripeterebbe la stessa
 * chiamata a pagamento. "Aggiorna" resta immediato.
 */
async function registraErrore(
  dip: Dipendenze,
  utenteId: string,
  esito: { tipo: "riprova"; dopoMs: number } | { tipo: "errore"; codice: string },
): Promise<void> {
  const ora = dip.orologio.ora();
  await dip.unita.perUtente(utenteId, async (ctx) => {
    const errori = ((await impostazioni.statoElaborazione(ctx))?.newsErrori ?? 0) + 1;
    if (esito.tipo === "errore") {
      const nonPrimaDi = prossimoTentativo(ora, errori, null, utenteId);
      await impostazioni.aggiornaStatoElaborazione(ctx, { newsErrori: errori, newsErrore: esito.codice, newsNonPrimaDi: nonPrimaDi }, ora);
      return;
    }
    const nonPrimaDi = prossimoTentativo(ora, errori, esito.dopoMs, utenteId);
    await impostazioni.aggiornaStatoElaborazione(ctx, { newsErrori: errori, newsErrore: "temporaneo", newsNonPrimaDi: nonPrimaDi }, ora);
    await ctx.coda.accoda("aggiorna_riepilogo_news", { utenteId }, opzioniNews(chiaveRiepilogoNews(utenteId), "replace", nonPrimaDi, utenteId));
  });
}

export interface MembroVistaNews {
  emailId: string;
  mittente: Indirizzo;
  oggetto: string;
  anteprima: string;
  ricevutaIl: Date;
  /** Casella collegata di provenienza. */
  casellaIndirizzo: string | null;
  /** false se nessuna voce visibile la cita: rientra tra le "non ancora nel riepilogo". */
  nelRiepilogo: boolean;
}

export interface VistaNews {
  generatoIl: Date | null;
  /** Solo le voci le cui fonti sono tutte ancora incluse. */
  voci: VoceRiepilogo[];
  nonIncluse: number;
  membri: MembroVistaNews[];
  /** "Nessuna News nelle ultime 24 ore". */
  vuoto: boolean;
  /** Codice dell'ultimo errore del riepilogo, tradotto dall'interfaccia. */
  errore: string | null;
}

/** Area News della home: appartenenza esatta all'istante della consultazione, voci solo se tutte le fonti sono incluse. */
export async function vistaNews(dip: Dipendenze, ctx: ContestoUtente): Promise<VistaNews> {
  const ora = dip.orologio.ora();
  const membri = await appartenenza(ctx, ora);
  const salvato = await news.leggi(ctx);
  const voci = salvato ? vociVisibili(salvato.voci, membri.ids) : [];
  const nonIncluse = new Set(emailNonIncluse(membri.ids, voci));
  const lette = new Map((await posta.leggiMolte(ctx, membri.ids, false)).map((e) => [e.id, e]));
  const caselleEmail = await news.caselleDelleEmail(ctx, membri.ids);
  const indirizzi = new Map((await caselle.elenca(ctx)).map((c) => [c.id, c.indirizzo]));
  const elaborazione = await impostazioni.statoElaborazione(ctx);
  return {
    generatoIl: salvato?.generatoIl ?? null,
    voci,
    nonIncluse: nonIncluse.size,
    membri: membri.ids.flatMap((id): MembroVistaNews[] => {
      const e = lette.get(id);
      if (!e) return [];
      const casellaId = caselleEmail.get(id);
      return [
        {
          emailId: id,
          mittente: e.mittente,
          oggetto: e.oggetto,
          anteprima: e.anteprima,
          ricevutaIl: e.ricevutaIl,
          casellaIndirizzo: casellaId ? (indirizzi.get(casellaId) ?? null) : null,
          nelRiepilogo: !nonIncluse.has(id),
        },
      ];
    }),
    vuoto: membri.ids.length === 0,
    errore: elaborazione?.newsErrore ?? null,
  };
}
