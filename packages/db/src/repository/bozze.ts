import { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  normalizzaIndirizzo,
  serializzazioneCanonica,
  STATI_INVIO_ATTIVI,
  type Indirizzo,
  type StatoBozza,
  type StatoInvio,
} from "@ec/core/dominio";
import type { Transazione } from "../connessione";
import { analisiAi, attesa, bozza, bozzaVersione, email, emailCopia, invio, situazione } from "../schema";
import type { ContestoUtente } from "../unita-di-lavoro";
import { operativo } from "./operativo";

export type TipoBozza = "risposta" | "sollecito";
export type OrigineVersione = "ai" | "utente";

/** Intestazioni della busta: calcolate dal codice, mai prese dall'output di un modello. */
export interface IntestazioniBusta {
  a: Indirizzo[];
  cc: Indirizzo[];
  bcc: Indirizzo[];
  /** Message-ID senza parentesi angolari, come in `email`. */
  inReplyTo: string | null;
  references: string[];
  thread: string | null;
}

/** Busta canonica di una versione: casella mittente, destinatari, oggetto, riferimenti, thread e corpo. */
export interface Busta extends IntestazioniBusta {
  casellaId: string;
  oggetto: string;
  corpo: string;
}

export interface Bozza {
  id: string;
  situazioneId: string | null;
  casellaId: string;
  emailRispostaId: string | null;
  attesaId: string | null;
  tipo: TipoBozza;
  stato: StatoBozza;
  versioneCorrente: number;
  creataIl: Date;
  aggiornataIl: Date;
}

export interface VersioneBozza {
  id: string;
  bozzaId: string;
  versione: number;
  busta: Busta;
  hashBusta: string;
  origine: OrigineVersione;
  /** Email effettivamente passate al modello per questa versione (o per quella da cui deriva). */
  emailContesto: string[];
  analisiId: string | null;
  creataIl: Date;
}

export interface Invio {
  id: string;
  bozzaId: string;
  versione: number;
  hashBusta: string;
  stato: StatoInvio;
  /** Indice cieco `message_id` del Message-ID generato: confrontabile con `email.message_id_indice`. */
  messageIdIndice: string | null;
  impronta: string | null;
  inizioInvio: Date | null;
  idConnettore: string | null;
  threadConnettore: string | null;
  errore: string | null;
  confermatoIl: Date;
  inviatoIl: Date | null;
  aggiornatoIl: Date;
}

export interface ModificheInvio {
  messageIdIndice?: string;
  impronta?: string;
  inizioInvio?: Date;
  idConnettore?: string | null;
  threadConnettore?: string | null;
  errore?: string | null;
  inviatoIl?: Date;
}

/** Copia di un'email inviata dall'utente, per abbinare un invio alla posta sincronizzata. */
export interface CopiaInviata {
  copiaId: string;
  emailId: string;
  idConnettore: string;
  thread: string | null;
}

export interface InvioAbbinato {
  invio: Invio;
  bozzaId: string;
  tipo: TipoBozza;
  /** Situazione della bozza, già risolta se nel frattempo è stata assorbita in un'altra. */
  situazioneId: string | null;
}

/** Stati in cui un invio può corrispondere a una copia inviata già sincronizzata. */
const STATI_ABBINABILI: StatoInvio[] = ["confermato", "in_invio", "esito_incerto", "inviato"];

/** Scarto ammesso tra l'inizio dell'invio e l'istante di ricezione della copia (orologi diversi). */
export const TOLLERANZA_IMPRONTA_MS = 60_000;

type RigaBozza = typeof bozza.$inferSelect;
type RigaInvio = typeof invio.$inferSelect;

function mappaBozza(r: RigaBozza): Bozza {
  return {
    id: r.id,
    situazioneId: r.situazioneId,
    casellaId: r.casellaId,
    emailRispostaId: r.emailRispostaId,
    attesaId: r.attesaId,
    tipo: r.tipo as TipoBozza,
    stato: r.stato as StatoBozza,
    versioneCorrente: r.versioneCorrente,
    creataIl: r.creataIl,
    aggiornataIl: r.aggiornataIl,
  };
}

