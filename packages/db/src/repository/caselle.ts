import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { CasellaCollegata, FaseImportazione, StatoCasella } from "@ec/core/dominio";
import { normalizzaIndirizzo } from "@ec/core/dominio";
import type { Transazione } from "../connessione";
import { casella, credenzialeCasella, indirizzoUtente, sincronizzazioneCasella } from "../schema";
import type { ContestoUtente } from "../unita-di-lavoro";

type RigaCasella = typeof casella.$inferSelect;

async function mappaCasella(ctx: ContestoUtente, riga: RigaCasella, fase: FaseImportazione): Promise<CasellaCollegata> {
  return {
    id: riga.id,
    utenteId: riga.utenteId,
    connettore: riga.connettore,
    indirizzo: riga.indirizzoCifrato ? await ctx.codec.decifra("casella", "indirizzo", riga.id, riga.indirizzoCifrato) : "",
    stato: riga.stato as StatoCasella,
    scopeConcessi: riga.scopeConcessi,
    collegataIl: riga.collegataIl,
    faseImportazione: fase,
  };
}

export const caselle = {
  async inserisci(
    ctx: ContestoUtente,
    dati: { id: string; connettore: string; indirizzo: string; accountEsterno: string; stato: StatoCasella; scope: string[]; ora: Date },
  ): Promise<void> {
    const indirizzo = normalizzaIndirizzo(dati.indirizzo);
    await ctx.tx.insert(casella).values({
      id: dati.id,
      utenteId: ctx.utenteId,
      connettore: dati.connettore,
      indirizzoCifrato: await ctx.codec.cifra("casella", "indirizzo", dati.id, indirizzo),
      indirizzoGlobale: ctx.codec.indiceGlobale("indirizzo_casella", indirizzo),
      accountEsternoGlobale: ctx.codec.indiceGlobale("account_esterno", `${dati.connettore}:${dati.accountEsterno}`),
      stato: dati.stato,
      scopeConcessi: dati.scope,
      collegataIl: dati.ora,
      aggiornataIl: dati.ora,
    });
  },

  async leggi(ctx: ContestoUtente, id: string): Promise<CasellaCollegata | null> {
    const [riga] = await ctx.tx
      .select({ c: casella, fase: sincronizzazioneCasella.faseImportazione })
      .from(casella)
      .leftJoin(sincronizzazioneCasella, eq(sincronizzazioneCasella.casellaId, casella.id))
      .where(and(eq(casella.utenteId, ctx.utenteId), eq(casella.id, id)));
    return riga ? mappaCasella(ctx, riga.c, (riga.fase ?? "da_stimare") as FaseImportazione) : null;
  },

  /** Caselle non scollegate dell'utente. */
  async elenca(ctx: ContestoUtente): Promise<CasellaCollegata[]> {
    const righe = await ctx.tx
      .select({ c: casella, fase: sincronizzazioneCasella.faseImportazione })
      .from(casella)
      .leftJoin(sincronizzazioneCasella, eq(sincronizzazioneCasella.casellaId, casella.id))
      .where(and(eq(casella.utenteId, ctx.utenteId), ne(casella.stato, "scollegata")))
      .orderBy(casella.collegataIl);
    return Promise.all(righe.map((r) => mappaCasella(ctx, r.c, (r.fase ?? "da_stimare") as FaseImportazione)));
  },

  /** Casella attiva (di qualunque utente) per lo stesso account esterno. */
  async attivaPerAccount(tx: Transazione, accountGlobale: string, connettore: string) {
    const [riga] = await tx
      .select({ id: casella.id, utenteId: casella.utenteId, stato: casella.stato })
      .from(casella)
      .where(
        and(
          eq(casella.connettore, connettore),
          eq(casella.accountEsternoGlobale, accountGlobale),
          ne(casella.stato, "scollegata"),
        ),
      );
    return riga ?? null;
  },

  /** Transizione condizionale: non sovrascrive mai 'scollegata' o 'scollegamento_in_corso'. */
  async cambiaStato(
    ctx: ContestoUtente,
    id: string,
    stato: StatoCasella,
    daStati: StatoCasella[],
    ora: Date,
    extra: { scope?: string[]; ultimoErrore?: string | null } = {},
  ): Promise<boolean> {
    const aggiornate = await ctx.tx
      .update(casella)
      .set({
        stato,
        aggiornataIl: ora,
        ...(extra.scope ? { scopeConcessi: extra.scope } : {}),
        ...(extra.ultimoErrore !== undefined ? { ultimoErrore: extra.ultimoErrore } : {}),
      })
      .where(and(eq(casella.utenteId, ctx.utenteId), eq(casella.id, id), inArray(casella.stato, daStati)))
      .returning({ id: casella.id });
    return aggiornate.length > 0;
  },

  /** Barriera di scrittura: blocca la riga in condivisione per tutta la transazione. */
  async bloccaStato(ctx: ContestoUtente, id: string): Promise<StatoCasella | null> {
    const risultato = await ctx.tx.execute(
      sql`select stato from casella where id = ${id}::uuid and utente_id = ${ctx.utenteId} for share`,
    );
    const riga = (risultato as unknown as { rows: { stato: string }[] }).rows[0];
    return (riga?.stato as StatoCasella | undefined) ?? null;
  },

  /** Riduce la casella scollegata a una riga terminale senza dati personali. */
  async rendiTerminale(ctx: ContestoUtente, id: string, ora: Date): Promise<void> {
    await ctx.tx
      .update(casella)
      .set({
        stato: "scollegata",
        indirizzoCifrato: null,
        indirizzoGlobale: null,
        accountEsternoGlobale: null,
        scopeConcessi: [],
        ultimoErrore: null,
        scollegataIl: ora,
        aggiornataIl: ora,
      })
      .where(and(eq(casella.utenteId, ctx.utenteId), eq(casella.id, id)));
  },

  /** Lettura trasversale: utente proprietario di una casella (per i connettori). */
  async utenteDellaCasella(tx: Transazione, casellaId: string): Promise<string | null> {
    const [riga] = await tx.select({ utenteId: casella.utenteId }).from(casella).where(eq(casella.id, casellaId));
    return riga?.utenteId ?? null;
  },

  /** Caselle attive di tutti gli utenti, per il rinnovo quotidiano di watch e alias. */
  async attiveDiTutti(tx: Transazione) {
    return tx
      .select({ casellaId: casella.id, utenteId: casella.utenteId })
      .from(casella)
      .where(inArray(casella.stato, ["collegata", "permessi_incompleti"]));
  },

  /** Lettura trasversale per il consumer delle notifiche. */
  async attivaPerIndirizzo(tx: Transazione, indirizzoGlobale: string) {
    const [riga] = await tx
      .select({ id: casella.id, utenteId: casella.utenteId })
      .from(casella)
      .where(and(eq(casella.indirizzoGlobale, indirizzoGlobale), inArray(casella.stato, ["collegata", "permessi_incompleti"])));
    return riga ?? null;
  },
};

