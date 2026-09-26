import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { FunzioneAI } from "@ec/core/dominio";
import type { UtilizzoModello } from "@ec/core/porte";
import { analisiAi } from "../schema";
import type { ContestoUtente } from "../unita-di-lavoro";

export type EsitoRivendicazione =
  | { tipo: "nuova"; id: string }
  | { tipo: "completata"; id: string; output: unknown }
  | { tipo: "in_corso_altrove" };

export interface DatiRivendicazione {
  id: string;
  funzione: FunzioneAI;
  hashInput: string;
  modello: string;
  versionePrompt: string;
  contestoAiVersione: number | null;
  lingua: string;
  emailId: string | null;
  richiestaRianalisiId: string | null;
  ora: Date;
}

/** Invocazioni rimaste `in_corso` più a lungo di così sono considerate interrotte. */
const INTERROTTA_DOPO_MS = 10 * 60 * 1000;

export const analisi = {
  /**
   * Claim dell'invocazione: una sola chiamata al modello per lo stesso input.
   * Un output già completato viene riusato senza nuova chiamata.
   */
  async rivendica(ctx: ContestoUtente, d: DatiRivendicazione): Promise<EsitoRivendicazione> {
    const hashInputIndice = await ctx.codec.indice("hash_input", d.hashInput);
    await ctx.tx
      .update(analisiAi)
      .set({ stato: "interrotta", errore: "interrotta" })
      .where(
        and(
          eq(analisiAi.utenteId, ctx.utenteId),
          eq(analisiAi.funzione, d.funzione),
          eq(analisiAi.hashInputIndice, hashInputIndice),
          eq(analisiAi.stato, "in_corso"),
          lt(analisiAi.avviataIl, new Date(d.ora.getTime() - INTERROTTA_DOPO_MS)),
        ),
      );
    const inserite = await ctx.tx.execute(sql`
      insert into analisi_ai (id, utente_id, funzione, modello_richiesto, versione_prompt, contesto_ai_versione, lingua, email_id,
                              hash_input_indice, stato, richiesta_rianalisi_id, avviata_il)
      values (${d.id}::uuid, ${ctx.utenteId}, ${d.funzione}, ${d.modello}, ${d.versionePrompt}, ${d.contestoAiVersione}::int, ${d.lingua},
              ${d.emailId}::uuid, ${hashInputIndice}, 'in_corso', ${d.richiestaRianalisiId}::uuid, ${d.ora.toISOString()}::timestamptz)
      on conflict (utente_id, funzione, hash_input_indice) where stato in ('in_corso','completata') do nothing
      returning id`);
    if ((inserite as unknown as { rows: unknown[] }).rows.length > 0) return { tipo: "nuova", id: d.id };
    const [esistente] = await ctx.tx
      .select({ id: analisiAi.id, stato: analisiAi.stato, output: analisiAi.outputCifrato })
      .from(analisiAi)
      .where(
        and(
          eq(analisiAi.utenteId, ctx.utenteId),
          eq(analisiAi.funzione, d.funzione),
          eq(analisiAi.hashInputIndice, hashInputIndice),
          inArray(analisiAi.stato, ["in_corso", "completata"]),
        ),
      );
    if (!esistente) return { tipo: "in_corso_altrove" };
    if (esistente.stato === "completata" && esistente.output) {
      return {
        tipo: "completata",
        id: esistente.id,
        output: await ctx.codec.decifraJson("analisi_ai", "output", esistente.id, esistente.output),
      };
    }
    return { tipo: "in_corso_altrove" };
  },

  async completa(ctx: ContestoUtente, id: string, output: unknown, utilizzo: UtilizzoModello, ora: Date) {
    await ctx.tx
      .update(analisiAi)
      .set({
        stato: "completata",
        outputCifrato: await ctx.codec.cifraJson("analisi_ai", "output", id, output),
        modelloServito: utilizzo.modelloServito,
        fornitore: utilizzo.fornitore,
        tokenIngresso: utilizzo.tokenIngresso,
        tokenUscita: utilizzo.tokenUscita,
        costo: utilizzo.costo,
        latenzaMs: utilizzo.latenzaMs,
        idGenerazione: utilizzo.idGenerazione,
        completataIl: ora,
      })
      .where(and(eq(analisiAi.utenteId, ctx.utenteId), eq(analisiAi.id, id)));
  },

  async fallisci(ctx: ContestoUtente, id: string, codice: string, utilizzo: UtilizzoModello | null, ora: Date) {
    await ctx.tx
      .update(analisiAi)
      .set({
        stato: "fallita",
        errore: codice,
        tokenIngresso: utilizzo?.tokenIngresso ?? null,
        tokenUscita: utilizzo?.tokenUscita ?? null,
        costo: utilizzo?.costo ?? null,
        completataIl: ora,
      })
      .where(and(eq(analisiAi.utenteId, ctx.utenteId), eq(analisiAi.id, id)));
  },

  async leggiOutput<T>(ctx: ContestoUtente, id: string): Promise<T | null> {
    const [r] = await ctx.tx
      .select({ output: analisiAi.outputCifrato })
      .from(analisiAi)
      .where(and(eq(analisiAi.utenteId, ctx.utenteId), eq(analisiAi.id, id)));
    return r?.output ? ctx.codec.decifraJson<T>("analisi_ai", "output", id, r.output) : null;
  },

  async informazioni(ctx: ContestoUtente, id: string) {
    const [r] = await ctx.tx
      .select({
        id: analisiAi.id,
        funzione: analisiAi.funzione,
        modelloRichiesto: analisiAi.modelloRichiesto,
        modelloServito: analisiAi.modelloServito,
        contestoAiVersione: analisiAi.contestoAiVersione,
        completataIl: analisiAi.completataIl,
      })
      .from(analisiAi)
      .where(and(eq(analisiAi.utenteId, ctx.utenteId), eq(analisiAi.id, id)));
    return r ?? null;
  },

  /** Rende superate le analisi precedenti di una funzione su un'email (dopo una rianalisi). */
  async supera(ctx: ContestoUtente, funzione: FunzioneAI, emailId: string, tranne: string) {
    await ctx.tx
      .update(analisiAi)
      .set({ stato: "superata" })
      .where(
        and(
          eq(analisiAi.utenteId, ctx.utenteId),
          eq(analisiAi.funzione, funzione),
          eq(analisiAi.emailId, emailId),
          eq(analisiAi.stato, "completata"),
          sql`${analisiAi.id} <> ${tranne}::uuid`,
        ),
      );
  },

  async consumo(ctx: ContestoUtente, dal: Date) {
    return ctx.tx
      .select({
        funzione: analisiAi.funzione,
        invocazioni: sql<number>`count(*)::int`,
        costo: sql<number>`coalesce(sum(${analisiAi.costo}), 0)::float8`,
        tokenIngresso: sql<number>`coalesce(sum(${analisiAi.tokenIngresso}), 0)::int`,
        tokenUscita: sql<number>`coalesce(sum(${analisiAi.tokenUscita}), 0)::int`,
      })
      .from(analisiAi)
      .where(and(eq(analisiAi.utenteId, ctx.utenteId), gte(analisiAi.avviataIl, dal)))
      .groupBy(analisiAi.funzione);
  },
};
