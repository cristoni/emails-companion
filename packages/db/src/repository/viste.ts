import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Cartella, Categoria, Direzione, FaseImportazione, FunzioneAI, Priorita, StatoCasella, StatoFunzioneEmail } from "@ec/core/dominio";
import {
  analisiAi,
  casella,
  classificazioneEmail,
  email,
  emailCopia,
  rispostaArrivata,
  sincronizzazioneCasella,
  situazione,
  statoElaborazioneUtente,
  statoFunzioneEmail,
  type AvanzamentoImportazione,
} from "../schema";
import type { ContestoUtente } from "../unita-di-lavoro";

/** Casella con il suo stato di sincronizzazione, senza credenziali né indici. */
export interface CasellaInVista {
  id: string;
  connettore: string;
  indirizzo: string;
  stato: StatoCasella;
  scopeConcessi: string[];
  ultimoErrore: string | null;
  collegataIl: Date;
  faseImportazione: FaseImportazione | null;
  avanzamento: AvanzamentoImportazione | null;
  stima: { numeroEmail: number; costoStimato: number; calcolataIl: string } | null;
  ultimaSyncOk: Date | null;
  nonPrimaDi: Date | null;
  erroriConsecutivi: number;
  erroreSincronizzazione: string | null;
}

export interface CopiaInVista {
  emailId: string;
  casellaId: string;
  idConnettore: string;
  thread: string | null;
  cartelle: Cartella[];
  origineInvio: "app" | "esterna" | null;
  eliminataNelProvider: boolean;
}

export interface ClassificazioneInVista {
  categoria: Categoria;
  urgente: boolean;
  priorita: Priorita;
  baseUrgenza: "rilevato" | "dedotto";
  analisiId: string | null;
}

