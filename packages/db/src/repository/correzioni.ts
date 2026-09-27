import { and, eq, inArray, sql } from "drizzle-orm";
import type {
  CicloAttesa,
  Direzione,
  FonteLingua,
  OrigineCollegamento,
  RuoloCollegamento,
  Soggetto,
  StatoCollegamento,
  StatoElemento,
  StatoRevisione,
  TipoSoggetto,
  Valutazione,
} from "@ec/core/dominio";
import { attesa, attivita, collegamento, correzione, email, eventoSituazione, rispostaArrivata, situazione } from "../schema";
import type { ContestoUtente } from "../unita-di-lavoro";

const COLONNE = {
  situazione: correzione.situazioneId,
  attivita: correzione.attivitaId,
  attesa: correzione.attesaId,
  risposta: correzione.rispostaId,
  email: correzione.emailId,
  collegamento: correzione.collegamentoId,
} as const;

/**
 * Blocco del soggetto di una correzione fino alla fine della transazione: due azioni concorrenti sullo
 * stesso elemento (doppio invio) si serializzano e la seconda vede la correzione della prima. `no key update`
 * non blocca gli inserimenti che vi fanno riferimento (evidenze, correzioni, eventi del riconciliatore).
 */
const BLOCCO = "no key update" as const;

/**
 * Letture di appartenenza e scritture degli effetti delle Correzioni dell'utente (§10.7).
 * Ogni query è legata all'utente: un id di un altro utente risulta semplicemente assente.
 * Le letture di un soggetto bloccano la sua riga: vanno usate solo nelle transazioni delle correzioni.
 */
