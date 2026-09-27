import { and, asc, desc, eq, gt, inArray, lte, ne, sql } from "drizzle-orm";
import type {
  Cartella,
  Categoria,
  Classificazione,
  CopiaEmail,
  Direzione,
  Email,
  Evidenza,
  FonteLingua,
  FunzioneAI,
  Indirizzo,
  Priorita,
  StatoFunzioneEmail,
} from "@ec/core/dominio";
import { normalizzaIndirizzo } from "@ec/core/dominio";
import { classificazioneEmail, email, emailCopia, evidenza, statoFunzioneEmail } from "../schema";
import type { ContestoUtente } from "../unita-di-lavoro";

type RigaEmail = typeof email.$inferSelect;

interface Destinatari {
  a: Indirizzo[];
  cc: Indirizzo[];
  replyTo: Indirizzo[];
}

async function mappaEmail(ctx: ContestoUtente, r: RigaEmail, conTesto = true): Promise<Email> {
  const [mittente, destinatari, oggetto, testo, anteprima, allegati, riferimenti] = await Promise.all([
    ctx.codec.decifraJson<Indirizzo>("email", "mittente", r.id, r.mittenteCifrato),
    ctx.codec.decifraJson<Destinatari & { inReplyTo: string | null; references: string[]; messageId: string | null }>(
      "email",
      "destinatari",
      r.id,
      r.destinatariCifrati,
    ),
    ctx.codec.decifra("email", "oggetto", r.id, r.oggettoCifrato),
    conTesto ? ctx.codec.decifra("email", "testo", r.id, r.testoCifrato) : Promise.resolve(""),
    ctx.codec.decifra("email", "anteprima", r.id, r.anteprimaCifrata),
    r.nomiAllegatiCifrati ? ctx.codec.decifraJson<string[]>("email", "nomi_allegati", r.id, r.nomiAllegatiCifrati) : [],
    Promise.resolve(null),
  ]);
  void riferimenti;
  return {
    id: r.id,
    utenteId: r.utenteId,
    messageId: destinatari.messageId,
    direzione: r.direzione as Direzione,
    mittente,
    a: destinatari.a,
    cc: destinatari.cc,
    replyTo: destinatari.replyTo,
    oggetto,
    testo,
    anteprima,
    ricevutaIl: r.ricevutaIl,
    inReplyTo: destinatari.inReplyTo,
    references: destinatari.references,
    lingua: r.lingua,
    fonteLingua: r.fonteLingua as FonteLingua,
    nomiAllegati: allegati,
    soloPerRisposte: r.soloPerRisposte,
  };
}

export interface NuovaEmail {
  id: string;
  messageId: string | null;
  direzione: Direzione;
  mittente: Indirizzo;
  a: Indirizzo[];
  cc: Indirizzo[];
  replyTo: Indirizzo[];
  oggetto: string;
  testo: string;
  anteprima: string;
  ricevutaIl: Date;
  inReplyTo: string | null;
  references: string[];
  lingua: string;
  fonteLingua: FonteLingua;
  nomiAllegati: string[];
  soloPerRisposte: boolean;
  hashContenuto: string;
}

export interface ChiaviEmailLogica {
  messageIdIndice: string | null;
  mittenteIndice: string;
  hashContenutoIndice: string;
}