/** Letture per le viste dell'interfaccia: solo colonne in chiaro, tranne dove indicato. */
export const viste = {
  /** Caselle non scollegate con lo stato di sincronizzazione; decifra solo l'indirizzo. */
  async caselle(ctx: ContestoUtente): Promise<CasellaInVista[]> {
    const righe = await ctx.tx
      .select({
        id: casella.id,
        connettore: casella.connettore,
        indirizzoCifrato: casella.indirizzoCifrato,
        stato: casella.stato,
        scopeConcessi: casella.scopeConcessi,
        ultimoErrore: casella.ultimoErrore,
        collegataIl: casella.collegataIl,
        fase: sincronizzazioneCasella.faseImportazione,
        avanzamento: sincronizzazioneCasella.avanzamento,
        stima: sincronizzazioneCasella.stima,
        ultimaSyncOk: sincronizzazioneCasella.ultimaSyncOk,
        nonPrimaDi: sincronizzazioneCasella.nonPrimaDi,
        erroriConsecutivi: sincronizzazioneCasella.erroriConsecutivi,
        erroreSincronizzazione: sincronizzazioneCasella.ultimoErrore,
      })
      .from(casella)
      .leftJoin(
        sincronizzazioneCasella,
        and(eq(sincronizzazioneCasella.casellaId, casella.id), eq(sincronizzazioneCasella.utenteId, ctx.utenteId)),
      )
      .where(and(eq(casella.utenteId, ctx.utenteId), ne(casella.stato, "scollegata")))
      .orderBy(casella.collegataIl, casella.id);
    return Promise.all(
      righe.map(async (r) => ({
        id: r.id,
        connettore: r.connettore,
        indirizzo: r.indirizzoCifrato ? await ctx.codec.decifra("casella", "indirizzo", r.id, r.indirizzoCifrato) : "",
        stato: r.stato as StatoCasella,
        scopeConcessi: r.scopeConcessi,
        ultimoErrore: r.ultimoErrore,
        collegataIl: r.collegataIl,
        faseImportazione: (r.fase ?? null) as FaseImportazione | null,
        avanzamento: r.avanzamento ?? null,
        stima: r.stima ? { numeroEmail: r.stima.numeroEmail, costoStimato: r.stima.costoStimato, calcolataIl: r.stima.calcolataIl } : null,
        ultimaSyncOk: r.ultimaSyncOk ?? null,
        nonPrimaDi: r.nonPrimaDi ?? null,
        erroriConsecutivi: r.erroriConsecutivi ?? 0,
        erroreSincronizzazione: r.erroreSincronizzazione ?? null,
      })),
    );
  },

  /** Situazioni candidate alla home: non assorbite e non archiviate. */
  async idSituazioniHome(ctx: ContestoUtente): Promise<string[]> {
    const righe = await ctx.tx
      .select({ id: situazione.id })
      .from(situazione)
      .where(and(eq(situazione.utenteId, ctx.utenteId), isNull(situazione.assorbitaIn), isNull(situazione.archiviataIl)))
      .orderBy(desc(situazione.ultimaAttivita), situazione.id);
    return righe.map((r) => r.id);
  },

  /** Segue i reindirizzamenti delle Situazioni assorbite; null se la Situazione non è dell'utente. */
  async risolviSituazione(ctx: ContestoUtente, id: string): Promise<string | null> {
    let corrente = id;
    for (let passo = 0; passo < 16; passo++) {
      const [r] = await ctx.tx
        .select({ id: situazione.id, assorbitaIn: situazione.assorbitaIn })
        .from(situazione)
        .where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.id, corrente)));
      if (!r) return null;
      if (!r.assorbitaIn || r.assorbitaIn === r.id) return r.id;
      corrente = r.assorbitaIn;
    }
    return null;
  },

  /** Titoli decifrati delle Situazioni indicate. */
  async titoliSituazioni(ctx: ContestoUtente, ids: string[]): Promise<Map<string, { titolo: string; assorbitaIn: string | null }>> {
    if (ids.length === 0) return new Map();
    const righe = await ctx.tx
      .select({ id: situazione.id, titolo: situazione.titoloCifrato, assorbitaIn: situazione.assorbitaIn })
      .from(situazione)
      .where(and(eq(situazione.utenteId, ctx.utenteId), inArray(situazione.id, ids)));
    const voci = await Promise.all(
      righe.map(async (r) => [r.id, { titolo: await ctx.codec.decifra("situazione", "titolo", r.id, r.titolo), assorbitaIn: r.assorbitaIn }] as const),
    );
    return new Map(voci);
  },

  /** Direzione e ricezione delle email, senza decifrare. */
  async infoEmail(ctx: ContestoUtente, ids: string[]): Promise<Map<string, { direzione: Direzione; ricevutaIl: Date; soloPerRisposte: boolean }>> {
    if (ids.length === 0) return new Map();
    const righe = await ctx.tx
      .select({ id: email.id, direzione: email.direzione, ricevutaIl: email.ricevutaIl, soloPerRisposte: email.soloPerRisposte })
      .from(email)
      .where(and(eq(email.utenteId, ctx.utenteId), inArray(email.id, ids)));
    return new Map(righe.map((r) => [r.id, { direzione: r.direzione as Direzione, ricevutaIl: r.ricevutaIl, soloPerRisposte: r.soloPerRisposte }]));
  },

  /** Valori dell'AI della classificazione (senza motivazione cifrata). */
  async classificazioni(ctx: ContestoUtente, emailIds: string[]): Promise<Map<string, ClassificazioneInVista>> {
    if (emailIds.length === 0) return new Map();
    const righe = await ctx.tx
      .select({
        emailId: classificazioneEmail.emailId,
        categoria: classificazioneEmail.categoria,
        urgente: classificazioneEmail.urgente,
        priorita: classificazioneEmail.priorita,
        baseUrgenza: classificazioneEmail.baseUrgenza,
        analisiId: classificazioneEmail.analisiId,
      })
      .from(classificazioneEmail)
      .where(and(eq(classificazioneEmail.utenteId, ctx.utenteId), inArray(classificazioneEmail.emailId, emailIds)));
    return new Map(
      righe.map((r) => [
        r.emailId,
        {
          categoria: r.categoria as Categoria,
          urgente: r.urgente,
          priorita: r.priorita as Priorita,
          baseUrgenza: r.baseUrgenza as "rilevato" | "dedotto",
          analisiId: r.analisiId,
        },
      ]),
    );
  },

  async copie(ctx: ContestoUtente, emailIds: string[]): Promise<CopiaInVista[]> {
    if (emailIds.length === 0) return [];
    const righe = await ctx.tx
      .select({
        emailId: emailCopia.emailId,
        casellaId: emailCopia.casellaId,
        idConnettore: emailCopia.idConnettore,
        thread: emailCopia.threadConnettore,
        cartelle: emailCopia.cartelle,
        origineInvio: emailCopia.origineInvio,
        eliminataNelProvider: emailCopia.eliminataNelProvider,
      })
      .from(emailCopia)
      .where(and(eq(emailCopia.utenteId, ctx.utenteId), inArray(emailCopia.emailId, emailIds)))
      .orderBy(emailCopia.acquisitaIl, emailCopia.id);
    return righe.map((r) => ({
      ...r,
      cartelle: r.cartelle as Cartella[],
      origineInvio: r.origineInvio as CopiaInVista["origineInvio"],
    }));
  },

  /** Motivazioni decifrate delle Risposte arrivate. */
  async motivazioniRisposte(ctx: ContestoUtente, ids: string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map();
    const righe = await ctx.tx
      .select({ id: rispostaArrivata.id, motivazione: rispostaArrivata.motivazioneCifrata })
      .from(rispostaArrivata)
      .where(and(eq(rispostaArrivata.utenteId, ctx.utenteId), inArray(rispostaArrivata.id, ids)));
    const voci = await Promise.all(
      righe.map(async (r) => [r.id, await ctx.codec.decifraOpzionale("risposta_arrivata", "motivazione", r.id, r.motivazione)] as const),
    );
    return new Map(voci);
  },

  /** Pagina dell'elenco della posta (id), dalla più recente, con cursore (ricevuta, id) esclusivo. */
  async paginaEmail(ctx: ContestoUtente, opzioni: { casellaId?: string; prima?: { ricevutaIl: Date; id: string }; limite: number }): Promise<string[]> {
    const conCopia = opzioni.casellaId
      ? sql`exists (select 1 from email_copia c where c.utente_id = ${ctx.utenteId} and c.email_id = ${email.id} and c.casella_id = ${opzioni.casellaId}::uuid)`
      : sql`exists (select 1 from email_copia c where c.utente_id = ${ctx.utenteId} and c.email_id = ${email.id})`;
    const righe = await ctx.tx
      .select({ id: email.id })
      .from(email)
      .where(
        and(
          eq(email.utenteId, ctx.utenteId),
          eq(email.soloPerRisposte, false),
          conCopia,
          opzioni.prima
            ? sql`(${email.ricevutaIl}, ${email.id}) < (${opzioni.prima.ricevutaIl.toISOString()}::timestamptz, ${opzioni.prima.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(email.ricevutaIl), desc(email.id))
      .limit(opzioni.limite);
    return righe.map((r) => r.id);
  },

  async statiFunzioni(ctx: ContestoUtente, emailIds: string[]): Promise<Map<string, { funzione: FunzioneAI; stato: StatoFunzioneEmail; motivo: string | null }[]>> {
    if (emailIds.length === 0) return new Map();
    const righe = await ctx.tx
      .select({ emailId: statoFunzioneEmail.emailId, funzione: statoFunzioneEmail.funzione, stato: statoFunzioneEmail.stato, motivo: statoFunzioneEmail.motivo })
      .from(statoFunzioneEmail)
      .where(and(eq(statoFunzioneEmail.utenteId, ctx.utenteId), inArray(statoFunzioneEmail.emailId, emailIds)));
    const per = new Map<string, { funzione: FunzioneAI; stato: StatoFunzioneEmail; motivo: string | null }[]>();
    for (const r of righe) {
      per.set(r.emailId, [...(per.get(r.emailId) ?? []), { funzione: r.funzione as FunzioneAI, stato: r.stato as StatoFunzioneEmail, motivo: r.motivo }]);
    }
    return per;
  },

  /** Ultime invocazioni fallite: solo codici. */
  async erroriAnalisi(ctx: ContestoUtente, limite: number) {
    const righe = await ctx.tx
      .select({ id: analisiAi.id, funzione: analisiAi.funzione, emailId: analisiAi.emailId, errore: analisiAi.errore, il: analisiAi.completataIl, avviataIl: analisiAi.avviataIl })
      .from(analisiAi)
      .where(and(eq(analisiAi.utenteId, ctx.utenteId), eq(analisiAi.stato, "fallita")))
      .orderBy(desc(analisiAi.avviataIl), desc(analisiAi.id))
      .limit(limite);
    return righe.map((r) => ({ analisiId: r.id, funzione: r.funzione as FunzioneAI, emailId: r.emailId, codice: r.errore ?? "sconosciuto", il: r.il ?? r.avviataIl }));
  },

  /** Email con una funzione in errore, con il codice registrato. */
  async funzioniInErrore(ctx: ContestoUtente, limite: number) {
    const righe = await ctx.tx
      .select({ emailId: statoFunzioneEmail.emailId, funzione: statoFunzioneEmail.funzione, motivo: statoFunzioneEmail.motivo, il: statoFunzioneEmail.aggiornatoIl })
      .from(statoFunzioneEmail)
      .where(and(eq(statoFunzioneEmail.utenteId, ctx.utenteId), eq(statoFunzioneEmail.stato, "errore")))
      .orderBy(desc(statoFunzioneEmail.aggiornatoIl))
      .limit(limite);
    return righe.map((r) => ({ emailId: r.emailId, funzione: r.funzione as FunzioneAI, codice: r.motivo ?? "sconosciuto", il: r.il }));
  },

  async statoElaborazione(ctx: ContestoUtente) {
    const [r] = await ctx.tx
      .select({
        riconciliazioneErrori: statoElaborazioneUtente.riconciliazioneErrori,
        riconciliazioneErrore: statoElaborazioneUtente.riconciliazioneErrore,
        riconciliazioneNonPrimaDi: statoElaborazioneUtente.riconciliazioneNonPrimaDi,
        newsErrori: statoElaborazioneUtente.newsErrori,
        newsErrore: statoElaborazioneUtente.newsErrore,
        newsNonPrimaDi: statoElaborazioneUtente.newsNonPrimaDi,
      })
      .from(statoElaborazioneUtente)
      .where(eq(statoElaborazioneUtente.utenteId, ctx.utenteId));
    return r ?? null;
  },
};
