import { and, eq, inArray, sql } from "drizzle-orm";
import type { Categoria, Direzione, FunzioneAI, StatoFunzioneEmail } from "@ec/core/dominio";
import { richiestaRianalisi } from "../schema";
import type { ContestoUtente } from "../unita-di-lavoro";

export type AmbitoRianalisi = { tipo: "email"; emailId: string } | { tipo: "aperti" } | { tipo: "giorni"; giorni: number };

export const STATI_RICHIESTA_RIANALISI = ["stimata", "confermata", "in_corso", "completata"] as const;
export type StatoRichiestaRianalisi = (typeof STATI_RICHIESTA_RIANALISI)[number];

export interface RichiestaRianalisi {
  id: string;
  ambito: AmbitoRianalisi;
  stima: { numeroEmail: number; costoStimato: number } | null;
  stato: StatoRichiestaRianalisi;
  creataIl: Date;
}

/** Email che sono entrate nella pipeline di analisi e che una rianalisi può rieseguire. */
export interface EmailRianalizzabile {
  id: string;
  direzione: Direzione;
  ricevutaIl: Date;
  /** Categoria dell'AI; null se non classificata. */
  categoriaAI: Categoria | null;
}

export interface StatoFunzioneRianalisi {
  funzione: FunzioneAI;
  stato: StatoFunzioneEmail;
  /** Causa della pausa o codice dell'errore. */
  motivo: string | null;
  analisiId: string | null;
}

type Riga = Record<string, unknown>;

async function righe<T extends Riga>(ctx: ContestoUtente, query: ReturnType<typeof sql>): Promise<T[]> {
  const r = await ctx.tx.execute(query);
  return (r as unknown as { rows: T[] }).rows;
}

/** Funzioni per singola email che una rianalisi riesegue; `attese_risposte` gira nel riconciliatore. */
const FUNZIONI_PER_EMAIL: FunzioneAI[] = ["classificazione_priorita", "estrazione_attivita"];

