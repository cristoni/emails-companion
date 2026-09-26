import { sql } from "drizzle-orm";
import type { ContestoUtente } from "../unita-di-lavoro";

async function righe<T>(ctx: ContestoUtente, query: ReturnType<typeof sql>): Promise<T[]> {
  const r = await ctx.tx.execute(query);
  return (r as unknown as { rows: T[] }).rows;
}

/** Eliminazione dei dati derivati da una casella (§6.4), a lotti per non tenere transazioni lunghe. */
export const eliminazione = {
  /**
   * Elimina un lotto di copie della casella e le Email rimaste senza copie, con tutto ciò che ne deriva.
   * Restituisce il numero di copie eliminate: 0 significa che la casella non ha più copie.
   */
  async lottoCopie(ctx: ContestoUtente, casellaId: string, dimensione: number): Promise<number> {
    const copie = await righe<{ id: string; email_id: string }>(
      ctx,
      sql`delete from email_copia where id in (
            select id from email_copia where utente_id = ${ctx.utenteId} and casella_id = ${casellaId}::uuid limit ${dimensione})
          returning id, email_id`,
    );
    if (copie.length === 0) return 0;
    const orfane = await righe<{ id: string }>(
      ctx,
      sql`select e.id from email e where e.utente_id = ${ctx.utenteId} and e.id = any(${sql.param(copie.map((c) => c.email_id))}::uuid[])
          and not exists (select 1 from email_copia c where c.email_id = e.id)`,
    );
    const ids = orfane.map((o) => o.id);
    if (ids.length > 0) {
      await ctx.tx.execute(sql`
        delete from evento_situazione where utente_id = ${ctx.utenteId}
          and (riferimenti->>'email' = any(${sql.param(ids)}::text[]))`);
      // Le Situazioni originate da email eliminate passano alla più vecchia email collegata rimasta, altrimenti spariscono.
      const situazioni = await righe<{ id: string }>(
        ctx,
        sql`select id from situazione where utente_id = ${ctx.utenteId} and email_origine_id = any(${sql.param(ids)}::uuid[])`,
      );
      for (const s of situazioni) {
        const [nuovaOrigine] = await righe<{ email_id: string }>(
          ctx,
          sql`select c.email_id from collegamento c join email e on e.id = c.email_id
              where c.situazione_id = ${s.id}::uuid and c.stato <> 'rifiutato' and not (c.email_id = any(${sql.param(ids)}::uuid[]))
              order by e.ricevuta_il limit 1`,
        );
        if (nuovaOrigine) {
          await ctx.tx.execute(sql`update situazione set email_origine_id = ${nuovaOrigine.email_id}::uuid where id = ${s.id}::uuid
                                   and not exists (select 1 from situazione x where x.utente_id = ${ctx.utenteId} and x.email_origine_id = ${nuovaOrigine.email_id}::uuid)`);
        }
        await ctx.tx.execute(sql`delete from situazione where id = ${s.id}::uuid and email_origine_id = any(${sql.param(ids)}::uuid[])`);
      }
      await ctx.tx.execute(sql`delete from analisi_ai where utente_id = ${ctx.utenteId} and email_id = any(${sql.param(ids)}::uuid[])`);
      await ctx.tx.execute(sql`delete from email where utente_id = ${ctx.utenteId} and id = any(${sql.param(ids)}::uuid[])`);
      await ctx.tx.execute(sql`
        delete from situazione s where s.utente_id = ${ctx.utenteId}
          and not exists (select 1 from collegamento c where c.situazione_id = s.id and c.stato <> 'rifiutato')
          and not exists (select 1 from attivita a where a.situazione_id = s.id)
          and not exists (select 1 from attesa a where a.situazione_id = s.id)`);
    }
    return copie.length;
  },

  async datiCasella(ctx: ContestoUtente, casellaId: string) {
    await ctx.tx.execute(sql`delete from indirizzo_utente where utente_id = ${ctx.utenteId} and casella_id = ${casellaId}::uuid`);
    await ctx.tx.execute(sql`delete from sincronizzazione_casella where utente_id = ${ctx.utenteId} and casella_id = ${casellaId}::uuid`);
    await ctx.tx.execute(sql`delete from credenziale_casella where utente_id = ${ctx.utenteId} and casella_id = ${casellaId}::uuid`);
    await ctx.tx.execute(sql`delete from bozza where utente_id = ${ctx.utenteId} and casella_id = ${casellaId}::uuid`);
  },

  /** Cancellazione dell'account: tutte le tabelle applicative seguono auth_utente con ON DELETE CASCADE. */
  async account(ctx: ContestoUtente) {
    await ctx.tx.execute(sql`delete from auth_utente where id = ${ctx.utenteId}`);
  },
};
