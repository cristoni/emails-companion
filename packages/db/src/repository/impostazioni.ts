import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { FUNZIONI_AI, MODELLO_PREDEFINITO, type FunzioneAI, type MotivoPausa } from "@ec/core/dominio";
import type { CompatibilitaModello } from "@ec/core/porte";
import {
  chiaveOpenrouter,
  consensoUtente,
  contestoAi,
  impostazioneModello,
  pausaAi,
  preferenzeUtente,
  statoElaborazioneUtente,
} from "../schema";
import type { ContestoUtente } from "../unita-di-lavoro";

export interface Preferenze {
  lingua: string;
  tema: string;
  fusoOrario: string;
  pausaManuale: boolean;
}

const PREFERENZE_PREDEFINITE: Preferenze = { lingua: "en", tema: "sistema", fusoOrario: "UTC", pausaManuale: false };

export type StatoChiaveSalvata = "non_verificata" | "valida" | "non_valida" | "credito_esaurito" | "limitata";

export interface InfoChiave {
  stato: StatoChiaveSalvata;
  ultimeCifre: string;
  etichetta: string | null;
  limiteResiduo: number | null;
  verificataIl: Date | null;
}

export const impostazioni = {
  async preferenze(ctx: ContestoUtente): Promise<Preferenze> {
    const [r] = await ctx.tx.select().from(preferenzeUtente).where(eq(preferenzeUtente.utenteId, ctx.utenteId));
    return r ? { lingua: r.lingua, tema: r.tema, fusoOrario: r.fusoOrario, pausaManuale: r.pausaManuale } : PREFERENZE_PREDEFINITE;
  },

  async aggiornaPreferenze(ctx: ContestoUtente, modifiche: Partial<Preferenze>, ora: Date) {
    const valori = { ...PREFERENZE_PREDEFINITE, ...modifiche };
    await ctx.tx
      .insert(preferenzeUtente)
      .values({ utenteId: ctx.utenteId, ...valori, aggiornateIl: ora })
      .onConflictDoUpdate({ target: preferenzeUtente.utenteId, set: { ...modifiche, aggiornateIl: ora } });
  },

  // ── Consenso all'informativa ──

  async accettaInformativa(ctx: ContestoUtente, versione: string, id: string, ora: Date) {
    await ctx.tx
      .insert(consensoUtente)
      .values({ id, utenteId: ctx.utenteId, versioneInformativa: versione, accettatoIl: ora })
      .onConflictDoNothing();
  },

  async haConsenso(ctx: ContestoUtente, versione: string): Promise<boolean> {
    const [r] = await ctx.tx
      .select({ id: consensoUtente.id })
      .from(consensoUtente)
      .where(and(eq(consensoUtente.utenteId, ctx.utenteId), eq(consensoUtente.versioneInformativa, versione)));
    return Boolean(r);
  },

  // ── Chiave OpenRouter: il valore in chiaro esce solo da `chiaveInChiaro` ──

  async salvaChiave(
    ctx: ContestoUtente,
    chiave: string,
    stato: StatoChiaveSalvata,
    dettagli: { etichetta: string | null; limiteResiduo: number | null },
    ora: Date,
  ) {
    const valori = {
      chiaveCifrata: await ctx.codec.cifra("chiave_openrouter", "chiave", ctx.utenteId, chiave),
      ultimeCifre: chiave.slice(-4),
      etichetta: dettagli.etichetta,
      stato,
      limiteResiduo: dettagli.limiteResiduo,
      verificataIl: ora,
      aggiornataIl: ora,
    };
    await ctx.tx
      .insert(chiaveOpenrouter)
      .values({ utenteId: ctx.utenteId, ...valori })
      .onConflictDoUpdate({ target: chiaveOpenrouter.utenteId, set: valori });
  },

  async infoChiave(ctx: ContestoUtente): Promise<InfoChiave | null> {
    const [r] = await ctx.tx
      .select({
        stato: chiaveOpenrouter.stato,
        ultimeCifre: chiaveOpenrouter.ultimeCifre,
        etichetta: chiaveOpenrouter.etichetta,
        limiteResiduo: chiaveOpenrouter.limiteResiduo,
        verificataIl: chiaveOpenrouter.verificataIl,
      })
      .from(chiaveOpenrouter)
      .where(eq(chiaveOpenrouter.utenteId, ctx.utenteId));
    return r ? { ...r, stato: r.stato as StatoChiaveSalvata } : null;
  },

  async chiaveInChiaro(ctx: ContestoUtente): Promise<string | null> {
    const [r] = await ctx.tx
      .select({ cifrata: chiaveOpenrouter.chiaveCifrata })
      .from(chiaveOpenrouter)
      .where(eq(chiaveOpenrouter.utenteId, ctx.utenteId));
    return r ? ctx.codec.decifra("chiave_openrouter", "chiave", ctx.utenteId, r.cifrata) : null;
  },

  async aggiornaStatoChiave(ctx: ContestoUtente, stato: StatoChiaveSalvata, ora: Date, limiteResiduo?: number | null) {
    await ctx.tx
      .update(chiaveOpenrouter)
      .set({ stato, verificataIl: ora, ...(limiteResiduo !== undefined ? { limiteResiduo } : {}) })
      .where(eq(chiaveOpenrouter.utenteId, ctx.utenteId));
  },

  async rimuoviChiave(ctx: ContestoUtente) {
    await ctx.tx.delete(chiaveOpenrouter).where(eq(chiaveOpenrouter.utenteId, ctx.utenteId));
  },

  // ── Modelli per Funzione AI ──

  async modelli(ctx: ContestoUtente): Promise<Record<FunzioneAI, { modello: string; stato: CompatibilitaModello; verificataIl: Date | null }>> {
    const righe = await ctx.tx.select().from(impostazioneModello).where(eq(impostazioneModello.utenteId, ctx.utenteId));
    const per = new Map(righe.map((r) => [r.funzione, r]));
    return Object.fromEntries(
      FUNZIONI_AI.map((f) => {
        const r = per.get(f);
        return [f, { modello: r?.modello ?? MODELLO_PREDEFINITO, stato: (r?.stato ?? "ok") as CompatibilitaModello, verificataIl: r?.verificataIl ?? null }];
      }),
    ) as Record<FunzioneAI, { modello: string; stato: CompatibilitaModello; verificataIl: Date | null }>;
  },

  async impostaModello(ctx: ContestoUtente, funzione: FunzioneAI, modello: string, stato: CompatibilitaModello, ora: Date) {
    await ctx.tx
      .insert(impostazioneModello)
      .values({ utenteId: ctx.utenteId, funzione, modello, stato, verificataIl: ora })
      .onConflictDoUpdate({
        target: [impostazioneModello.utenteId, impostazioneModello.funzione],
        set: { modello, stato, verificataIl: ora },
      });
  },

  // ── Contesto AI ──

  async contestoCorrente(ctx: ContestoUtente): Promise<{ numero: number; testo: string } | null> {
    const [r] = await ctx.tx
      .select()
      .from(contestoAi)
      .where(eq(contestoAi.utenteId, ctx.utenteId))
      .orderBy(desc(contestoAi.numero))
      .limit(1);
    return r ? { numero: r.numero, testo: await ctx.codec.decifra("contesto_ai", "testo", r.id, r.testoCifrato) } : null;
  },

  async salvaContesto(ctx: ContestoUtente, id: string, testo: string, ora: Date): Promise<number> {
    const [ultimo] = await ctx.tx
      .select({ n: sql<number>`coalesce(max(${contestoAi.numero}), 0)::int` })
      .from(contestoAi)
      .where(eq(contestoAi.utenteId, ctx.utenteId));
    const numero = (ultimo?.n ?? 0) + 1;
    await ctx.tx.insert(contestoAi).values({
      id,
      utenteId: ctx.utenteId,
      numero,
      testoCifrato: await ctx.codec.cifra("contesto_ai", "testo", id, testo),
      creatoIl: ora,
    });
    return numero;
  },

  async versioniContesto(ctx: ContestoUtente) {
    const righe = await ctx.tx.select().from(contestoAi).where(eq(contestoAi.utenteId, ctx.utenteId)).orderBy(desc(contestoAi.numero));
    return Promise.all(
      righe.map(async (r) => ({ numero: r.numero, creatoIl: r.creatoIl, testo: await ctx.codec.decifra("contesto_ai", "testo", r.id, r.testoCifrato) })),
    );
  },

  // ── Pause dell'analisi ──

  async pauseAttive(ctx: ContestoUtente): Promise<{ funzione: FunzioneAI | "*"; motivo: MotivoPausa; dal: Date; prossimaVerifica: Date | null }[]> {
    const righe = await ctx.tx.select().from(pausaAi).where(eq(pausaAi.utenteId, ctx.utenteId));
    return righe.map((r) => ({ funzione: r.funzione as FunzioneAI | "*", motivo: r.motivo as MotivoPausa, dal: r.dal, prossimaVerifica: r.prossimaVerifica }));
  },

  async apriPausa(ctx: ContestoUtente, funzione: FunzioneAI | "*", motivo: MotivoPausa, id: string, ora: Date, prossimaVerifica: Date | null = null) {
    await ctx.tx
      .insert(pausaAi)
      .values({ id, utenteId: ctx.utenteId, funzione, motivo, dal: ora, prossimaVerifica })
      .onConflictDoUpdate({ target: [pausaAi.utenteId, pausaAi.funzione, pausaAi.motivo], set: { prossimaVerifica } });
  },

  /** Chiude le pause con i motivi indicati; restituisce true se ne ha chiusa almeno una. */
  async chiudiPause(ctx: ContestoUtente, motivi: MotivoPausa[], funzione?: FunzioneAI | "*"): Promise<boolean> {
    const chiuse = await ctx.tx
      .delete(pausaAi)
      .where(
        and(
          eq(pausaAi.utenteId, ctx.utenteId),
          inArray(pausaAi.motivo, motivi),
          funzione ? eq(pausaAi.funzione, funzione) : undefined,
        ),
      )
      .returning({ id: pausaAi.id });
    return chiuse.length > 0;
  },

  // ── Stato di elaborazione per utente (ritentativi nel dominio) ──

  async statoElaborazione(ctx: ContestoUtente) {
    const [r] = await ctx.tx.select().from(statoElaborazioneUtente).where(eq(statoElaborazioneUtente.utenteId, ctx.utenteId));
    return r ?? null;
  },

  async aggiornaStatoElaborazione(
    ctx: ContestoUtente,
    modifiche: Partial<Omit<typeof statoElaborazioneUtente.$inferInsert, "utenteId">>,
    ora: Date,
  ) {
    await ctx.tx
      .insert(statoElaborazioneUtente)
      .values({ utenteId: ctx.utenteId, ...modifiche, aggiornatoIl: ora })
      .onConflictDoUpdate({ target: statoElaborazioneUtente.utenteId, set: { ...modifiche, aggiornatoIl: ora } });
  },
};