export const posta = {
  async chiaviLogiche(ctx: ContestoUtente, dati: { messageId: string | null; mittente: string; hashContenuto: string }): Promise<ChiaviEmailLogica> {
    return {
      messageIdIndice: dati.messageId ? await ctx.codec.indice("message_id", dati.messageId) : null,
      mittenteIndice: await ctx.codec.indice("indirizzo", normalizzaIndirizzo(dati.mittente)),
      hashContenutoIndice: await ctx.codec.indice("contenuto", dati.hashContenuto),
    };
  },

  async trovaEmailLogica(ctx: ContestoUtente, chiavi: ChiaviEmailLogica): Promise<string | null> {
    if (!chiavi.messageIdIndice) return null;
    const [riga] = await ctx.tx
      .select({ id: email.id })
      .from(email)
      .where(
        and(
          eq(email.utenteId, ctx.utenteId),
          eq(email.messageIdIndice, chiavi.messageIdIndice),
          eq(email.mittenteIndice, chiavi.mittenteIndice),
          eq(email.hashContenutoIndice, chiavi.hashContenutoIndice),
        ),
      );
    return riga?.id ?? null;
  },

  /** Inserisce l'Email logica; se una copia concorrente l'ha già creata restituisce l'id esistente. */
  async inserisciEmail(ctx: ContestoUtente, dati: NuovaEmail, chiavi: ChiaviEmailLogica): Promise<{ id: string; nuova: boolean }> {
    const destinatariIndici = await Promise.all(
      [...dati.a, ...dati.cc].map((d) => ctx.codec.indice("indirizzo", normalizzaIndirizzo(d.indirizzo))),
    );
    const mittente = normalizzaIndirizzo(dati.mittente.indirizzo);
    const dominio = mittente.includes("@") ? mittente.slice(mittente.lastIndexOf("@") + 1) : null;
    const valori = {
      id: dati.id,
      utenteId: ctx.utenteId,
      messageIdIndice: chiavi.messageIdIndice,
      mittenteIndice: chiavi.mittenteIndice,
      hashContenutoIndice: chiavi.hashContenutoIndice,
      direzione: dati.direzione,
      mittenteCifrato: await ctx.codec.cifraJson("email", "mittente", dati.id, { ...dati.mittente, indirizzo: mittente }),
      destinatariCifrati: await ctx.codec.cifraJson("email", "destinatari", dati.id, {
        a: dati.a,
        cc: dati.cc,
        replyTo: dati.replyTo,
        inReplyTo: dati.inReplyTo,
        references: dati.references,
        messageId: dati.messageId,
      }),
      destinatariIndici: [...new Set(destinatariIndici)],
      dominioMittenteIndice: dominio ? await ctx.codec.indice("dominio", dominio) : null,
      oggettoCifrato: await ctx.codec.cifra("email", "oggetto", dati.id, dati.oggetto),
      testoCifrato: await ctx.codec.cifra("email", "testo", dati.id, dati.testo),
      anteprimaCifrata: await ctx.codec.cifra("email", "anteprima", dati.id, dati.anteprima),
      inReplyToIndice: dati.inReplyTo ? await ctx.codec.indice("message_id", dati.inReplyTo) : null,
      referencesIndici: await Promise.all(dati.references.map((r) => ctx.codec.indice("message_id", r))),
      nomiAllegatiCifrati: dati.nomiAllegati.length ? await ctx.codec.cifraJson("email", "nomi_allegati", dati.id, dati.nomiAllegati) : null,
      ricevutaIl: dati.ricevutaIl,
      lingua: dati.lingua,
      fonteLingua: dati.fonteLingua,
      soloPerRisposte: dati.soloPerRisposte,
    };
    const inserite = await ctx.tx.insert(email).values(valori).onConflictDoNothing().returning({ id: email.id });
    if (inserite[0]) return { id: inserite[0].id, nuova: true };
    const esistente = await posta.trovaEmailLogica(ctx, chiavi);
    if (!esistente) throw new Error("email_logica_non_trovata");
    return { id: esistente, nuova: false };
  },

  async inserisciCopia(ctx: ContestoUtente, copia: Omit<CopiaEmail, "utenteId">): Promise<boolean> {
    const inserite = await ctx.tx
      .insert(emailCopia)
      .values({ ...copia, utenteId: ctx.utenteId })
      .onConflictDoNothing()
      .returning({ id: emailCopia.id });
    return inserite.length > 0;
  },

  async trovaCopia(ctx: ContestoUtente, casellaId: string, idConnettore: string) {
    const [riga] = await ctx.tx
      .select()
      .from(emailCopia)
      .where(and(eq(emailCopia.utenteId, ctx.utenteId), eq(emailCopia.casellaId, casellaId), eq(emailCopia.idConnettore, idConnettore)));
    return riga ?? null;
  },

  async copieDellEmail(ctx: ContestoUtente, emailId: string): Promise<CopiaEmail[]> {
    const righe = await ctx.tx
      .select()
      .from(emailCopia)
      .where(and(eq(emailCopia.utenteId, ctx.utenteId), eq(emailCopia.emailId, emailId)));
    return righe.map((r) => ({
      id: r.id,
      utenteId: r.utenteId,
      casellaId: r.casellaId,
      emailId: r.emailId,
      idConnettore: r.idConnettore,
      threadConnettore: r.threadConnettore,
      cartelle: r.cartelle as Cartella[],
      etichette: r.etichette,
      origineInvio: r.origineInvio as CopiaEmail["origineInvio"],
      eliminataNelProvider: r.eliminataNelProvider,
    }));
  },

  async aggiornaCartelle(ctx: ContestoUtente, casellaId: string, idConnettore: string, cartelle: Cartella[], etichette: string[]) {
    const [riga] = await ctx.tx
      .update(emailCopia)
      .set({ cartelle, etichette })
      .where(and(eq(emailCopia.utenteId, ctx.utenteId), eq(emailCopia.casellaId, casellaId), eq(emailCopia.idConnettore, idConnettore)))
      .returning({ emailId: emailCopia.emailId });
    return riga?.emailId ?? null;
  },

  async segnaEliminata(ctx: ContestoUtente, casellaId: string, idConnettore: string) {
    const [riga] = await ctx.tx
      .update(emailCopia)
      .set({ eliminataNelProvider: true })
      .where(and(eq(emailCopia.utenteId, ctx.utenteId), eq(emailCopia.casellaId, casellaId), eq(emailCopia.idConnettore, idConnettore)))
      .returning({ emailId: emailCopia.emailId });
    return riga?.emailId ?? null;
  },

  async impostaOrigineInvio(ctx: ContestoUtente, copiaId: string, origine: "app" | "esterna") {
    await ctx.tx.update(emailCopia).set({ origineInvio: origine }).where(and(eq(emailCopia.utenteId, ctx.utenteId), eq(emailCopia.id, copiaId)));
  },

  async leggi(ctx: ContestoUtente, id: string, conTesto = true): Promise<Email | null> {
    const [riga] = await ctx.tx.select().from(email).where(and(eq(email.utenteId, ctx.utenteId), eq(email.id, id)));
    return riga ? mappaEmail(ctx, riga, conTesto) : null;
  },

  async leggiMolte(ctx: ContestoUtente, ids: string[], conTesto = true): Promise<Email[]> {
    if (ids.length === 0) return [];
    const righe = await ctx.tx.select().from(email).where(and(eq(email.utenteId, ctx.utenteId), inArray(email.id, ids)));
    return Promise.all(righe.map((r) => mappaEmail(ctx, r, conTesto)));
  },

  async aggiornaDirezione(ctx: ContestoUtente, id: string, direzione: Direzione) {
    await ctx.tx.update(email).set({ direzione }).where(and(eq(email.utenteId, ctx.utenteId), eq(email.id, id)));
  },

  async aggiornaLingua(ctx: ContestoUtente, id: string, lingua: string, fonte: FonteLingua) {
    await ctx.tx.update(email).set({ lingua, fonteLingua: fonte }).where(and(eq(email.utenteId, ctx.utenteId), eq(email.id, id)));
  },

  async aggiornaRicevuta(ctx: ContestoUtente, id: string, ricevutaIl: Date) {
    await ctx.tx
      .update(email)
      .set({ ricevutaIl: sql`least(${email.ricevutaIl}, ${ricevutaIl.toISOString()}::timestamptz)` })
      .where(and(eq(email.utenteId, ctx.utenteId), eq(email.id, id)));
  },

  /** Email con lo stesso Message-ID o che lo citano nei riferimenti (collegamenti deterministici). */
  async perRiferimento(ctx: ContestoUtente, messageId: string): Promise<{ referenzianti: string[]; con: string[] }> {
    const indice = await ctx.codec.indice("message_id", messageId);
    const con = await ctx.tx
      .select({ id: email.id })
      .from(email)
      .where(and(eq(email.utenteId, ctx.utenteId), eq(email.messageIdIndice, indice)));
    const referenzianti = await ctx.tx
      .select({ id: email.id })
      .from(email)
      .where(
        and(
          eq(email.utenteId, ctx.utenteId),
          sql`(${email.inReplyToIndice} = ${indice} or ${indice} = any(${email.referencesIndici}))`,
        ),
      );
    return { con: con.map((r) => r.id), referenzianti: referenzianti.map((r) => r.id) };
  },

  /** Email che hanno questo Message-ID (per risolvere In-Reply-To e References). */
  async idPerMessageId(ctx: ContestoUtente, messageIds: string[]): Promise<string[]> {
    if (messageIds.length === 0) return [];
    const indici = await Promise.all(messageIds.map((m) => ctx.codec.indice("message_id", m)));
    const righe = await ctx.tx
      .select({ id: email.id })
      .from(email)
      .where(and(eq(email.utenteId, ctx.utenteId), inArray(email.messageIdIndice, indici)));
    return righe.map((r) => r.id);
  },

  async emailDelThread(ctx: ContestoUtente, casellaId: string, thread: string): Promise<string[]> {
    const righe = await ctx.tx
      .selectDistinct({ id: emailCopia.emailId })
      .from(emailCopia)
      .where(and(eq(emailCopia.utenteId, ctx.utenteId), eq(emailCopia.casellaId, casellaId), eq(emailCopia.threadConnettore, thread)));
    return righe.map((r) => r.id);
  },

  // ── Stato delle funzioni AI per email ──

  async impostaStatoFunzione(
    ctx: ContestoUtente,
    emailId: string,
    funzione: FunzioneAI,
    stato: StatoFunzioneEmail,
    ora: Date,
    motivo: string | null = null,
    analisiId?: string | null,
  ) {
    const extra = analisiId !== undefined ? { analisiId } : {};
    await ctx.tx
      .insert(statoFunzioneEmail)
      .values({ emailId, funzione, utenteId: ctx.utenteId, stato, motivo, aggiornatoIl: ora, ...extra })
      .onConflictDoUpdate({
        target: [statoFunzioneEmail.emailId, statoFunzioneEmail.funzione],
        set: { stato, motivo, aggiornatoIl: ora, ...extra },
        setWhere: eq(statoFunzioneEmail.utenteId, ctx.utenteId),
      });
  },

  async statiFunzione(
    ctx: ContestoUtente,
    emailId: string,
  ): Promise<Partial<Record<FunzioneAI, { stato: StatoFunzioneEmail; motivo: string | null; analisiId: string | null }>>> {
    const righe = await ctx.tx
      .select()
      .from(statoFunzioneEmail)
      .where(and(eq(statoFunzioneEmail.utenteId, ctx.utenteId), eq(statoFunzioneEmail.emailId, emailId)));
    return Object.fromEntries(righe.map((r) => [r.funzione, { stato: r.stato as StatoFunzioneEmail, motivo: r.motivo, analisiId: r.analisiId }]));
  },

  async emailConFunzioniInStato(ctx: ContestoUtente, stato: StatoFunzioneEmail, funzioni?: FunzioneAI[]): Promise<string[]> {
    const righe = await ctx.tx
      .selectDistinct({ id: statoFunzioneEmail.emailId })
      .from(statoFunzioneEmail)
      .where(
        and(
          eq(statoFunzioneEmail.utenteId, ctx.utenteId),
          eq(statoFunzioneEmail.stato, stato),
          funzioni ? inArray(statoFunzioneEmail.funzione, funzioni) : undefined,
        ),
      );
    return righe.map((r) => r.id);
  },

  async conteggioDaAnalizzare(ctx: ContestoUtente): Promise<{ daEseguire: number; inPausa: number; errore: number }> {
    const righe = await ctx.tx
      .select({ stato: statoFunzioneEmail.stato, n: sql<number>`count(distinct ${statoFunzioneEmail.emailId})::int` })
      .from(statoFunzioneEmail)
      .where(eq(statoFunzioneEmail.utenteId, ctx.utenteId))
      .groupBy(statoFunzioneEmail.stato);
    const per = Object.fromEntries(righe.map((r) => [r.stato, r.n]));
    return { daEseguire: per.da_eseguire ?? 0, inPausa: per.in_pausa ?? 0, errore: per.errore ?? 0 };
  },

  // ── Classificazione ──

  async salvaClassificazione(ctx: ContestoUtente, c: Classificazione, base: "rilevato" | "dedotto", ora: Date) {
    const valori = {
      emailId: c.emailId,
      utenteId: ctx.utenteId,
      categoria: c.categoria,
      urgente: c.urgente,
      baseUrgenza: base,
      priorita: c.priorita,
      motivazioneCifrata: await ctx.codec.cifra("classificazione_email", "motivazione", c.emailId, c.motivazione),
      titoloSituazioneCifrato: await ctx.codec.cifraOpzionale("classificazione_email", "titolo_situazione", c.emailId, c.titoloSituazione),
      descrizioneSituazioneCifrata: await ctx.codec.cifraOpzionale(
        "classificazione_email",
        "descrizione_situazione",
        c.emailId,
        c.descrizioneSituazione,
      ),
      analisiId: c.analisiId,
      aggiornataIl: ora,
    };
    await ctx.tx
      .insert(classificazioneEmail)
      .values(valori)
      .onConflictDoUpdate({ target: classificazioneEmail.emailId, set: valori, setWhere: eq(classificazioneEmail.utenteId, ctx.utenteId) });
    await ctx.tx
      .delete(evidenza)
      .where(and(eq(evidenza.utenteId, ctx.utenteId), eq(evidenza.classificazioneEmailId, c.emailId)));
    for (const e of c.evidenze) {
      const id = crypto.randomUUID();
      await ctx.tx.insert(evidenza).values({
        id,
        utenteId: ctx.utenteId,
        emailId: e.emailId,
        classificazioneEmailId: c.emailId,
        campo: "classificazione",
        base: e.verificata ? "rilevato" : "dedotto",
        citazioneCifrata: await ctx.codec.cifra("evidenza", "citazione", id, e.citazione),
        inizio: e.inizio,
        fine: e.fine,
        verificata: e.verificata,
        analisiId: c.analisiId,
      });
    }
  },

  async leggiClassificazione(ctx: ContestoUtente, emailId: string): Promise<Classificazione | null> {
    const [r] = await ctx.tx
      .select()
      .from(classificazioneEmail)
      .where(and(eq(classificazioneEmail.utenteId, ctx.utenteId), eq(classificazioneEmail.emailId, emailId)));
    if (!r) return null;
    const evidenze = await ctx.tx
      .select()
      .from(evidenza)
      .where(and(eq(evidenza.utenteId, ctx.utenteId), eq(evidenza.classificazioneEmailId, emailId)));
    return {
      emailId,
      categoria: r.categoria as Categoria,
      urgente: r.urgente,
      priorita: r.priorita as Priorita,
      motivazione: await ctx.codec.decifra("classificazione_email", "motivazione", emailId, r.motivazioneCifrata),
      titoloSituazione: await ctx.codec.decifraOpzionale("classificazione_email", "titolo_situazione", emailId, r.titoloSituazioneCifrato),
      descrizioneSituazione: await ctx.codec.decifraOpzionale(
        "classificazione_email",
        "descrizione_situazione",
        emailId,
        r.descrizioneSituazioneCifrata,
      ),
      evidenze: await Promise.all(
        evidenze.map(async (e): Promise<Evidenza> => ({
          emailId: e.emailId,
          citazione: await ctx.codec.decifra("evidenza", "citazione", e.id, e.citazioneCifrata),
          inizio: e.inizio,
          fine: e.fine,
          verificata: e.verificata,
        })),
      ),
      analisiId: r.analisiId,
    };
  },

  // ── Riconciliazione ──

  async segnaPronta(ctx: ContestoUtente, emailId: string) {
    await ctx.tx
      .update(email)
      .set({ statoRiconciliazione: "pronta", generazioneRiconciliazione: sql`${email.generazioneRiconciliazione} + 1` })
      .where(and(eq(email.utenteId, ctx.utenteId), eq(email.id, emailId)));
  },

  async segnaRiconciliata(ctx: ContestoUtente, emailId: string, ora: Date) {
    await ctx.tx
      .update(email)
      .set({ statoRiconciliazione: "riconciliata", riconciliataIl: ora })
      .where(and(eq(email.utenteId, ctx.utenteId), eq(email.id, emailId)));
  },

  /** Email pronte da riconciliare, in ordine cronologico stabile. */
  async pronte(ctx: ContestoUtente, limite: number): Promise<{ id: string; ricevutaIl: Date }[]> {
    return ctx.tx
      .select({ id: email.id, ricevutaIl: email.ricevutaIl })
      .from(email)
      .where(and(eq(email.utenteId, ctx.utenteId), eq(email.statoRiconciliazione, "pronta")))
      .orderBy(asc(email.ricevutaIl), asc(email.id))
      .limit(limite);
  },

  /** Email già riconciliate successive a un istante (per la convergenza). */
  async riconciliateDopo(ctx: ContestoUtente, dopo: Date): Promise<{ id: string; ricevutaIl: Date }[]> {
    return ctx.tx
      .select({ id: email.id, ricevutaIl: email.ricevutaIl })
      .from(email)
      .where(and(eq(email.utenteId, ctx.utenteId), eq(email.statoRiconciliazione, "riconciliata"), gt(email.ricevutaIl, dopo)))
      .orderBy(asc(email.ricevutaIl), asc(email.id));
  },

  async perDestinatarioDopo(ctx: ContestoUtente, indirizzo: string, dopo: Date): Promise<string[]> {
    const indice = await ctx.codec.indice("indirizzo", normalizzaIndirizzo(indirizzo));
    const righe = await ctx.tx
      .select({ id: email.id })
      .from(email)
      .where(and(eq(email.utenteId, ctx.utenteId), eq(email.mittenteIndice, indice), gt(email.ricevutaIl, dopo)));
    return righe.map((r) => r.id);
  },

  /** Elenco per la posta in sola lettura (senza testo). */
  async elenco(ctx: ContestoUtente, opzioni: { casellaId?: string; prima?: Date; limite: number }) {
    const righe = await ctx.tx
      .selectDistinct({ e: email })
      .from(email)
      .innerJoin(emailCopia, eq(emailCopia.emailId, email.id))
      .where(
        and(
          eq(email.utenteId, ctx.utenteId),
          eq(email.soloPerRisposte, false),
          opzioni.casellaId ? eq(emailCopia.casellaId, opzioni.casellaId) : undefined,
          opzioni.prima ? lte(email.ricevutaIl, opzioni.prima) : undefined,
        ),
      )
      .orderBy(desc(email.ricevutaIl), desc(email.id))
      .limit(opzioni.limite);
    return Promise.all(righe.map((r) => mappaEmail(ctx, r.e, false)));
  },
};