function mappaInvio(r: RigaInvio): Invio {
  return {
    id: r.id,
    bozzaId: r.bozzaId,
    versione: r.versione,
    hashBusta: r.hashBusta,
    stato: r.stato as StatoInvio,
    messageIdIndice: r.messageId,
    impronta: r.impronta,
    inizioInvio: r.inizioInvio,
    idConnettore: r.idConnettore,
    threadConnettore: r.threadConnettore,
    errore: r.errore,
    confermatoIl: r.confermatoIl,
    inviatoIl: r.inviatoIl,
    aggiornatoIl: r.aggiornatoIl,
  };
}

/** Forma canonica della busta: la stessa funzione serve all'inserimento e alla verifica prima dell'invio. */
export function bustaCanonica(b: Busta): string {
  const indirizzo = (i: Indirizzo) => ({ indirizzo: normalizzaIndirizzo(i.indirizzo), nome: i.nome ?? null });
  return serializzazioneCanonica({
    casella: b.casellaId,
    a: b.a.map(indirizzo),
    cc: b.cc.map(indirizzo),
    bcc: b.bcc.map(indirizzo),
    oggetto: b.oggetto,
    corpo: b.corpo,
    inReplyTo: b.inReplyTo,
    references: b.references,
    thread: b.thread,
  });
}