export interface Credenziali {
  refreshToken: string | null;
  accessToken: string | null;
  scadenzaAccesso: Date | null;
  generazione: number;
}

export const credenziali = {
  /**
   * Nuovo consenso. Con un refresh token aumenta la generazione; senza, conserva quello esistente
   * e aggiorna solo il token di accesso.
   */
  async registraConsenso(
    ctx: ContestoUtente,
    casellaId: string,
    dati: { refreshToken: string | null; accessToken: string; scadenzaAccesso: Date; ora: Date },
  ): Promise<number> {
    const accesso = await ctx.codec.cifra("credenziale_casella", "access_token", casellaId, dati.accessToken);
    const refresh = dati.refreshToken
      ? await ctx.codec.cifra("credenziale_casella", "refresh_token", casellaId, dati.refreshToken)
      : null;
    const [riga] = await ctx.tx
      .insert(credenzialeCasella)
      .values({
        casellaId,
        utenteId: ctx.utenteId,
        refreshTokenCifrato: refresh,
        accessTokenCifrato: accesso,
        scadenzaAccesso: dati.scadenzaAccesso,
        generazione: 1,
        aggiornataIl: dati.ora,
      })
      .onConflictDoUpdate({
        target: credenzialeCasella.casellaId,
        set: refresh
          ? {
              refreshTokenCifrato: refresh,
              accessTokenCifrato: accesso,
              scadenzaAccesso: dati.scadenzaAccesso,
              generazione: sql`${credenzialeCasella.generazione} + 1`,
              aggiornataIl: dati.ora,
            }
          : { accessTokenCifrato: accesso, scadenzaAccesso: dati.scadenzaAccesso, aggiornataIl: dati.ora },
        setWhere: eq(credenzialeCasella.utenteId, ctx.utenteId),
      })
      .returning({ generazione: credenzialeCasella.generazione });
    return riga?.generazione ?? 1;
  },

  async leggi(ctx: ContestoUtente, casellaId: string): Promise<Credenziali | null> {
    const [riga] = await ctx.tx
      .select()
      .from(credenzialeCasella)
      .where(and(eq(credenzialeCasella.utenteId, ctx.utenteId), eq(credenzialeCasella.casellaId, casellaId)));
    if (!riga) return null;
    return {
      refreshToken: await ctx.codec.decifraOpzionale("credenziale_casella", "refresh_token", casellaId, riga.refreshTokenCifrato),
      accessToken: await ctx.codec.decifraOpzionale("credenziale_casella", "access_token", casellaId, riga.accessTokenCifrato),
      scadenzaAccesso: riga.scadenzaAccesso,
      generazione: riga.generazione,
    };
  },

  /** Salva un token rinnovato solo se il consenso non è cambiato e la scadenza è più recente. */
  async salvaAccessoSeValido(
    ctx: ContestoUtente,
    casellaId: string,
    generazione: number,
    accessToken: string,
    scadenza: Date,
  ): Promise<boolean> {
    const cifrato = await ctx.codec.cifra("credenziale_casella", "access_token", casellaId, accessToken);
    const aggiornate = await ctx.tx
      .update(credenzialeCasella)
      .set({ accessTokenCifrato: cifrato, scadenzaAccesso: scadenza })
      .where(
        and(
          eq(credenzialeCasella.utenteId, ctx.utenteId),
          eq(credenzialeCasella.casellaId, casellaId),
          eq(credenzialeCasella.generazione, generazione),
          or(isNull(credenzialeCasella.scadenzaAccesso), lt(credenzialeCasella.scadenzaAccesso, scadenza)),
        ),
      )
      .returning({ id: credenzialeCasella.casellaId });
    return aggiornate.length > 0;
  },

  /** invalid_grant: la casella diventa da ricollegare solo se il consenso usato è ancora quello attuale. */
  async segnaDaRicollegare(ctx: ContestoUtente, casellaId: string, generazione: number, ora: Date): Promise<boolean> {
    const aggiornate = await ctx.tx.execute(sql`
      update casella set stato = 'da_ricollegare', ultimo_errore = 'autorizzazione_revocata', aggiornata_il = ${ora.toISOString()}::timestamptz
      where id = ${casellaId}::uuid and utente_id = ${ctx.utenteId}
        and stato in ('collegata','permessi_incompleti')
        and exists (select 1 from credenziale_casella c where c.casella_id = ${casellaId}::uuid and c.generazione = ${generazione})
      returning id`);
    return (aggiornate as unknown as { rows: unknown[] }).rows.length > 0;
  },

  async elimina(ctx: ContestoUtente, casellaId: string): Promise<void> {
    await ctx.tx
      .delete(credenzialeCasella)
      .where(and(eq(credenzialeCasella.utenteId, ctx.utenteId), eq(credenzialeCasella.casellaId, casellaId)));
  },
};

