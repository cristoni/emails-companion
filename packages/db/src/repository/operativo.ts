import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type {
  Attesa,
  Attivita,
  Base,
  CicloAttesa,
  Collegamento,
  Correzione,
  EventoSituazione,
  Evidenza,
  Indirizzo,
  OrigineCollegamento,
  Priorita,
  RispostaArrivata,
  RuoloCollegamento,
  Situazione,
  Soggetto,
  StatoCollegamento,
  StatoElemento,
  StatoRevisione,
  TipoSoggetto,
  Valutazione,
  Requisito,
} from "@ec/core/dominio";
import {
  attesa,
  attesaRequisito,
  attivita,
  collegamento,
  correzione,
  eventoSituazione,
  evidenza,
  requisitoSoddisfatto,
  rispostaArrivata,
  situazione,
} from "../schema";
import type { ContestoUtente } from "../unita-di-lavoro";

type ColonnaSoggetto = "situazioneId" | "attivitaId" | "attesaId" | "rispostaId" | "emailId" | "collegamentoId";
const COLONNA_CORREZIONE: Record<TipoSoggetto, ColonnaSoggetto> = {
  situazione: "situazioneId",
  attivita: "attivitaId",
  attesa: "attesaId",
  risposta: "rispostaId",
  email: "emailId",
  collegamento: "collegamentoId",
};

type SoggettoEvidenza =
  | { tipo: "situazione"; id: string }
  | { tipo: "attivita"; id: string }
  | { tipo: "attesa"; id: string }
  | { tipo: "risposta"; id: string; requisitoId: string | null };

async function evidenzeDi(ctx: ContestoUtente, righe: (typeof evidenza.$inferSelect)[]): Promise<Evidenza[]> {
  return Promise.all(
    righe.map(async (e) => ({
      emailId: e.emailId,
      citazione: await ctx.codec.decifra("evidenza", "citazione", e.id, e.citazioneCifrata),
      inizio: e.inizio,
      fine: e.fine,
      verificata: e.verificata,
    })),
  );
}

export interface AggregatoSituazione {
  situazione: Situazione;
  collegamenti: Collegamento[];
  attivita: Attivita[];
  attese: { attesa: Attesa; requisiti: Requisito[] }[];
  risposte: RispostaArrivata[];
  correzioni: Correzione[];
}

