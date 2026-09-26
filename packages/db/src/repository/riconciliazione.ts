import { sql } from "drizzle-orm";
import type { ContestoUtente } from "../unita-di-lavoro";

export const riconciliazione = {
  /**
   * Email pronte da riconciliare in ordine cronologico, escluse quelle trattenute dalla barriera
   * dell'Importazione iniziale ancora in corso nella loro casella.
   */
  async pronte(ctx: ContestoUtente, limite: number): Promise<{ id: string; ricevutaIl: Date }[]> {
    const risultato = await ctx.tx.execute(sql`
      select e.id, e.ricevuta_il
      from email e
      where e.utente_id = ${ctx.utenteId} and e.stato_riconciliazione = 'pronta'
        and not exists (
          select 1 from email_copia c
          join sincronizzazione_casella s on s.casella_id = c.casella_id
          where c.email_id = e.id and s.fase_importazione = 'in_corso' and e.ricevuta_il <= s.riferimento_importazione
        )
      order by e.ricevuta_il, e.id
      limit ${limite}`);
    return (risultato as unknown as { rows: { id: string; ricevuta_il: string | Date }[] }).rows.map((r) => ({
      id: r.id,
      ricevutaIl: new Date(r.ricevuta_il),
    }));
  },

  /** Riporta a 'pronta' email già riconciliate: la convergenza le rielabora con lo stato nuovo. */
  async rimettiInCoda(ctx: ContestoUtente, emailIds: string[]): Promise<number> {
    if (emailIds.length === 0) return 0;
    const risultato = await ctx.tx.execute(sql`
      update email set stato_riconciliazione = 'pronta'
      where utente_id = ${ctx.utenteId} and stato_riconciliazione = 'riconciliata' and id = any(${sql.param(emailIds)}::uuid[])
      returning id`);
    return (risultato as unknown as { rows: unknown[] }).rows.length;
  },

  /** Email successive a un istante inviate da uno degli indirizzi (indici ciechi) indicati. */
  async successiveDaMittenti(ctx: ContestoUtente, dopo: Date, mittentiIndici: string[]): Promise<string[]> {
    if (mittentiIndici.length === 0) return [];
    const risultato = await ctx.tx.execute(sql`
      select id from email
      where utente_id = ${ctx.utenteId} and ricevuta_il > ${dopo.toISOString()}::timestamptz
        and mittente_indice = any(${sql.param(mittentiIndici)}::text[])`);
    return (risultato as unknown as { rows: { id: string }[] }).rows.map((r) => r.id);
  },

  /** Email successive inviate dall'utente a uno degli indirizzi indicati. */
  async successiveVerso(ctx: ContestoUtente, dopo: Date, destinatariIndici: string[]): Promise<string[]> {
    if (destinatariIndici.length === 0) return [];
    const risultato = await ctx.tx.execute(sql`
      select id from email
      where utente_id = ${ctx.utenteId} and ricevuta_il > ${dopo.toISOString()}::timestamptz and direzione = 'uscita'
        and destinatari_indici && ${sql.param(destinatariIndici)}::text[]`);
    return (risultato as unknown as { rows: { id: string }[] }).rows.map((r) => r.id);
  },

  async indiceMittente(ctx: ContestoUtente, emailId: string): Promise<string | null> {
    const risultato = await ctx.tx.execute(sql`select mittente_indice from email where utente_id = ${ctx.utenteId} and id = ${emailId}::uuid`);
    return (risultato as unknown as { rows: { mittente_indice: string }[] }).rows[0]?.mittente_indice ?? null;
  },

  /** Situazioni (non assorbite) con attività recente, per i candidati di correlazione. */
  async situazioniRecenti(ctx: ContestoUtente, dal: Date, limite: number): Promise<string[]> {
    const risultato = await ctx.tx.execute(sql`
      select id from situazione
      where utente_id = ${ctx.utenteId} and assorbita_in is null and archiviata_il is null
        and ultima_attivita >= ${dal.toISOString()}::timestamptz
      order by ultima_attivita desc
      limit ${limite}`);
    return (risultato as unknown as { rows: { id: string }[] }).rows.map((r) => r.id);
  },
};