export const rianalisi = {
  async crea(ctx: ContestoUtente, r: RichiestaRianalisi): Promise<void> {
    await ctx.tx.insert(richiestaRianalisi).values({
      id: r.id,
      utenteId: ctx.utenteId,
      ambito: r.ambito,
      stima: r.stima,
      stato: r.stato,
      creataIl: r.creataIl,
    });
  },

  async leggi(ctx: ContestoUtente, id: string): Promise<RichiestaRianalisi | null> {
    const [r] = await ctx.tx
      .select()
      .from(richiestaRianalisi)
      .where(and(eq(richiestaRianalisi.utenteId, ctx.utenteId), eq(richiestaRianalisi.id, id)));
    return r ? { id: r.id, ambito: r.ambito, stima: r.stima ?? null, stato: r.stato as StatoRichiestaRianalisi, creataIl: r.creataIl } : null;
  },

  /** Transizione condizionale: restituisce false se la richiesta non era in uno degli stati indicati. */
  async cambiaStato(ctx: ContestoUtente, id: string, stato: StatoRichiestaRianalisi, daStati: StatoRichiestaRianalisi[]): Promise<boolean> {
    const aggiornate = await ctx.tx
      .update(richiestaRianalisi)
      .set({ stato })
      .where(and(eq(richiestaRianalisi.utenteId, ctx.utenteId), eq(richiestaRianalisi.id, id), inArray(richiestaRianalisi.stato, daStati)))
      .returning({ id: richiestaRianalisi.id });
    return aggiornate.length > 0;
  },

  /** Richieste avviate e non concluse (per esempio fermate da una pausa dell'analisi). */
  async inCorso(ctx: ContestoUtente): Promise<string[]> {
    const trovate = await ctx.tx
      .select({ id: richiestaRianalisi.id })
      .from(richiestaRianalisi)
      .where(and(eq(richiestaRianalisi.utenteId, ctx.utenteId), eq(richiestaRianalisi.stato, "in_corso")));
    return trovate.map((r) => r.id);
  },

  /**
   * Email rianalizzabili: non acquisite solo per le risposte, con almeno una copia non eliminata e con lo stato
   * di almeno una funzione per email (le escluse dall'analisi — spam, cestino, bozze — non ne hanno).
   * Filtrate per id oppure per `ricevuta_il` in (dal, al].
   */
  async rianalizzabili(ctx: ContestoUtente, filtro: { ids: string[] } | { dal: Date; al: Date }): Promise<EmailRianalizzabile[]> {
    if ("ids" in filtro && filtro.ids.length === 0) return [];
    const condizione =
      "ids" in filtro
        ? sql`e.id = any(${sql.param(filtro.ids)}::uuid[])`
        : sql`e.ricevuta_il > ${filtro.dal.toISOString()}::timestamptz and e.ricevuta_il <= ${filtro.al.toISOString()}::timestamptz`;
    const trovate = await righe<{ id: string; direzione: string; ricevuta_il: string | Date; categoria: string | null }>(
      ctx,
      sql`
        select e.id, e.direzione, e.ricevuta_il, c.categoria
        from email e
        left join classificazione_email c on c.utente_id = e.utente_id and c.email_id = e.id
        where e.utente_id = ${ctx.utenteId}
          and e.solo_per_risposte = false
          and ${condizione}
          and exists (
            select 1 from email_copia k
            where k.utente_id = e.utente_id and k.email_id = e.id and k.eliminata_nel_provider = false)
          and exists (
            select 1 from stato_funzione_email s
            where s.utente_id = e.utente_id and s.email_id = e.id and s.funzione = any(${sql.param(FUNZIONI_PER_EMAIL)}::text[]))
        order by e.ricevuta_il desc, e.id`,
    );
    return trovate.map((r) => ({
      id: r.id,
      direzione: r.direzione as Direzione,
      ricevutaIl: new Date(r.ricevuta_il),
      categoriaAI: (r.categoria as Categoria | null) ?? null,
    }));
  },

  /** Stato delle funzioni per email delle email indicate. */
  async statiFunzioni(ctx: ContestoUtente, emailIds: string[]): Promise<Map<string, StatoFunzioneRianalisi[]>> {
    const per = new Map<string, StatoFunzioneRianalisi[]>();
    if (emailIds.length === 0) return per;
    const trovate = await righe<{ email_id: string; funzione: string; stato: string; motivo: string | null; analisi_id: string | null }>(
      ctx,
      sql`
        select email_id, funzione, stato, motivo, analisi_id from stato_funzione_email
        where utente_id = ${ctx.utenteId} and email_id = any(${sql.param(emailIds)}::uuid[])
          and funzione = any(${sql.param(FUNZIONI_PER_EMAIL)}::text[])`,
    );
    for (const r of trovate) {
      const voce = { funzione: r.funzione as FunzioneAI, stato: r.stato as StatoFunzioneEmail, motivo: r.motivo, analisiId: r.analisi_id };
      per.set(r.email_id, [...(per.get(r.email_id) ?? []), voce]);
    }
    return per;
  },

  /** Invocazioni concluse (completate, fallite o poi superate) che portano l'id della richiesta di rianalisi. */
  async analisiDellaRichiesta(
    ctx: ContestoUtente,
    richiestaId: string,
    emailIds: string[] | null = null,
  ): Promise<{ id: string; emailId: string; funzione: FunzioneAI; stato: "completata" | "fallita" | "superata" }[]> {
    if (emailIds !== null && emailIds.length === 0) return [];
    const perEmail = emailIds === null ? sql`true` : sql`email_id = any(${sql.param(emailIds)}::uuid[])`;
    const trovate = await righe<{ id: string; email_id: string; funzione: string; stato: string }>(
      ctx,
      sql`
        select id, email_id, funzione, stato from analisi_ai
        where utente_id = ${ctx.utenteId} and richiesta_rianalisi_id = ${richiestaId}::uuid and email_id is not null
          and stato in ('completata', 'fallita', 'superata') and ${perEmail}`,
    );
    return trovate.map((r) => ({
      id: r.id,
      emailId: r.email_id,
      funzione: r.funzione as FunzioneAI,
      stato: r.stato as "completata" | "fallita" | "superata",
    }));
  },
};