export const operativo = {
  // ── Situazioni ──

  async creaSituazione(ctx: ContestoUtente, s: Omit<Situazione, "utenteId" | "assorbitaIn" | "gestitaIl" | "archiviataIl">) {
    const inserite = await ctx.tx
      .insert(situazione)
      .values({
        id: s.id,
        utenteId: ctx.utenteId,
        emailOrigineId: s.emailOrigineId,
        titoloCifrato: await ctx.codec.cifra("situazione", "titolo", s.id, s.titolo),
        descrizioneCifrata: await ctx.codec.cifra("situazione", "descrizione", s.id, s.descrizione),
        lingua: s.lingua,
        ultimaAttivita: s.creataIl,
        creataIl: s.creataIl,
        aggiornataIl: s.creataIl,
      })
      .onConflictDoNothing()
      .returning({ id: situazione.id });
    if (inserite[0]) return inserite[0].id;
    const [esistente] = await ctx.tx
      .select({ id: situazione.id })
      .from(situazione)
      .where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.emailOrigineId, s.emailOrigineId)));
    if (!esistente) throw new Error("situazione_non_trovata");
    return esistente.id;
  },

  async situazionePerOrigine(ctx: ContestoUtente, emailOrigineId: string): Promise<string | null> {
    const [r] = await ctx.tx
      .select({ id: situazione.id, assorbitaIn: situazione.assorbitaIn })
      .from(situazione)
      .where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.emailOrigineId, emailOrigineId)));
    return r ? (r.assorbitaIn ?? r.id) : null;
  },

  async aggiornaTestoSituazione(ctx: ContestoUtente, id: string, titolo: string, descrizione: string, ora: Date) {
    await ctx.tx
      .update(situazione)
      .set({
        titoloCifrato: await ctx.codec.cifra("situazione", "titolo", id, titolo),
        descrizioneCifrata: await ctx.codec.cifra("situazione", "descrizione", id, descrizione),
        aggiornataIl: ora,
      })
      .where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.id, id)));
  },

  async toccaSituazione(ctx: ContestoUtente, id: string, attivitaIl: Date) {
    await ctx.tx
      .update(situazione)
      .set({ ultimaAttivita: sql`greatest(${situazione.ultimaAttivita}, ${attivitaIl.toISOString()}::timestamptz)` })
      .where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.id, id)));
  },

  async impostaMarcatoriSituazione(ctx: ContestoUtente, id: string, m: { gestitaIl?: Date | null; archiviataIl?: Date | null }) {
    await ctx.tx.update(situazione).set(m).where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.id, id)));
  },

  /** Fusione: la Situazione assorbita reindirizza alla destinazione e le cede elementi e collegamenti. */
  async assorbi(ctx: ContestoUtente, daId: string, inId: string, ora: Date) {
    await ctx.tx.update(attivita).set({ situazioneId: inId, aggiornataIl: ora }).where(and(eq(attivita.utenteId, ctx.utenteId), eq(attivita.situazioneId, daId)));
    await ctx.tx.update(attesa).set({ situazioneId: inId, aggiornataIl: ora }).where(and(eq(attesa.utenteId, ctx.utenteId), eq(attesa.situazioneId, daId)));
    const collegati = await ctx.tx
      .select()
      .from(collegamento)
      .where(and(eq(collegamento.utenteId, ctx.utenteId), eq(collegamento.situazioneId, daId)));
    for (const c of collegati) {
      await ctx.tx
        .insert(collegamento)
        .values({ ...c, id: crypto.randomUUID(), situazioneId: inId, aggiornatoIl: ora })
        .onConflictDoNothing();
    }
    await ctx.tx.update(situazione).set({ assorbitaIn: inId, aggiornataIl: ora }).where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.id, daId)));
    await ctx.tx.update(situazione).set({ assorbitaIn: inId }).where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.assorbitaIn, daId)));
  },

  /** Separa di nuovo una Situazione assorbita, riportandole gli elementi nati dalle sue email. */
  async separa(ctx: ContestoUtente, id: string, emailProprie: string[], ora: Date) {
    await ctx.tx.update(situazione).set({ assorbitaIn: null, aggiornataIl: ora }).where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.id, id)));
    if (emailProprie.length === 0) return;
    await ctx.tx
      .update(attivita)
      .set({ situazioneId: id, aggiornataIl: ora })
      .where(and(eq(attivita.utenteId, ctx.utenteId), inArray(attivita.emailSorgenteId, emailProprie)));
    await ctx.tx
      .update(attesa)
      .set({ situazioneId: id, aggiornataIl: ora })
      .where(and(eq(attesa.utenteId, ctx.utenteId), inArray(attesa.emailRichiestaId, emailProprie)));
  },

  async idSituazioniVisibili(ctx: ContestoUtente): Promise<string[]> {
    const righe = await ctx.tx
      .select({ id: situazione.id })
      .from(situazione)
      .where(and(eq(situazione.utenteId, ctx.utenteId), isNull(situazione.assorbitaIn)))
      .orderBy(desc(situazione.ultimaAttivita));
    return righe.map((r) => r.id);
  },

  // ── Collegamenti ──

  /** Crea il collegamento; se esiste non lo riporta mai indietro da 'rifiutato' o 'confermato'. */
  async collega(
    ctx: ContestoUtente,
    c: { emailId: string; situazioneId: string; origine: OrigineCollegamento; ruolo: RuoloCollegamento; stato: StatoCollegamento; confidenza: number | null; analisiId: string | null },
    ora: Date,
  ): Promise<{ id: string; stato: StatoCollegamento }> {
    const id = crypto.randomUUID();
    await ctx.tx
      .insert(collegamento)
      .values({ id, utenteId: ctx.utenteId, ...c, creatoIl: ora, aggiornatoIl: ora })
      .onConflictDoNothing();
    const [r] = await ctx.tx
      .select({ id: collegamento.id, stato: collegamento.stato, origine: collegamento.origine })
      .from(collegamento)
      .where(and(eq(collegamento.utenteId, ctx.utenteId), eq(collegamento.emailId, c.emailId), eq(collegamento.situazioneId, c.situazioneId)));
    if (!r) throw new Error("collegamento_non_trovato");
    if (r.stato === "proposto" && c.stato === "confermato" && c.origine !== "ai") {
      await ctx.tx
        .update(collegamento)
        .set({ stato: "confermato", origine: c.origine, aggiornatoIl: ora })
        .where(and(eq(collegamento.utenteId, ctx.utenteId), eq(collegamento.id, r.id), eq(collegamento.stato, "proposto")));
      return { id: r.id, stato: "confermato" };
    }
    return { id: r.id, stato: r.stato as StatoCollegamento };
  },

  async collegamentiDellEmail(ctx: ContestoUtente, emailId: string): Promise<Collegamento[]> {
    const righe = await ctx.tx.select().from(collegamento).where(and(eq(collegamento.utenteId, ctx.utenteId), eq(collegamento.emailId, emailId)));
    return righe.map(mappaCollegamento);
  },

  async collegamentiRifiutati(ctx: ContestoUtente, emailId: string): Promise<Set<string>> {
    const righe = await ctx.tx
      .select({ situazioneId: collegamento.situazioneId })
      .from(collegamento)
      .where(and(eq(collegamento.utenteId, ctx.utenteId), eq(collegamento.emailId, emailId), eq(collegamento.stato, "rifiutato")));
    return new Set(righe.map((r) => r.situazioneId));
  },

  // ── Attività ──

  async inserisciAttivita(ctx: ContestoUtente, a: Omit<Attivita, "utenteId">, evidenze: Evidenza[]) {
    await ctx.tx.insert(attivita).values({
      id: a.id,
      utenteId: ctx.utenteId,
      situazioneId: a.situazioneId,
      emailSorgenteId: a.emailSorgenteId,
      slot: a.slot,
      descrizioneCifrata: await ctx.codec.cifra("attivita", "descrizione", a.id, a.descrizione),
      scadenza: a.scadenza,
      scadenzaCitazioneCifrata: await ctx.codec.cifraOpzionale("attivita", "scadenza_citazione", a.id, a.scadenzaCitazione),
      priorita: a.priorita,
      urgente: a.urgente,
      base: a.base,
      stato: a.stato,
      completataDa: a.completataDa,
      emailCompletamentoId: a.emailCompletamentoId,
      completataIl: a.completataIl,
      analisiId: a.analisiId,
      creataIl: a.creataIl,
      aggiornataIl: a.creataIl,
    });
    await operativo.sostituisciEvidenze(ctx, { tipo: "attivita", id: a.id }, "attivita", a.base, evidenze, a.analisiId);
  },

  /** Aggiorna i valori prodotti dall'AI; le correzioni dell'utente restano separate e prevalgono. */
  async aggiornaAttivita(
    ctx: ContestoUtente,
    id: string,
    m: Partial<Pick<Attivita, "descrizione" | "scadenza" | "scadenzaCitazione" | "priorita" | "urgente" | "base" | "stato" | "completataDa" | "emailCompletamentoId" | "completataIl" | "analisiId" | "situazioneId">>,
    ora: Date,
  ) {
    const valori: Partial<typeof attivita.$inferInsert> = { aggiornataIl: ora };
    if (m.descrizione !== undefined) valori.descrizioneCifrata = await ctx.codec.cifra("attivita", "descrizione", id, m.descrizione);
    if (m.scadenzaCitazione !== undefined) valori.scadenzaCitazioneCifrata = await ctx.codec.cifraOpzionale("attivita", "scadenza_citazione", id, m.scadenzaCitazione);
    for (const k of ["scadenza", "priorita", "urgente", "base", "stato", "completataDa", "emailCompletamentoId", "completataIl", "analisiId", "situazioneId"] as const) {
      if (m[k] !== undefined) (valori as Record<string, unknown>)[k] = m[k];
    }
    await ctx.tx.update(attivita).set(valori).where(and(eq(attivita.utenteId, ctx.utenteId), eq(attivita.id, id)));
  },

  async attivitaDellEmail(ctx: ContestoUtente, emailId: string): Promise<Attivita[]> {
    const righe = await ctx.tx.select().from(attivita).where(and(eq(attivita.utenteId, ctx.utenteId), eq(attivita.emailSorgenteId, emailId)));
    return operativo.mappaAttivita(ctx, righe);
  },

  async attivitaAperteDellUtente(ctx: ContestoUtente): Promise<Attivita[]> {
    const righe = await ctx.tx
      .select()
      .from(attivita)
      .where(and(eq(attivita.utenteId, ctx.utenteId), inArray(attivita.stato, ["proposta", "confermata"])));
    return operativo.mappaAttivita(ctx, righe);
  },

  async mappaAttivita(ctx: ContestoUtente, righe: (typeof attivita.$inferSelect)[]): Promise<Attivita[]> {
    if (righe.length === 0) return [];
    const ev = await ctx.tx
      .select()
      .from(evidenza)
      .where(and(eq(evidenza.utenteId, ctx.utenteId), inArray(evidenza.attivitaId, righe.map((r) => r.id))));
    return Promise.all(
      righe.map(async (r) => ({
        id: r.id,
        utenteId: r.utenteId,
        situazioneId: r.situazioneId,
        emailSorgenteId: r.emailSorgenteId,
        slot: r.slot,
        descrizione: await ctx.codec.decifra("attivita", "descrizione", r.id, r.descrizioneCifrata),
        scadenza: r.scadenza,
        scadenzaCitazione: await ctx.codec.decifraOpzionale("attivita", "scadenza_citazione", r.id, r.scadenzaCitazioneCifrata),
        priorita: r.priorita as Priorita,
        urgente: r.urgente,
        base: r.base as Base,
        stato: r.stato as StatoElemento,
        completataDa: r.completataDa as Attivita["completataDa"],
        emailCompletamentoId: r.emailCompletamentoId,
        completataIl: r.completataIl,
        evidenze: await evidenzeDi(ctx, ev.filter((e) => e.attivitaId === r.id)),
        analisiId: r.analisiId,
        creataIl: r.creataIl,
      })),
    );
  },

  // ── Attese, requisiti, risposte ──

  async inserisciAttesa(ctx: ContestoUtente, a: Omit<Attesa, "utenteId">, requisiti: { id: string; descrizione: string }[], destinatariIndici: string[]) {
    await ctx.tx.insert(attesa).values({
      id: a.id,
      utenteId: ctx.utenteId,
      situazioneId: a.situazioneId,
      emailRichiestaId: a.emailRichiestaId,
      slot: a.slot,
      destinatariCifrati: await ctx.codec.cifraJson("attesa", "destinatari", a.id, a.destinatari),
      destinatariIndici,
      oggettoCifrato: await ctx.codec.cifra("attesa", "oggetto", a.id, a.oggetto),
      dataAttesa: a.dataAttesa,
      ciclo: a.ciclo,
      base: a.base,
      analisiId: a.analisiId,
      creataIl: a.creataIl,
      aggiornataIl: a.creataIl,
    });
    await operativo.sostituisciRequisiti(ctx, a.id, requisiti);
    await operativo.sostituisciEvidenze(ctx, { tipo: "attesa", id: a.id }, "attesa", a.base, a.evidenze, a.analisiId);
  },

  async aggiornaAttesa(
    ctx: ContestoUtente,
    id: string,
    m: Partial<Pick<Attesa, "oggetto" | "dataAttesa" | "ciclo" | "base" | "analisiId" | "situazioneId">>,
    ora: Date,
  ) {
    const valori: Partial<typeof attesa.$inferInsert> = { aggiornataIl: ora };
    if (m.oggetto !== undefined) valori.oggettoCifrato = await ctx.codec.cifra("attesa", "oggetto", id, m.oggetto);
    for (const k of ["dataAttesa", "ciclo", "base", "analisiId", "situazioneId"] as const) {
      if (m[k] !== undefined) (valori as Record<string, unknown>)[k] = m[k];
    }
    await ctx.tx.update(attesa).set(valori).where(and(eq(attesa.utenteId, ctx.utenteId), eq(attesa.id, id)));
  },

  async sostituisciRequisiti(ctx: ContestoUtente, attesaId: string, requisiti: { id: string; descrizione: string }[]) {
    await ctx.tx.delete(attesaRequisito).where(and(eq(attesaRequisito.utenteId, ctx.utenteId), eq(attesaRequisito.attesaId, attesaId)));
    let ordine = 0;
    for (const r of requisiti) {
      await ctx.tx.insert(attesaRequisito).values({
        id: r.id,
        utenteId: ctx.utenteId,
        attesaId,
        descrizioneCifrata: await ctx.codec.cifra("attesa_requisito", "descrizione", r.id, r.descrizione),
        ordine: ordine++,
      });
    }
  },

  async atteseDellEmail(ctx: ContestoUtente, emailId: string) {
    const righe = await ctx.tx.select().from(attesa).where(and(eq(attesa.utenteId, ctx.utenteId), eq(attesa.emailRichiestaId, emailId)));
    return operativo.mappaAttese(ctx, righe);
  },

  /** Attese attive (proposte o confermate) dell'utente, per i candidati di risposta. */
  async atteseAttive(ctx: ContestoUtente) {
    const righe = await ctx.tx
      .select()
      .from(attesa)
      .where(and(eq(attesa.utenteId, ctx.utenteId), inArray(attesa.ciclo, ["proposta", "confermata"])));
    return operativo.mappaAttese(ctx, righe);
  },

  async mappaAttese(ctx: ContestoUtente, righe: (typeof attesa.$inferSelect)[]): Promise<{ attesa: Attesa; requisiti: Requisito[]; destinatariIndici: string[] }[]> {
    if (righe.length === 0) return [];
    const ids = righe.map((r) => r.id);
    const [req, ev] = await Promise.all([
      ctx.tx.select().from(attesaRequisito).where(and(eq(attesaRequisito.utenteId, ctx.utenteId), inArray(attesaRequisito.attesaId, ids))),
      ctx.tx.select().from(evidenza).where(and(eq(evidenza.utenteId, ctx.utenteId), inArray(evidenza.attesaId, ids))),
    ]);
    return Promise.all(
      righe.map(async (r) => ({
        attesa: {
          id: r.id,
          utenteId: r.utenteId,
          situazioneId: r.situazioneId,
          emailRichiestaId: r.emailRichiestaId,
          slot: r.slot,
          destinatari: await ctx.codec.decifraJson<Indirizzo[]>("attesa", "destinatari", r.id, r.destinatariCifrati),
          oggetto: await ctx.codec.decifra("attesa", "oggetto", r.id, r.oggettoCifrato),
          dataAttesa: r.dataAttesa,
          ciclo: r.ciclo as CicloAttesa,
          base: r.base as Base,
          evidenze: await evidenzeDi(ctx, ev.filter((e) => e.attesaId === r.id)),
          analisiId: r.analisiId,
          creataIl: r.creataIl,
        },
        requisiti: await Promise.all(
          req
            .filter((q) => q.attesaId === r.id)
            .sort((a, b) => a.ordine - b.ordine)
            .map(async (q) => ({
              id: q.id,
              attesaId: q.attesaId,
              descrizione: await ctx.codec.decifra("attesa_requisito", "descrizione", q.id, q.descrizioneCifrata),
              ordine: q.ordine,
            })),
        ),
        destinatariIndici: r.destinatariIndici,
      })),
    );
  },

  /** Crea o aggiorna la Risposta arrivata di una coppia Attesa–Email; un rifiuto resta come vincolo. */
  async registraRisposta(
    ctx: ContestoUtente,
    r: {
      attesaId: string;
      emailId: string;
      origine: OrigineCollegamento;
      statoCollegamento: StatoCollegamento;
      confidenza: number | null;
      valutazione: Valutazione;
      motivazione: string | null;
      arrivataIl: Date;
      analisiId: string | null;
      requisiti: { requisitoId: string; evidenze: Evidenza[] }[];
    },
    ora: Date,
  ): Promise<string> {
    const id = crypto.randomUUID();
    await ctx.tx
      .insert(rispostaArrivata)
      .values({
        id,
        utenteId: ctx.utenteId,
        attesaId: r.attesaId,
        emailId: r.emailId,
        origine: r.origine,
        statoCollegamento: r.statoCollegamento,
        confidenza: r.confidenza,
        valutazione: r.valutazione,
        motivazioneCifrata: await ctx.codec.cifraOpzionale("risposta_arrivata", "motivazione", id, r.motivazione),
        revisione: "da_vedere",
        arrivataIl: r.arrivataIl,
        analisiId: r.analisiId,
        creataIl: ora,
        aggiornataIl: ora,
      })
      .onConflictDoNothing();
    const [esistente] = await ctx.tx
      .select()
      .from(rispostaArrivata)
      .where(and(eq(rispostaArrivata.utenteId, ctx.utenteId), eq(rispostaArrivata.attesaId, r.attesaId), eq(rispostaArrivata.emailId, r.emailId)));
    if (!esistente) throw new Error("risposta_non_trovata");
    if (esistente.statoCollegamento === "rifiutato") return esistente.id;
    if (esistente.id !== id) {
      await ctx.tx
        .update(rispostaArrivata)
        .set({
          valutazione: r.valutazione,
          confidenza: r.confidenza,
          motivazioneCifrata: await ctx.codec.cifraOpzionale("risposta_arrivata", "motivazione", esistente.id, r.motivazione),
          analisiId: r.analisiId,
          aggiornataIl: ora,
        })
        .where(and(eq(rispostaArrivata.utenteId, ctx.utenteId), eq(rispostaArrivata.id, esistente.id)));
    }
    await ctx.tx.delete(requisitoSoddisfatto).where(and(eq(requisitoSoddisfatto.utenteId, ctx.utenteId), eq(requisitoSoddisfatto.rispostaId, esistente.id)));
    await ctx.tx.delete(evidenza).where(and(eq(evidenza.utenteId, ctx.utenteId), eq(evidenza.rispostaId, esistente.id)));
    for (const q of r.requisiti) {
      await ctx.tx.insert(requisitoSoddisfatto).values({ rispostaId: esistente.id, requisitoId: q.requisitoId, utenteId: ctx.utenteId }).onConflictDoNothing();
      for (const e of q.evidenze) {
        await operativo.inserisciEvidenza(ctx, { tipo: "risposta", id: esistente.id, requisitoId: q.requisitoId }, "requisito", e, r.analisiId);
      }
    }
    return esistente.id;
  },

  async risposteDelleAttese(ctx: ContestoUtente, attesaIds: string[]): Promise<RispostaArrivata[]> {
    if (attesaIds.length === 0) return [];
    const righe = await ctx.tx
      .select()
      .from(rispostaArrivata)
      .where(and(eq(rispostaArrivata.utenteId, ctx.utenteId), inArray(rispostaArrivata.attesaId, attesaIds)));
    if (righe.length === 0) return [];
    const ids = righe.map((r) => r.id);
    const [soddisfatti, ev] = await Promise.all([
      ctx.tx.select().from(requisitoSoddisfatto).where(and(eq(requisitoSoddisfatto.utenteId, ctx.utenteId), inArray(requisitoSoddisfatto.rispostaId, ids))),
      ctx.tx.select().from(evidenza).where(and(eq(evidenza.utenteId, ctx.utenteId), inArray(evidenza.rispostaId, ids))),
    ]);
    return Promise.all(
      righe.map(async (r) => ({
        id: r.id,
        utenteId: r.utenteId,
        attesaId: r.attesaId,
        emailId: r.emailId,
        origine: r.origine as OrigineCollegamento,
        statoCollegamento: r.statoCollegamento as StatoCollegamento,
        confidenza: r.confidenza,
        valutazione: r.valutazione as Valutazione,
        requisitiSoddisfatti: await Promise.all(
          soddisfatti
            .filter((s) => s.rispostaId === r.id)
            .map(async (s) => ({
              requisitoId: s.requisitoId,
              evidenze: await evidenzeDi(ctx, ev.filter((e) => e.rispostaId === r.id && e.requisitoId === s.requisitoId)),
            })),
        ),
        revisione: r.revisione as StatoRevisione,
        arrivataIl: r.arrivataIl,
        analisiId: r.analisiId,
      })),
    );
  },

  async impostaRevisione(ctx: ContestoUtente, rispostaId: string, revisione: StatoRevisione, ora: Date) {
    await ctx.tx
      .update(rispostaArrivata)
      .set({ revisione, aggiornataIl: ora })
      .where(and(eq(rispostaArrivata.utenteId, ctx.utenteId), eq(rispostaArrivata.id, rispostaId)));
  },

  // ── Evidenze ──

  async inserisciEvidenza(ctx: ContestoUtente, soggetto: SoggettoEvidenza, campo: string, e: Evidenza, analisiId: string | null) {
    const id = crypto.randomUUID();
    await ctx.tx.insert(evidenza).values({
      id,
      utenteId: ctx.utenteId,
      emailId: e.emailId,
      situazioneId: soggetto.tipo === "situazione" ? soggetto.id : null,
      attivitaId: soggetto.tipo === "attivita" ? soggetto.id : null,
      attesaId: soggetto.tipo === "attesa" ? soggetto.id : null,
      rispostaId: soggetto.tipo === "risposta" ? soggetto.id : null,
      requisitoId: soggetto.tipo === "risposta" ? soggetto.requisitoId : null,
      campo,
      base: e.verificata ? "rilevato" : "dedotto",
      citazioneCifrata: await ctx.codec.cifra("evidenza", "citazione", id, e.citazione),
      inizio: e.inizio,
      fine: e.fine,
      verificata: e.verificata,
      analisiId,
    });
  },

  async sostituisciEvidenze(ctx: ContestoUtente, soggetto: SoggettoEvidenza, campo: string, _base: Base, evidenze: Evidenza[], analisiId: string | null) {
    const colonna =
      soggetto.tipo === "situazione" ? evidenza.situazioneId : soggetto.tipo === "attivita" ? evidenza.attivitaId : soggetto.tipo === "attesa" ? evidenza.attesaId : evidenza.rispostaId;
    await ctx.tx.delete(evidenza).where(and(eq(evidenza.utenteId, ctx.utenteId), eq(colonna, soggetto.id)));
    for (const e of evidenze) await operativo.inserisciEvidenza(ctx, soggetto, campo, e, analisiId);
  },

  // ── Correzioni ed eventi ──

  /**
   * Scrive una correzione con istante strettamente successivo alle precedenti sullo stesso campo:
   * il valore effettivo è "l'ultima correzione attiva" e due correzioni nello stesso millisecondo sarebbero ambigue.
   */
  async correggi(ctx: ContestoUtente, soggetto: Soggetto, campo: string, valore: unknown, valorePrecedente: unknown, ora: Date): Promise<string> {
    const id = crypto.randomUUID();
    const colonna = COLONNA_CORREZIONE[soggetto.tipo];
    const [ultima] = await ctx.tx
      .select({ il: sql<Date>`max(${correzione.creataIl})` })
      .from(correzione)
      .where(and(eq(correzione.utenteId, ctx.utenteId), eq(correzione[colonna], soggetto.id), eq(correzione.campo, campo)));
    const precedente = ultima?.il ? new Date(ultima.il) : null;
    if (precedente && precedente.getTime() >= ora.getTime()) ora = new Date(precedente.getTime() + 1);
    await ctx.tx.insert(correzione).values({
      id,
      utenteId: ctx.utenteId,
      soggettoTipo: soggetto.tipo,
      [colonna]: soggetto.id,
      campo,
      valoreCifrato: await ctx.codec.cifraJson("correzione", "valore", id, valore),
      valorePrecedenteCifrato: await ctx.codec.cifraJson("correzione", "valore_precedente", id, valorePrecedente ?? null),
      creataIl: ora,
    });
    return id;
  },

  async revocaCorrezione(ctx: ContestoUtente, id: string, ora: Date) {
    await ctx.tx.update(correzione).set({ revocataIl: ora }).where(and(eq(correzione.utenteId, ctx.utenteId), eq(correzione.id, id), isNull(correzione.revocataIl)));
  },

  async correzioniPer(ctx: ContestoUtente, soggetti: Soggetto[]): Promise<Correzione[]> {
    if (soggetti.length === 0) return [];
    const per = new Map<TipoSoggetto, string[]>();
    for (const s of soggetti) per.set(s.tipo, [...(per.get(s.tipo) ?? []), s.id]);
    const condizioni = [...per.entries()].map(([tipo, ids]) => inArray(correzione[COLONNA_CORREZIONE[tipo]], ids));
    const righe = await ctx.tx.select().from(correzione).where(and(eq(correzione.utenteId, ctx.utenteId), or(...condizioni)));
    return Promise.all(
      righe.map(async (r) => {
        const tipo = r.soggettoTipo as TipoSoggetto;
        return {
          id: r.id,
          utenteId: r.utenteId,
          soggetto: { tipo, id: r[COLONNA_CORREZIONE[tipo]] as string },
          campo: r.campo,
          valore: await ctx.codec.decifraJson("correzione", "valore", r.id, r.valoreCifrato),
          valorePrecedente: r.valorePrecedenteCifrato ? await ctx.codec.decifraJson("correzione", "valore_precedente", r.id, r.valorePrecedenteCifrato) : null,
          creataIl: r.creataIl,
          revocataIl: r.revocataIl,
        };
      }),
    );
  },

  async evento(ctx: ContestoUtente, e: Omit<EventoSituazione, "id">): Promise<void> {
    const id = crypto.randomUUID();
    await ctx.tx.insert(eventoSituazione).values({
      id,
      utenteId: ctx.utenteId,
      situazioneId: e.situazioneId,
      attore: e.attore,
      tipo: e.tipo,
      riferimenti: e.riferimenti,
      dettagliCifrati: await ctx.codec.cifraOpzionale("evento_situazione", "dettagli", id, e.dettagli),
      creatoIl: e.creatoIl,
    });
  },

  async eventi(ctx: ContestoUtente, situazioneId: string): Promise<EventoSituazione[]> {
    const righe = await ctx.tx
      .select()
      .from(eventoSituazione)
      .where(and(eq(eventoSituazione.utenteId, ctx.utenteId), eq(eventoSituazione.situazioneId, situazioneId)))
      .orderBy(desc(eventoSituazione.creatoIl));
    return Promise.all(
      righe.map(async (r) => ({
        id: r.id,
        situazioneId: r.situazioneId,
        attore: r.attore as EventoSituazione["attore"],
        tipo: r.tipo,
        riferimenti: r.riferimenti,
        dettagli: await ctx.codec.decifraOpzionale("evento_situazione", "dettagli", r.id, r.dettagliCifrati),
        creatoIl: r.creatoIl,
      })),
    );
  },

  // ── Aggregati ──

  async aggregati(ctx: ContestoUtente, situazioneIds: string[]): Promise<AggregatoSituazione[]> {
    if (situazioneIds.length === 0) return [];
    const [sit, col, att, ats] = await Promise.all([
      ctx.tx.select().from(situazione).where(and(eq(situazione.utenteId, ctx.utenteId), inArray(situazione.id, situazioneIds))),
      ctx.tx.select().from(collegamento).where(and(eq(collegamento.utenteId, ctx.utenteId), inArray(collegamento.situazioneId, situazioneIds))),
      ctx.tx.select().from(attivita).where(and(eq(attivita.utenteId, ctx.utenteId), inArray(attivita.situazioneId, situazioneIds))),
      ctx.tx.select().from(attesa).where(and(eq(attesa.utenteId, ctx.utenteId), inArray(attesa.situazioneId, situazioneIds))),
    ]);
    const [attivitaMappate, atteseMappate] = await Promise.all([operativo.mappaAttivita(ctx, att), operativo.mappaAttese(ctx, ats)]);
    const risposte = await operativo.risposteDelleAttese(ctx, ats.map((a) => a.id));
    const soggetti: Soggetto[] = [
      ...situazioneIds.map((id) => ({ tipo: "situazione" as const, id })),
      ...att.map((a) => ({ tipo: "attivita" as const, id: a.id })),
      ...ats.map((a) => ({ tipo: "attesa" as const, id: a.id })),
      ...risposte.map((r) => ({ tipo: "risposta" as const, id: r.id })),
      ...col.map((c) => ({ tipo: "collegamento" as const, id: c.id })),
    ];
    const correzioni = await operativo.correzioniPer(ctx, soggetti);
    return Promise.all(
      sit.map(async (s) => ({
        situazione: {
          id: s.id,
          utenteId: s.utenteId,
          emailOrigineId: s.emailOrigineId,
          titolo: await ctx.codec.decifra("situazione", "titolo", s.id, s.titoloCifrato),
          descrizione: await ctx.codec.decifra("situazione", "descrizione", s.id, s.descrizioneCifrata),
          lingua: s.lingua,
          assorbitaIn: s.assorbitaIn,
          gestitaIl: s.gestitaIl,
          archiviataIl: s.archiviataIl,
          creataIl: s.creataIl,
        },
        collegamenti: col.filter((c) => c.situazioneId === s.id).map(mappaCollegamento),
        attivita: attivitaMappate.filter((a) => a.situazioneId === s.id),
        attese: atteseMappate.filter((a) => a.attesa.situazioneId === s.id).map(({ attesa: a, requisiti }) => ({ attesa: a, requisiti })),
        risposte: risposte.filter((r) => atteseMappate.some((a) => a.attesa.id === r.attesaId && a.attesa.situazioneId === s.id)),
        correzioni,
      })),
    );
  },

  async ultimaAttivitaSituazioni(ctx: ContestoUtente, ids: string[]): Promise<Map<string, Date>> {
    if (ids.length === 0) return new Map();
    const righe = await ctx.tx
      .select({ id: situazione.id, ultima: situazione.ultimaAttivita })
      .from(situazione)
      .where(and(eq(situazione.utenteId, ctx.utenteId), inArray(situazione.id, ids)));
    return new Map(righe.map((r) => [r.id, r.ultima]));
  },
};

function mappaCollegamento(r: typeof collegamento.$inferSelect): Collegamento {
  return {
    id: r.id,
    utenteId: r.utenteId,
    emailId: r.emailId,
    situazioneId: r.situazioneId,
    origine: r.origine as OrigineCollegamento,
    ruolo: r.ruolo as RuoloCollegamento,
    stato: r.stato as StatoCollegamento,
    confidenza: r.confidenza,
    analisiId: r.analisiId,
  };
}