export type StatoSincronizzazione = typeof sincronizzazioneCasella.$inferSelect;

export const sincronizzazione = {
  async inizializza(
    ctx: ContestoUtente,
    casellaId: string,
    dati: { cursore: string; riferimento: Date; finestraRicevuteDa: Date; finestraInviateDa: Date },
  ): Promise<boolean> {
    const inserite = await ctx.tx
      .insert(sincronizzazioneCasella)
      .values({
        casellaId,
        utenteId: ctx.utenteId,
        cursore: dati.cursore,
        faseImportazione: "da_stimare",
        riferimentoImportazione: dati.riferimento,
        finestraRicevuteDa: dati.finestraRicevuteDa,
        finestraInviateDa: dati.finestraInviateDa,
        aggiornataIl: dati.riferimento,
      })
      .onConflictDoNothing()
      .returning({ casellaId: sincronizzazioneCasella.casellaId });
    return inserite.length > 0;
  },

  async leggi(ctx: ContestoUtente, casellaId: string): Promise<StatoSincronizzazione | null> {
    const [riga] = await ctx.tx
      .select()
      .from(sincronizzazioneCasella)
      .where(and(eq(sincronizzazioneCasella.utenteId, ctx.utenteId), eq(sincronizzazioneCasella.casellaId, casellaId)));
    return riga ?? null;
  },

  async aggiorna(
    ctx: ContestoUtente,
    casellaId: string,
    modifiche: Partial<Omit<StatoSincronizzazione, "casellaId" | "utenteId">>,
  ): Promise<void> {
    await ctx.tx
      .update(sincronizzazioneCasella)
      .set(modifiche)
      .where(and(eq(sincronizzazioneCasella.utenteId, ctx.utenteId), eq(sincronizzazioneCasella.casellaId, casellaId)));
  },

  /** Cambio di fase condizionale (es. confermata → in_corso). */
  async cambiaFase(ctx: ContestoUtente, casellaId: string, fase: FaseImportazione, daFasi: FaseImportazione[], ora: Date) {
    const aggiornate = await ctx.tx
      .update(sincronizzazioneCasella)
      .set({ faseImportazione: fase, aggiornataIl: ora })
      .where(
        and(
          eq(sincronizzazioneCasella.utenteId, ctx.utenteId),
          eq(sincronizzazioneCasella.casellaId, casellaId),
          inArray(sincronizzazioneCasella.faseImportazione, daFasi),
        ),
      )
      .returning({ id: sincronizzazioneCasella.casellaId });
    return aggiornate.length > 0;
  },

  /** Caselle da sincronizzare: lettura trasversale per il pianificatore. */
  async dovute(tx: Transazione, ora: Date, intervalloMs: number) {
    const soglia = new Date(ora.getTime() - intervalloMs);
    return tx
      .select({ casellaId: casella.id, utenteId: casella.utenteId })
      .from(casella)
      // Anche una casella autorizzata senza stato di sincronizzazione è dovuta: la sincronizzazione la inizializza.
      .leftJoin(sincronizzazioneCasella, eq(sincronizzazioneCasella.casellaId, casella.id))
      .where(
        and(
          inArray(casella.stato, ["collegata", "permessi_incompleti"]),
          or(isNull(sincronizzazioneCasella.nonPrimaDi), lt(sincronizzazioneCasella.nonPrimaDi, ora)),
          or(isNull(sincronizzazioneCasella.ultimaSyncOk), lt(sincronizzazioneCasella.ultimaSyncOk, soglia)),
        ),
      );
  },
};

