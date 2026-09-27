import { eq, sql } from "drizzle-orm";
import { ORE_FINESTRA_NEWS, type Categoria } from "@ec/core/dominio";
import { riepilogoNews } from "../schema";
import type { ContestoUtente } from "../unita-di-lavoro";

const ORA_MS = 3_600_000;
const FIRMA_INVALIDATA = "";

/** Voce del Riepilogo News: testo prodotto dall'AI e le email che sintetizza. */
export interface VoceRiepilogo {
  testo: string;
  emailIds: string[];
}

export interface RiepilogoSalvato {
  /** Firma dell'insieme di email incluse e della lingua dell'interfaccia al momento della generazione. */
  firmaInsieme: string;
  voci: VoceRiepilogo[];
  /** Istante rispetto a cui è stata calcolata la finestra delle 24 ore. */
  finestraFine: Date;
  generatoIl: Date;
  /** null per il riepilogo vuoto, scritto senza chiamare il modello. */
  analisiId: string | null;
}

/** Email in entrata della finestra che possono appartenere alle News; la categoria effettiva la calcola l'applicazione. */
export interface CandidataNews {
  id: string;
  ricevutaIl: Date;
  lingua: string;
  /** Categoria dell'AI; null se l'email non è ancora classificata. */
  categoriaAI: Categoria | null;
}

type Riga = Record<string, unknown>;

async function righe<T extends Riga>(ctx: ContestoUtente, query: ReturnType<typeof sql>): Promise<T[]> {
  const r = await ctx.tx.execute(query);
  return (r as unknown as { rows: T[] }).rows;
}

export const news = {
  /** Firma e date dell'ultimo riepilogo, senza decifrare le voci. */
  async stato(ctx: ContestoUtente): Promise<Omit<RiepilogoSalvato, "voci"> | null> {
    const [r] = await ctx.tx
      .select({
        firmaInsieme: riepilogoNews.firmaInsieme,
        finestraFine: riepilogoNews.finestraFine,
        generatoIl: riepilogoNews.generatoIl,
        analisiId: riepilogoNews.analisiId,
      })
      .from(riepilogoNews)
      .where(eq(riepilogoNews.utenteId, ctx.utenteId));
    return r ?? null;
  },

  async leggi(ctx: ContestoUtente): Promise<RiepilogoSalvato | null> {
    const [r] = await ctx.tx.select().from(riepilogoNews).where(eq(riepilogoNews.utenteId, ctx.utenteId));
    if (!r) return null;
    return {
      firmaInsieme: r.firmaInsieme,
      voci: await ctx.codec.decifraJson<VoceRiepilogo[]>("riepilogo_news", "voci", ctx.utenteId, r.vociCifrate),
      finestraFine: r.finestraFine,
      generatoIl: r.generatoIl,
      analisiId: r.analisiId,
    };
  },

  /** Una riga per utente: la nuova generazione sostituisce la precedente. */
  async salva(ctx: ContestoUtente, r: RiepilogoSalvato): Promise<void> {
    const valori = {
      firmaInsieme: r.firmaInsieme,
      vociCifrate: await ctx.codec.cifraJson("riepilogo_news", "voci", ctx.utenteId, r.voci),
      finestraFine: r.finestraFine,
      generatoIl: r.generatoIl,
      analisiId: r.analisiId,
    };
    await ctx.tx
      .insert(riepilogoNews)
      .values({ utenteId: ctx.utenteId, ...valori })
      .onConflictDoUpdate({ target: riepilogoNews.utenteId, set: valori, setWhere: eq(riepilogoNews.utenteId, ctx.utenteId) });
  },

  /**
   * Rende superato il riepilogo salvato senza toccarne voci e date: la prossima generazione non lo considera
   * più aggiornato per l'insieme corrente (comando "Aggiorna"). La firma vuota non coincide mai con un hash.
   */
  async invalida(ctx: ContestoUtente): Promise<void> {
    await ctx.tx.update(riepilogoNews).set({ firmaInsieme: FIRMA_INVALIDATA }).where(eq(riepilogoNews.utenteId, ctx.utenteId));
  },

  /**
   * Email in entrata ricevute in (ora − 24h, ora], non acquisite solo per valutare risposte, con almeno una copia
   * non eliminata nel provider, classificate `news` dall'AI oppure con una correzione della categoria.
   * `ora` viene dall'Orologio: mai `now()` SQL.
   */
  async candidate(ctx: ContestoUtente, ora: Date, ore = ORE_FINESTRA_NEWS): Promise<CandidataNews[]> {
    const dal = new Date(ora.getTime() - ore * ORA_MS);
    const trovate = await righe<{ id: string; ricevuta_il: string | Date; lingua: string; categoria: string | null }>(
      ctx,
      sql`
        select e.id, e.ricevuta_il, e.lingua, c.categoria
        from email e
        left join classificazione_email c on c.utente_id = e.utente_id and c.email_id = e.id
        where e.utente_id = ${ctx.utenteId}
          and e.direzione = 'entrata'
          and e.solo_per_risposte = false
          and e.ricevuta_il > ${dal.toISOString()}::timestamptz
          and e.ricevuta_il <= ${ora.toISOString()}::timestamptz
          and exists (
            select 1 from email_copia k
            where k.utente_id = e.utente_id and k.email_id = e.id and k.eliminata_nel_provider = false)
          and (
            c.categoria = 'news'
            or exists (
              select 1 from correzione r
              where r.utente_id = e.utente_id and r.email_id = e.id and r.campo = 'categoria'))
        order by e.ricevuta_il desc, e.id`,
    );
    return trovate.map((r) => ({
      id: r.id,
      ricevutaIl: new Date(r.ricevuta_il),
      lingua: r.lingua,
      categoriaAI: (r.categoria as Categoria | null) ?? null,
    }));
  },

  /** Casella di provenienza di ogni email (la prima copia non eliminata), per indicarla nella vista. */
  async caselleDelleEmail(ctx: ContestoUtente, emailIds: string[]): Promise<Map<string, string>> {
    if (emailIds.length === 0) return new Map();
    const trovate = await righe<{ email_id: string; casella_id: string }>(
      ctx,
      sql`
        select distinct on (k.email_id) k.email_id, k.casella_id
        from email_copia k
        where k.utente_id = ${ctx.utenteId} and k.email_id = any(${sql.param(emailIds)}::uuid[]) and k.eliminata_nel_provider = false
        order by k.email_id, k.acquisita_il, k.id`,
    );
    return new Map(trovate.map((r) => [r.email_id, r.casella_id]));
  },
};