export const correzioniDb = {
  async attivita(ctx: ContestoUtente, id: string) {
    const [r] = await ctx.tx
      .select({ id: attivita.id, situazioneId: attivita.situazioneId, emailSorgenteId: attivita.emailSorgenteId, stato: attivita.stato })
      .from(attivita)
      .where(and(eq(attivita.utenteId, ctx.utenteId), eq(attivita.id, id)))
      .for(BLOCCO);
    return r ? { ...r, stato: r.stato as StatoElemento } : null;
  },

  async attesa(ctx: ContestoUtente, id: string) {
    const [r] = await ctx.tx
      .select({ id: attesa.id, situazioneId: attesa.situazioneId, emailRichiestaId: attesa.emailRichiestaId, ciclo: attesa.ciclo })
      .from(attesa)
      .where(and(eq(attesa.utenteId, ctx.utenteId), eq(attesa.id, id)))
      .for(BLOCCO);
    return r ? { ...r, ciclo: r.ciclo as CicloAttesa } : null;
  },

  async risposta(ctx: ContestoUtente, id: string) {
    const [r] = await ctx.tx
      .select({
        id: rispostaArrivata.id,
        attesaId: rispostaArrivata.attesaId,
        emailId: rispostaArrivata.emailId,
        statoCollegamento: rispostaArrivata.statoCollegamento,
        valutazione: rispostaArrivata.valutazione,
        revisione: rispostaArrivata.revisione,
        situazioneId: attesa.situazioneId,
      })
      .from(rispostaArrivata)
      .innerJoin(attesa, and(eq(attesa.id, rispostaArrivata.attesaId), eq(attesa.utenteId, ctx.utenteId)))
      .where(and(eq(rispostaArrivata.utenteId, ctx.utenteId), eq(rispostaArrivata.id, id)))
      .for(BLOCCO, { of: rispostaArrivata });
    return r
      ? {
          ...r,
          statoCollegamento: r.statoCollegamento as StatoCollegamento,
          valutazione: r.valutazione as Valutazione,
          revisione: r.revisione as StatoRevisione,
        }
      : null;
  },

  async collegamento(ctx: ContestoUtente, id: string) {
    const [r] = await ctx.tx
      .select({
        id: collegamento.id,
        emailId: collegamento.emailId,
        situazioneId: collegamento.situazioneId,
        stato: collegamento.stato,
        ruolo: collegamento.ruolo,
        origine: collegamento.origine,
      })
      .from(collegamento)
      .where(and(eq(collegamento.utenteId, ctx.utenteId), eq(collegamento.id, id)))
      .for(BLOCCO);
    return r
      ? { ...r, stato: r.stato as StatoCollegamento, ruolo: r.ruolo as RuoloCollegamento, origine: r.origine as OrigineCollegamento }
      : null;
  },

  async collegamentoTra(ctx: ContestoUtente, emailId: string, situazioneId: string) {
    const [r] = await ctx.tx
      .select({ id: collegamento.id, stato: collegamento.stato })
      .from(collegamento)
      .where(and(eq(collegamento.utenteId, ctx.utenteId), eq(collegamento.emailId, emailId), eq(collegamento.situazioneId, situazioneId)));
    return r ? { id: r.id, stato: r.stato as StatoCollegamento } : null;
  },

  async email(ctx: ContestoUtente, id: string) {
    const [r] = await ctx.tx
      .select({ id: email.id, direzione: email.direzione, lingua: email.lingua, fonteLingua: email.fonteLingua, ricevutaIl: email.ricevutaIl })
      .from(email)
      .where(and(eq(email.utenteId, ctx.utenteId), eq(email.id, id)))
      .for(BLOCCO);
    return r ? { ...r, direzione: r.direzione as Direzione, fonteLingua: r.fonteLingua as FonteLingua } : null;
  },

  /** Con `blocca` la riga resta bloccata fino alla fine della transazione (azioni sulla Situazione stessa). */
  async situazione(ctx: ContestoUtente, id: string, blocca = false) {
    const query = ctx.tx
      .select({
        id: situazione.id,
        emailOrigineId: situazione.emailOrigineId,
        assorbitaIn: situazione.assorbitaIn,
        gestitaIl: situazione.gestitaIl,
        archiviataIl: situazione.archiviataIl,
        lingua: situazione.lingua,
      })
      .from(situazione)
      .where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.id, id)));
    const [r] = blocca ? await query.for(BLOCCO) : await query;
    return r ?? null;
  },

  /** Situazione originata dall'email, senza seguire l'eventuale assorbimento. */
  async situazioneDiOrigine(ctx: ContestoUtente, emailId: string) {
    const [r] = await ctx.tx
      .select({ id: situazione.id, assorbitaIn: situazione.assorbitaIn })
      .from(situazione)
      .where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.emailOrigineId, emailId)));
    return r ?? null;
  },

  /** Soggetto e stato di una correzione (senza decifrare il valore). */
  async correzione(ctx: ContestoUtente, id: string): Promise<{ id: string; soggetto: Soggetto; campo: string; revocataIl: Date | null } | null> {
    const [r] = await ctx.tx
      .select()
      .from(correzione)
      .where(and(eq(correzione.utenteId, ctx.utenteId), eq(correzione.id, id)))
      .for(BLOCCO);
    if (!r) return null;
    const tipo = r.soggettoTipo as TipoSoggetto;
    const colonna = { situazione: r.situazioneId, attivita: r.attivitaId, attesa: r.attesaId, risposta: r.rispostaId, email: r.emailId, collegamento: r.collegamentoId }[tipo];
    if (!colonna) return null;
    return { id: r.id, soggetto: { tipo, id: colonna }, campo: r.campo, revocataIl: r.revocataIl };
  },

  /** Id delle correzioni attive su un campo per più soggetti dello stesso tipo. */
  async correzioniAttiveDi(ctx: ContestoUtente, tipo: TipoSoggetto, ids: string[], campo: string): Promise<{ id: string; soggettoId: string }[]> {
    if (ids.length === 0) return [];
    const colonna = COLONNE[tipo];
    const righe = await ctx.tx
      .select({ id: correzione.id, soggettoId: colonna, revocataIl: correzione.revocataIl })
      .from(correzione)
      .where(and(eq(correzione.utenteId, ctx.utenteId), eq(correzione.soggettoTipo, tipo), eq(correzione.campo, campo), inArray(colonna, ids)));
    return righe.filter((r) => r.revocataIl === null && r.soggettoId !== null).map((r) => ({ id: r.id, soggettoId: r.soggettoId as string }));
  },

  async impostaStatoCollegamento(ctx: ContestoUtente, id: string, stato: StatoCollegamento, ora: Date) {
    await ctx.tx
      .update(collegamento)
      .set({ stato, aggiornatoIl: ora })
      .where(and(eq(collegamento.utenteId, ctx.utenteId), eq(collegamento.id, id)));
  },

  async impostaStatoCollegamentoRisposta(ctx: ContestoUtente, id: string, stato: StatoCollegamento, ora: Date) {
    await ctx.tx
      .update(rispostaArrivata)
      .set({ statoCollegamento: stato, aggiornataIl: ora })
      .where(and(eq(rispostaArrivata.utenteId, ctx.utenteId), eq(rispostaArrivata.id, id)));
  },

  /** Riporta Attività e Attese indicate da una Situazione a un'altra, solo se sono ancora nella prima. */
  async spostaElementi(ctx: ContestoUtente, elementi: { attivita: string[]; attese: string[] }, daSituazioneId: string, aSituazioneId: string, ora: Date) {
    if (elementi.attivita.length > 0) {
      await ctx.tx
        .update(attivita)
        .set({ situazioneId: aSituazioneId, aggiornataIl: ora })
        .where(and(eq(attivita.utenteId, ctx.utenteId), inArray(attivita.id, elementi.attivita), eq(attivita.situazioneId, daSituazioneId)));
    }
    if (elementi.attese.length > 0) {
      await ctx.tx
        .update(attesa)
        .set({ situazioneId: aSituazioneId, aggiornataIl: ora })
        .where(and(eq(attesa.utenteId, ctx.utenteId), inArray(attesa.id, elementi.attese), eq(attesa.situazioneId, daSituazioneId)));
    }
  },

  /** Elementi spostati dal rifiuto registrato con la correzione indicata (evento `elementi_spostati`). */
  async spostamentoDi(ctx: ContestoUtente, correzioneId: string): Promise<{ situazioneId: string; attivita: string[]; attese: string[] } | null> {
    const [r] = await ctx.tx
      .select({ situazioneId: eventoSituazione.situazioneId, riferimenti: eventoSituazione.riferimenti })
      .from(eventoSituazione)
      .where(
        and(
          eq(eventoSituazione.utenteId, ctx.utenteId),
          eq(eventoSituazione.tipo, "elementi_spostati"),
          sql`${eventoSituazione.riferimenti}->>'correzione' = ${correzioneId}`,
        ),
      )
      .limit(1);
    if (!r) return null;
    const ids = (valore: string | undefined) => (valore ? valore.split(",").filter((x) => x.length > 0) : []);
    return { situazioneId: r.situazioneId, attivita: ids(r.riferimenti.attivita), attese: ids(r.riferimenti.attese) };
  },

  /** Sposta Attività e Attese nate da un'email da una Situazione a un'altra. */
  async spostaElementiDellEmail(ctx: ContestoUtente, emailId: string, daSituazioneId: string, aSituazioneId: string, ora: Date) {
    const attivitaSpostate = await ctx.tx
      .update(attivita)
      .set({ situazioneId: aSituazioneId, aggiornataIl: ora })
      .where(and(eq(attivita.utenteId, ctx.utenteId), eq(attivita.emailSorgenteId, emailId), eq(attivita.situazioneId, daSituazioneId)))
      .returning({ id: attivita.id });
    const atteseSpostate = await ctx.tx
      .update(attesa)
      .set({ situazioneId: aSituazioneId, aggiornataIl: ora })
      .where(and(eq(attesa.utenteId, ctx.utenteId), eq(attesa.emailRichiestaId, emailId), eq(attesa.situazioneId, daSituazioneId)))
      .returning({ id: attesa.id });
    return { attivita: attivitaSpostate.map((r) => r.id), attese: atteseSpostate.map((r) => r.id) };
  },

  /** Risposte arrivate dell'email verso le Attese di una Situazione. */
  async risposteDellEmailNellaSituazione(ctx: ContestoUtente, emailId: string, situazioneId: string) {
    const righe = await ctx.tx
      .select({ id: rispostaArrivata.id, statoCollegamento: rispostaArrivata.statoCollegamento })
      .from(rispostaArrivata)
      .innerJoin(attesa, and(eq(attesa.id, rispostaArrivata.attesaId), eq(attesa.utenteId, ctx.utenteId)))
      .where(and(eq(rispostaArrivata.utenteId, ctx.utenteId), eq(rispostaArrivata.emailId, emailId), eq(attesa.situazioneId, situazioneId)));
    return righe.map((r) => ({ id: r.id, statoCollegamento: r.statoCollegamento as StatoCollegamento }));
  },

  /** Situazioni a cui l'email appartiene: quella che ha originato e quelle collegate non rifiutate. */
  async situazioniDellEmail(ctx: ContestoUtente, emailId: string): Promise<string[]> {
    const [origini, collegate] = await Promise.all([
      ctx.tx
        .select({ id: situazione.id, assorbitaIn: situazione.assorbitaIn })
        .from(situazione)
        .where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.emailOrigineId, emailId))),
      ctx.tx
        .select({ id: collegamento.situazioneId, stato: collegamento.stato })
        .from(collegamento)
        .where(and(eq(collegamento.utenteId, ctx.utenteId), eq(collegamento.emailId, emailId))),
    ]);
    const ids = [...origini.map((o) => o.assorbitaIn ?? o.id), ...collegate.filter((c) => c.stato !== "rifiutato").map((c) => c.id)];
    if (ids.length === 0) return [];
    const esistenti = await ctx.tx
      .select({ id: situazione.id, assorbitaIn: situazione.assorbitaIn })
      .from(situazione)
      .where(and(eq(situazione.utenteId, ctx.utenteId), inArray(situazione.id, [...new Set(ids)])));
    return [...new Set(esistenti.map((s) => s.assorbitaIn ?? s.id))].sort();
  },
};