export const indirizzi = {
  async sostituisci(ctx: ContestoUtente, casellaId: string, voci: { indirizzo: string; origine: "casella" | "alias" }[], nuovoId: () => string) {
    await ctx.tx
      .delete(indirizzoUtente)
      .where(and(eq(indirizzoUtente.utenteId, ctx.utenteId), eq(indirizzoUtente.casellaId, casellaId)));
    const uniche = new Map<string, "casella" | "alias">();
    for (const v of voci) {
      const n = normalizzaIndirizzo(v.indirizzo);
      if (n && (!uniche.has(n) || v.origine === "casella")) uniche.set(n, v.origine);
    }
    for (const [indirizzo, origine] of uniche) {
      const id = nuovoId();
      await ctx.tx.insert(indirizzoUtente).values({
        id,
        utenteId: ctx.utenteId,
        casellaId,
        indirizzoIndice: await ctx.codec.indice("indirizzo", indirizzo),
        indirizzoCifrato: await ctx.codec.cifra("indirizzo_utente", "indirizzo", id, indirizzo),
        origine,
      });
    }
  },

  /** Indirizzi dell'utente, normalizzati, di tutte le caselle non scollegate. */
  async dellUtente(ctx: ContestoUtente): Promise<Set<string>> {
    const righe = await ctx.tx
      .select({ id: indirizzoUtente.id, cifrato: indirizzoUtente.indirizzoCifrato })
      .from(indirizzoUtente)
      .where(eq(indirizzoUtente.utenteId, ctx.utenteId));
    const valori = await Promise.all(righe.map((r) => ctx.codec.decifra("indirizzo_utente", "indirizzo", r.id, r.cifrato)));
    return new Set(valori);
  },

  async indiciDellUtente(ctx: ContestoUtente): Promise<Set<string>> {
    const righe = await ctx.tx
      .select({ indice: indirizzoUtente.indirizzoIndice })
      .from(indirizzoUtente)
      .where(eq(indirizzoUtente.utenteId, ctx.utenteId));
    return new Set(righe.map((r) => r.indice));
  },
};