export const bozze = {
  /** HMAC per utente della busta canonica. */
  hashBusta(ctx: ContestoUtente, b: Busta): Promise<string> {
    return ctx.codec.indice("busta", bustaCanonica(b));
  },

  async crea(
    ctx: ContestoUtente,
    d: { id: string; situazioneId: string | null; casellaId: string; emailRispostaId: string; attesaId: string | null; tipo: TipoBozza; ora: Date },
  ): Promise<void> {
    await ctx.tx.insert(bozza).values({
      id: d.id,
      utenteId: ctx.utenteId,
      situazioneId: d.situazioneId,
      casellaId: d.casellaId,
      emailRispostaId: d.emailRispostaId,
      attesaId: d.attesaId,
      tipo: d.tipo,
      stato: "modificabile",
      versioneCorrente: 0,
      creataIl: d.ora,
      aggiornataIl: d.ora,
    });
  },

  async leggi(ctx: ContestoUtente, id: string): Promise<Bozza | null> {
    const [r] = await ctx.tx.select().from(bozza).where(and(eq(bozza.utenteId, ctx.utenteId), eq(bozza.id, id)));
    return r ? mappaBozza(r) : null;
  },

  async versione(ctx: ContestoUtente, bozzaId: string, numero: number): Promise<VersioneBozza | null> {
    const [r] = await ctx.tx
      .select({ v: bozzaVersione, casellaId: bozza.casellaId })
      .from(bozzaVersione)
      .innerJoin(bozza, and(eq(bozza.id, bozzaVersione.bozzaId), eq(bozza.utenteId, bozzaVersione.utenteId)))
      .where(and(eq(bozzaVersione.utenteId, ctx.utenteId), eq(bozzaVersione.bozzaId, bozzaId), eq(bozzaVersione.versione, numero)));
    if (!r) return null;
    const { v } = r;
    const [intestazioni, oggetto, corpo] = await Promise.all([
      ctx.codec.decifraJson<IntestazioniBusta>("bozza_versione", "destinatari", v.id, v.destinatariCifrati),
      ctx.codec.decifra("bozza_versione", "oggetto", v.id, v.oggettoCifrato),
      ctx.codec.decifra("bozza_versione", "corpo", v.id, v.corpoCifrato),
    ]);
    return {
      id: v.id,
      bozzaId: v.bozzaId,
      versione: v.versione,
      busta: {
        casellaId: r.casellaId,
        a: intestazioni.a,
        cc: intestazioni.cc,
        bcc: intestazioni.bcc,
        inReplyTo: intestazioni.inReplyTo,
        references: intestazioni.references,
        thread: intestazioni.thread,
        oggetto,
        corpo,
      },
      hashBusta: v.hashBusta,
      origine: v.origine as OrigineVersione,
      emailContesto: v.emailContesto,
      analisiId: v.analisiId,
      creataIl: v.creataIl,
    };
  },

  /**
   * Nuova versione immutabile, solo se la bozza è ancora modificabile e alla versione attesa (CAS su
   * `versione_corrente`). Restituisce null se nel frattempo è cambiata: la versione non viene scritta.
   */
  async aggiungiVersione(
    ctx: ContestoUtente,
    d: {
      id: string;
      bozzaId: string;
      versioneAttesa: number;
      busta: Busta;
      origine: OrigineVersione;
      emailContesto: string[];
      analisiId: string | null;
      ora: Date;
    },
  ): Promise<{ versione: number; hashBusta: string } | null> {
    const nuova = d.versioneAttesa + 1;
    const aggiornate = await ctx.tx
      .update(bozza)
      .set({ versioneCorrente: nuova, aggiornataIl: d.ora })
      .where(
        and(
          eq(bozza.utenteId, ctx.utenteId),
          eq(bozza.id, d.bozzaId),
          eq(bozza.casellaId, d.busta.casellaId),
          eq(bozza.versioneCorrente, d.versioneAttesa),
          eq(bozza.stato, "modificabile"),
        ),
      )
      .returning({ id: bozza.id });
    if (aggiornate.length === 0) return null;
    const hashBusta = await bozze.hashBusta(ctx, d.busta);
    const intestazioni: IntestazioniBusta = {
      a: d.busta.a,
      cc: d.busta.cc,
      bcc: d.busta.bcc,
      inReplyTo: d.busta.inReplyTo,
      references: d.busta.references,
      thread: d.busta.thread,
    };
    await ctx.tx.insert(bozzaVersione).values({
      id: d.id,
      utenteId: ctx.utenteId,
      bozzaId: d.bozzaId,
      versione: nuova,
      destinatariCifrati: await ctx.codec.cifraJson("bozza_versione", "destinatari", d.id, intestazioni),
      oggettoCifrato: await ctx.codec.cifra("bozza_versione", "oggetto", d.id, d.busta.oggetto),
      corpoCifrato: await ctx.codec.cifra("bozza_versione", "corpo", d.id, d.busta.corpo),
      hashBusta,
      origine: d.origine,
      emailContesto: d.emailContesto,
      analisiId: d.analisiId,
      creataIl: d.ora,
    });
    return { versione: nuova, hashBusta };
  },

  /** CAS della conferma: `modificabile` → `in_invio` solo per la versione corrente indicata. */
  async bloccaPerInvio(ctx: ContestoUtente, id: string, versione: number, ora: Date): Promise<boolean> {
    const aggiornate = await ctx.tx
      .update(bozza)
      .set({ stato: "in_invio", aggiornataIl: ora })
      .where(and(eq(bozza.utenteId, ctx.utenteId), eq(bozza.id, id), eq(bozza.versioneCorrente, versione), eq(bozza.stato, "modificabile")))
      .returning({ id: bozza.id });
    return aggiornate.length > 0;
  },

  /** Transizione condizionale dello stato della bozza. */
  async cambiaStato(ctx: ContestoUtente, id: string, stato: StatoBozza, daStati: StatoBozza[], ora: Date): Promise<boolean> {
    const aggiornate = await ctx.tx
      .update(bozza)
      .set({ stato, aggiornataIl: ora })
      .where(and(eq(bozza.utenteId, ctx.utenteId), eq(bozza.id, id), inArray(bozza.stato, daStati)))
      .returning({ id: bozza.id });
    return aggiornate.length > 0;
  },

  /** Situazione attuale: segue l'eventuale assorbimento in un'altra Situazione. */
  async situazioneAttuale(ctx: ContestoUtente, situazioneId: string | null): Promise<string | null> {
    if (!situazioneId) return null;
    const [r] = await ctx.tx
      .select({ id: situazione.id, assorbitaIn: situazione.assorbitaIn })
      .from(situazione)
      .where(and(eq(situazione.utenteId, ctx.utenteId), eq(situazione.id, situazioneId)));
    return r ? (r.assorbitaIn ?? r.id) : null;
  },

  /**
   * Bozze di una Situazione, comprese quelle nate in Situazioni poi assorbite in essa: l'assorbimento è
   * appiattito (`operativo.assorbi`), quindi basta un livello. Dalla più recente.
   */
  async perSituazione(ctx: ContestoUtente, situazioneId: string): Promise<Bozza[]> {
    const righe = await ctx.tx
      .select({ b: bozza })
      .from(bozza)
      .leftJoin(situazione, and(eq(situazione.id, bozza.situazioneId), eq(situazione.utenteId, bozza.utenteId)))
      .where(and(eq(bozza.utenteId, ctx.utenteId), or(eq(bozza.situazioneId, situazioneId), eq(situazione.assorbitaIn, situazioneId))))
      .orderBy(desc(bozza.creataIl), desc(bozza.id));
    return righe.map((r) => mappaBozza(r.b));
  },

  /**
   * Bozze senza Situazione che rispondono a una delle email indicate: nascono da un'email che, alla
   * richiesta, aveva solo collegamenti proposti. Dalla più recente.
   */
  async senzaSituazionePerEmail(ctx: ContestoUtente, emailIds: readonly string[]): Promise<Bozza[]> {
    if (emailIds.length === 0) return [];
    const righe = await ctx.tx
      .select()
      .from(bozza)
      .where(and(eq(bozza.utenteId, ctx.utenteId), isNull(bozza.situazioneId), inArray(bozza.emailRispostaId, [...emailIds])))
      .orderBy(desc(bozza.creataIl), desc(bozza.id));
    return righe.map(mappaBozza);
  },

  /**
   * Ultima invocazione di "Bozze assistite" sull'email a cui si risponde, a partire dall'istante indicato:
   * stato ed eventuale codice d'errore, per spiegare all'utente una generazione che non arriva.
   */
  async ultimaGenerazione(ctx: ContestoUtente, emailId: string, dal: Date): Promise<{ stato: string; errore: string | null; avviataIl: Date } | null> {
    const [r] = await ctx.tx
      .select({ stato: analisiAi.stato, errore: analisiAi.errore, avviataIl: analisiAi.avviataIl })
      .from(analisiAi)
      .where(
        and(
          eq(analisiAi.utenteId, ctx.utenteId),
          eq(analisiAi.funzione, "bozze_assistite"),
          eq(analisiAi.emailId, emailId),
          gte(analisiAi.avviataIl, dal),
        ),
      )
      .orderBy(desc(analisiAi.avviataIl))
      .limit(1);
    return r ?? null;
  },

  /** Attesa da sollecitare, decifrata. */
  async attesa(ctx: ContestoUtente, attesaId: string) {
    const righe = await ctx.tx.select().from(attesa).where(and(eq(attesa.utenteId, ctx.utenteId), eq(attesa.id, attesaId)));
    const [voce] = await operativo.mappaAttese(ctx, righe);
    return voce ?? null;
  },

  // ── Invii ──

  /**
   * Inserisce l'invio `confermato`. L'indice unico parziale su `bozza_id` è la protezione di riserva:
   * con un invio attivo già presente non inserisce nulla e restituisce false, senza interrompere la transazione.
   */
  async inserisciInvio(ctx: ContestoUtente, d: { id: string; bozzaId: string; versione: number; hashBusta: string; ora: Date }): Promise<boolean> {
    const risultato = await ctx.tx.execute(sql`
      insert into invio (id, utente_id, bozza_id, versione, hash_busta, stato, confermato_il, aggiornato_il)
      values (${d.id}::uuid, ${ctx.utenteId}, ${d.bozzaId}::uuid, ${d.versione}::int, ${d.hashBusta}, 'confermato',
              ${d.ora.toISOString()}::timestamptz, ${d.ora.toISOString()}::timestamptz)
      on conflict (bozza_id) where stato in ('confermato','in_invio','inviato','esito_incerto') do nothing
      returning id`);
    return (risultato as unknown as { rows: unknown[] }).rows.length > 0;
  },

  async leggiInvio(ctx: ContestoUtente, id: string): Promise<Invio | null> {
    const [r] = await ctx.tx.select().from(invio).where(and(eq(invio.utenteId, ctx.utenteId), eq(invio.id, id)));
    return r ? mappaInvio(r) : null;
  },

  /** L'invio che blocca la bozza (confermato, in invio, inviato o con esito incerto), se esiste. */
  async invioAttivo(ctx: ContestoUtente, bozzaId: string): Promise<Invio | null> {
    const [r] = await ctx.tx
      .select()
      .from(invio)
      .where(and(eq(invio.utenteId, ctx.utenteId), eq(invio.bozzaId, bozzaId), inArray(invio.stato, [...STATI_INVIO_ATTIVI])))
      .orderBy(desc(invio.confermatoIl))
      .limit(1);
    return r ? mappaInvio(r) : null;
  },

  async ultimoInvio(ctx: ContestoUtente, bozzaId: string): Promise<Invio | null> {
    const [r] = await ctx.tx
      .select()
      .from(invio)
      .where(and(eq(invio.utenteId, ctx.utenteId), eq(invio.bozzaId, bozzaId)))
      .orderBy(desc(invio.confermatoIl), desc(invio.aggiornatoIl))
      .limit(1);
    return r ? mappaInvio(r) : null;
  },

  /** Transizione condizionale dello stato di un invio: vince sempre la prima transizione valida. */
  async transizioneInvio(
    ctx: ContestoUtente,
    id: string,
    verso: StatoInvio,
    daStati: StatoInvio[],
    modifiche: ModificheInvio,
    ora: Date,
  ): Promise<Invio | null> {
    const { messageIdIndice, ...resto } = modifiche;
    const [r] = await ctx.tx
      .update(invio)
      .set({ ...resto, ...(messageIdIndice !== undefined ? { messageId: messageIdIndice } : {}), stato: verso, aggiornatoIl: ora })
      .where(and(eq(invio.utenteId, ctx.utenteId), eq(invio.id, id), inArray(invio.stato, daStati)))
      .returning();
    return r ? mappaInvio(r) : null;
  },

  /**
   * Lettura trasversale agli utenti per lo sweeper: invii `confermato` mai partiti e `in_invio` oltre
   * il timeout. Restituisce solo identificativi e stato; le transizioni avvengono per utente.
   */
  async daSpazzare(
    tx: Transazione,
    soglie: { confermatoPrimaDi: Date; inInvioPrimaDi: Date },
    limite = 500,
  ): Promise<{ id: string; utenteId: string; stato: StatoInvio }[]> {
    const righe = await tx
      .select({ id: invio.id, utenteId: invio.utenteId, stato: invio.stato })
      .from(invio)
      .where(
        or(
          and(eq(invio.stato, "confermato"), lt(invio.confermatoIl, soglie.confermatoPrimaDi)),
          and(eq(invio.stato, "in_invio"), lt(invio.inizioInvio, soglie.inInvioPrimaDi)),
        ),
      )
      .orderBy(invio.aggiornatoIl)
      .limit(limite);
    return righe.map((r) => ({ ...r, stato: r.stato as StatoInvio }));
  },

  /**
   * Invio della stessa casella che corrisponde a una copia inviata: id del connettore, Message-ID
   * generato (indice cieco) oppure thread + impronta, in quest'ordine di forza. L'impronta vale solo
   * per copie non precedenti all'inizio dell'invio e per invii non ancora abbinati a un'altra copia:
   * una risposta identica scritta prima a mano non deve far credere partito un invio incerto.
   */
  async invioPerCopia(
    ctx: ContestoUtente,
    criteri: {
      casellaId: string;
      idConnettore: string;
      messageIdIndice: string | null;
      thread: string | null;
      impronta: string | null;
      ricevutaIl: Date;
    },
  ): Promise<InvioAbbinato | null> {
    const perImpronta =
      criteri.impronta && criteri.thread
        ? and(
            eq(invio.impronta, criteri.impronta),
            eq(invio.threadConnettore, criteri.thread),
            or(isNull(invio.idConnettore), eq(invio.idConnettore, criteri.idConnettore)),
            lte(invio.inizioInvio, new Date(criteri.ricevutaIl.getTime() + TOLLERANZA_IMPRONTA_MS)),
          )
        : undefined;
    const condizioni = [
      eq(invio.idConnettore, criteri.idConnettore),
      criteri.messageIdIndice ? eq(invio.messageId, criteri.messageIdIndice) : undefined,
      perImpronta,
    ];
    const righe = await ctx.tx
      .select({ i: invio, tipo: bozza.tipo, situazioneId: bozza.situazioneId, assorbitaIn: situazione.assorbitaIn })
      .from(invio)
      .innerJoin(bozza, and(eq(bozza.id, invio.bozzaId), eq(bozza.utenteId, invio.utenteId)))
      .leftJoin(situazione, and(eq(situazione.id, bozza.situazioneId), eq(situazione.utenteId, bozza.utenteId)))
      .where(
        and(
          eq(invio.utenteId, ctx.utenteId),
          eq(bozza.casellaId, criteri.casellaId),
          inArray(invio.stato, STATI_ABBINABILI),
          or(...condizioni),
        ),
      );
    const forza = (r: RigaInvio) =>
      r.idConnettore === criteri.idConnettore ? 0 : criteri.messageIdIndice && r.messageId === criteri.messageIdIndice ? 1 : 2;
    const [scelta] = righe.sort((x, y) => forza(x.i) - forza(y.i) || y.i.confermatoIl.getTime() - x.i.confermatoIl.getTime());
    if (!scelta) return null;
    return {
      invio: mappaInvio(scelta.i),
      bozzaId: scelta.i.bozzaId,
      tipo: scelta.tipo as TipoBozza,
      situazioneId: scelta.situazioneId ? (scelta.assorbitaIn ?? scelta.situazioneId) : null,
    };
  },

  /** Copie inviate dall'utente nella casella, per Message-ID (indice cieco) o per thread. */
  async copieInviate(ctx: ContestoUtente, casellaId: string, filtro: { messageIdIndice: string } | { thread: string }): Promise<CopiaInviata[]> {
    const righe = await ctx.tx
      .select({ copiaId: emailCopia.id, emailId: emailCopia.emailId, idConnettore: emailCopia.idConnettore, thread: emailCopia.threadConnettore })
      .from(emailCopia)
      .innerJoin(email, and(eq(email.id, emailCopia.emailId), eq(email.utenteId, emailCopia.utenteId)))
      .where(
        and(
          eq(emailCopia.utenteId, ctx.utenteId),
          eq(emailCopia.casellaId, casellaId),
          inArray(email.direzione, ["uscita", "interna"]),
          "messageIdIndice" in filtro ? eq(email.messageIdIndice, filtro.messageIdIndice) : eq(emailCopia.threadConnettore, filtro.thread),
        ),
      )
      .orderBy(emailCopia.acquisitaIl, emailCopia.id);
    return righe;
  },
};
