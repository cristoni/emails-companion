import type { AttesaEsistentePerModello } from "@ec/ai";
import {
  CARTELLE_ESCLUSE,
  derivaStatoAttesa,
  dominioDi,
  normalizzaIndirizzo,
  valoreEffettivo,
  type CasellaCollegata,
  type Email,
  type Indirizzo,
  type StatoCasella,
  type StatoCollegamento,
} from "@ec/core/dominio";
import { caselle, impostazioni, indirizzi, operativo, posta, type ContestoUtente } from "@ec/db";
import { invocaFunzione } from "../analisi/invocazione";
import { emailPerModello } from "../analisi/per-modello";
import { SCOPE_INVIO } from "../caselle/consenso";
import type { Dipendenze } from "../dipendenze";
import {
  corpoNormalizzato,
  destinatariRisposta,
  destinatariSollecito,
  idValido,
  LIMITE_CORPO,
  LIMITE_OGGETTO,
  numeroVersioneValido,
  oggettoRisposta,
  oggettoSuUnaRiga,
  partecipanti,
  riferimentiRisposta,
} from "./busta";
import { bozze, type Bozza, type IntestazioniBusta, type Invio, type TipoBozza, type VersioneBozza } from "./repository";
import { fineVerifica } from "./tempi";

/** Email di contesto oltre a quella a cui si risponde: poche, per contenere costo e superficie. */
const MASSIMO_CONTESTO = 8;
const STATI_SCOLLEGAMENTO: readonly StatoCasella[] = ["scollegamento_in_corso", "scollegata"];

export type RichiestaBozza = { tipo: "risposta"; emailId: string } | { tipo: "sollecito"; attesaId: string };

export type EsitoRichiestaBozza =
  | { esito: "richiesta"; bozzaId: string; casellaId: string }
  | { esito: "email_non_trovata" | "attesa_non_trovata" | "attesa_non_attiva" | "casella_non_pronta" | "nessun_destinatario" };

export type EsitoGenerazioneBozza = "creata" | "scartata" | "non_necessaria" | "in_pausa" | "riprova" | "errore";

export type EsitoModificaBozza =
  | { esito: "modificata"; versione: number; hashBusta: string }
  | { esito: "non_trovata" | "non_modificabile" | "versione_superata" | "oggetto_non_valido" | "corpo_non_valido" };

export type AvvisoBozza = "reply_to_dominio_diverso" | "destinatari_nuovi" | "possibile_duplicato";

export interface VistaBozza {
  bozza: Bozza;
  /** Versione corrente con la busta completa e l'hash da restituire alla conferma; null finché non esiste. */
  versione: VersioneBozza | null;
  /** Ultimo invio della bozza, con stato ed errore come codici. */
  invio: Invio | null;
  /** Con un esito incerto: da quando l'utente può scegliere "Non è stato inviato" o "Invia di nuovo". */
  decisioneDal: Date | null;
  avvisi: AvvisoBozza[];
}

/** Una casella può inviare se è collegata e, per Gmail, ha il permesso di invio. */
export function casellaPronta(casella: CasellaCollegata | null, statoBloccato?: StatoCasella | null): casella is CasellaCollegata {
  if (!casella || (statoBloccato ?? casella.stato) !== "collegata") return false;
  return casella.connettore !== "gmail" || casella.scopeConcessi.includes(SCOPE_INVIO);
}

export function opzioniGenerazione(utenteId: string, bozzaId: string, esegui?: Date) {
  return { chiave: `genera_bozza:${bozzaId}`, coda: `utente:${utenteId}`, modalitaChiave: "replace" as const, ...(esegui ? { esegui } : {}) };
}

type VoceAttesa = NonNullable<Awaited<ReturnType<typeof bozze.attesa>>>;

type EsitoIntestazioni =
  | { ok: true; intestazioni: IntestazioniBusta; oggetto: string; email: Email; attesa: VoceAttesa | null }
  | { ok: false; codice: "email_non_trovata" | "attesa_non_trovata" | "nessun_destinatario" };

/**
 * Busta calcolata dal codice (§12): destinatari dalle intestazioni dell'email o dai destinatari
 * dell'Attesa, riferimenti e thread dell'email a cui si risponde nella casella mittente.
 */
async function intestazioniPer(
  ctx: ContestoUtente,
  o: { tipo: TipoBozza; emailId: string; attesaId: string | null; casellaId: string },
  indirizziUtente: ReadonlySet<string>,
): Promise<EsitoIntestazioni> {
  const email = await posta.leggi(ctx, o.emailId, false);
  if (!email) return { ok: false, codice: "email_non_trovata" };
  let attesa: VoceAttesa | null = null;
  let a: Indirizzo[];
  if (o.tipo === "sollecito") {
    attesa = o.attesaId ? await bozze.attesa(ctx, o.attesaId) : null;
    if (!attesa) return { ok: false, codice: "attesa_non_trovata" };
    a = destinatariSollecito(attesa.attesa.destinatari, indirizziUtente);
  } else {
    a = destinatariRisposta(email, indirizziUtente);
  }
  if (a.length === 0) return { ok: false, codice: "nessun_destinatario" };
  const copia = (await posta.copieDellEmail(ctx, email.id)).find((c) => c.casellaId === o.casellaId);
  return {
    ok: true,
    email,
    attesa,
    oggetto: oggettoRisposta(email.oggetto),
    intestazioni: { a, cc: [], bcc: [], ...riferimentiRisposta(email), thread: copia?.threadConnettore ?? null },
  };
}

/** Casella da cui rispondere: una che contiene l'email, è collegata e può inviare; a parità, quella a cui è indirizzata. */
async function scegliCasella(
  ctx: ContestoUtente,
  email: Email,
): Promise<{ tipo: "ok"; casellaId: string } | { tipo: "email_non_trovata" | "casella_non_pronta" }> {
  const copie = await posta.copieDellEmail(ctx, email.id);
  if (copie.length === 0) return { tipo: "email_non_trovata" };
  const indirizziEmail = new Set(
    (email.direzione === "entrata" ? [...email.a, ...email.cc] : [email.mittente]).map((i) => normalizzaIndirizzo(i.indirizzo)),
  );
  const candidate: { casella: CasellaCollegata; eliminata: boolean }[] = [];
  for (const copia of copie) {
    const casella = await caselle.leggi(ctx, copia.casellaId);
    if (casellaPronta(casella)) candidate.push({ casella, eliminata: copia.eliminataNelProvider });
  }
  const punteggio = (x: (typeof candidate)[number]) => (indirizziEmail.has(normalizzaIndirizzo(x.casella.indirizzo)) ? 0 : 1) + (x.eliminata ? 2 : 0);
  candidate.sort(
    (x, y) =>
      punteggio(x) - punteggio(y) ||
      x.casella.collegataIl.getTime() - y.casella.collegataIl.getTime() ||
      (x.casella.id < y.casella.id ? -1 : 1),
  );
  const scelta = candidate[0];
  if (!scelta) return { tipo: "casella_non_pronta" };
  // Barriera di scrittura: la casella resta collegata per tutta la transazione.
  if ((await caselle.bloccaStato(ctx, scelta.casella.id)) !== "collegata") return { tipo: "casella_non_pronta" };
  return { tipo: "ok", casellaId: scelta.casella.id };
}

async function statoEffettivoCollegamenti(ctx: ContestoUtente, situazioneId: string) {
  const [agg] = await operativo.aggregati(ctx, [situazioneId]);
  if (!agg) return { agg: null, confermate: [] as string[] };
  const confermate = agg.collegamenti
    .filter((l) => valoreEffettivo<StatoCollegamento>(l.stato, agg.correzioni, { tipo: "collegamento", id: l.id }, "stato").valore === "confermato")
    .map((l) => l.emailId);
  return { agg, confermate: [...new Set(confermate)] };
}

/** Situazione dell'email: quella che ha originato, altrimenti un collegamento confermato. Mai un collegamento solo proposto. */
async function situazioneDellEmail(ctx: ContestoUtente, emailId: string): Promise<string | null> {
  const origine = await operativo.situazionePerOrigine(ctx, emailId);
  if (origine) return origine;
  const collegamenti = await operativo.collegamentiDellEmail(ctx, emailId);
  const correzioni = await operativo.correzioniPer(ctx, collegamenti.map((l) => ({ tipo: "collegamento" as const, id: l.id })));
  const confermato = collegamenti
    .filter((l) => valoreEffettivo<StatoCollegamento>(l.stato, correzioni, { tipo: "collegamento", id: l.id }, "stato").valore === "confermato")
    .sort((x, y) => (x.situazioneId < y.situazioneId ? -1 : 1))[0];
  return bozze.situazioneAttuale(ctx, confermato?.situazioneId ?? null);
}

/** Un sollecito ha senso finché l'utente non ha chiuso l'Attesa e l'AI non l'ha superata o scartata. */
async function attesaSollecitabile(ctx: ContestoUtente, voce: VoceAttesa): Promise<boolean> {
  if (voce.attesa.ciclo === "scartata" || voce.attesa.ciclo === "superata") return false;
  const correzioni = await operativo.correzioniPer(ctx, [{ tipo: "attesa", id: voce.attesa.id }]);
  const decisione = valoreEffettivo<unknown>(null, correzioni, { tipo: "attesa", id: voce.attesa.id }, "stato").valore;
  return decisione !== "annullata" && decisione !== "soddisfatta";
}

/**
 * "Proponi risposta" / "Proponi sollecito": crea la bozza vuota (versione 0) nella casella corretta
 * e accoda la generazione. I destinatari sono calcolati qui dal codice e verificati prima di accodare.
 */
export async function richiediBozza(dip: Pick<Dipendenze, "orologio" | "ids">, ctx: ContestoUtente, r: RichiestaBozza): Promise<EsitoRichiestaBozza> {
  const ora = dip.orologio.ora();
  let emailId: string;
  let attesaId: string | null = null;
  let situazioneId: string | null;
  if (r.tipo === "sollecito") {
    if (!idValido(r.attesaId)) return { esito: "attesa_non_trovata" };
    const voce = await bozze.attesa(ctx, r.attesaId);
    if (!voce) return { esito: "attesa_non_trovata" };
    if (!(await attesaSollecitabile(ctx, voce))) return { esito: "attesa_non_attiva" };
    emailId = voce.attesa.emailRichiestaId;
    attesaId = voce.attesa.id;
    situazioneId = await bozze.situazioneAttuale(ctx, voce.attesa.situazioneId);
  } else {
    if (!idValido(r.emailId)) return { esito: "email_non_trovata" };
    emailId = r.emailId;
    situazioneId = await situazioneDellEmail(ctx, emailId);
  }
  const email = await posta.leggi(ctx, emailId, false);
  if (!email) return { esito: "email_non_trovata" };
  const casella = await scegliCasella(ctx, email);
  if (casella.tipo !== "ok") return { esito: casella.tipo };
  const base = await intestazioniPer(ctx, { tipo: r.tipo, emailId, attesaId, casellaId: casella.casellaId }, await indirizzi.dellUtente(ctx));
  if (!base.ok) return { esito: base.codice };

  const bozzaId = dip.ids.nuovo();
  await bozze.crea(ctx, { id: bozzaId, situazioneId, casellaId: casella.casellaId, emailRispostaId: emailId, attesaId, tipo: r.tipo, ora });
  await ctx.coda.accoda("genera_bozza", { utenteId: ctx.utenteId, bozzaId, richiestaId: dip.ids.nuovo() }, opzioniGenerazione(ctx.utenteId, bozzaId));
  return { esito: "richiesta", bozzaId, casellaId: casella.casellaId };
}

/** "Rigenera": nuova richiesta di generazione (nuova invocazione intenzionale) su una bozza modificabile. */
export async function rigeneraBozza(dip: Pick<Dipendenze, "ids">, ctx: ContestoUtente, bozzaId: string): Promise<boolean> {
  if (!idValido(bozzaId)) return false;
  const b = await bozze.leggi(ctx, bozzaId);
  if (!b || b.stato !== "modificabile") return false;
  await ctx.coda.accoda("genera_bozza", { utenteId: ctx.utenteId, bozzaId, richiestaId: dip.ids.nuovo() }, opzioniGenerazione(ctx.utenteId, bozzaId));
  return true;
}

/** La copia dell'email in questa casella è utilizzabile come contesto (non eliminata, non spam, cestino o bozza). */
async function inCasella(ctx: ContestoUtente, emailId: string, casellaId: string): Promise<boolean> {
  const copie = await posta.copieDellEmail(ctx, emailId);
  return copie.some((c) => c.casellaId === casellaId && !c.eliminataNelProvider && !c.cartelle.some((x) => CARTELLE_ESCLUSE.includes(x)));
}

/**
 * Contesto ammesso (§12): per una risposta il thread dell'email nella casella mittente; per entrambi i
 * tipi, le altre email della Situazione con un collegamento confermato, nella stessa casella, di cui
 * ogni destinatario era già partecipante.
 */
async function emailDiContesto(ctx: ContestoUtente, b: Bozza, e1: Email, intestazioni: IntestazioniBusta): Promise<Email[]> {
  const destinatari = [...intestazioni.a, ...intestazioni.cc, ...intestazioni.bcc].map((d) => normalizzaIndirizzo(d.indirizzo));
  const recenti = (lista: Email[]) => lista.sort((x, y) => y.ricevutaIl.getTime() - x.ricevutaIl.getTime() || (x.id < y.id ? 1 : -1));

  const thread: Email[] = [];
  if (b.tipo === "risposta" && intestazioni.thread) {
    for (const id of await posta.emailDelThread(ctx, b.casellaId, intestazioni.thread)) {
      if (id === e1.id || !(await inCasella(ctx, id, b.casellaId))) continue;
      const e = await posta.leggi(ctx, id);
      if (e) thread.push(e);
    }
  }
  const scelte = recenti(thread).slice(0, MASSIMO_CONTESTO);

  const situazioneId = await bozze.situazioneAttuale(ctx, b.situazioneId);
  if (situazioneId && scelte.length < MASSIMO_CONTESTO) {
    const giaScelte = new Set([e1.id, ...scelte.map((e) => e.id)]);
    const { confermate } = await statoEffettivoCollegamenti(ctx, situazioneId);
    const altre: Email[] = [];
    for (const id of confermate) {
      if (giaScelte.has(id) || !(await inCasella(ctx, id, b.casellaId))) continue;
      const e = await posta.leggi(ctx, id);
      if (!e) continue;
      const presenti = partecipanti(e);
      if (destinatari.every((d) => presenti.has(d))) altre.push(e);
    }
    scelte.push(...recenti(altre).slice(0, MASSIMO_CONTESTO - scelte.length));
  }
  return scelte.sort((x, y) => x.ricevutaIl.getTime() - y.ricevutaIl.getTime() || (x.id < y.id ? -1 : 1));
}

async function attesaPerModello(ctx: ContestoUtente, voce: VoceAttesa): Promise<AttesaEsistentePerModello> {
  const [agg] = await operativo.aggregati(ctx, [voce.attesa.situazioneId]);
  const derivato = agg ? derivaStatoAttesa({ attesa: voce.attesa, requisiti: voce.requisiti, risposte: agg.risposte, correzioni: agg.correzioni }) : null;
  return {
    alias: "w1",
    destinatari: voce.attesa.destinatari.map((d) => d.indirizzo),
    oggetto: voce.attesa.oggetto,
    data_attesa_iso: voce.attesa.dataAttesa?.toISOString().slice(0, 10) ?? null,
    requisiti: voce.requisiti.map((r, i) => ({
      alias: `w1r${i + 1}`,
      descrizione: r.descrizione,
      soddisfatto: derivato?.requisitiSoddisfatti.includes(r.id) ?? false,
    })),
  };
}

/**
 * Job `genera_bozza`: invoca la Funzione AI "Bozze assistite" sul contesto ammesso, nella lingua
 * dell'email a cui si risponde, e salva il corpo proposto come nuova versione. Destinatari, oggetto,
 * riferimenti e thread vengono dalla busta calcolata dal codice: l'oggetto proposto dal modello non
 * viene usato, perché il thread del provider richiede l'oggetto originale.
 */
export async function generaBozza(dip: Dipendenze, utenteId: string, bozzaId: string, richiestaId: string): Promise<EsitoGenerazioneBozza> {
  const prep = await dip.unita.perUtente(utenteId, async (ctx) => {
    const b = await bozze.leggi(ctx, bozzaId);
    if (!b || b.stato !== "modificabile" || !b.emailRispostaId) return null;
    const statoCasella = await caselle.bloccaStato(ctx, b.casellaId);
    if (!statoCasella || STATI_SCOLLEGAMENTO.includes(statoCasella)) return null;
    const base = await intestazioniPer(ctx, { tipo: b.tipo, emailId: b.emailRispostaId, attesaId: b.attesaId, casellaId: b.casellaId }, await indirizzi.dellUtente(ctx));
    if (!base.ok) return null;
    // Una rigenerazione conserva la busta della versione corrente: destinatari e oggetto non cambiano.
    const corrente = b.versioneCorrente > 0 ? await bozze.versione(ctx, b.id, b.versioneCorrente) : null;
    const intestazioni: IntestazioniBusta = corrente ? corrente.busta : base.intestazioni;
    const e1 = await posta.leggi(ctx, b.emailRispostaId);
    if (!e1) return null;
    return {
      b,
      e1,
      intestazioni,
      oggetto: corrente?.busta.oggetto ?? base.oggetto,
      contesto: await emailDiContesto(ctx, b, e1, intestazioni),
      attesa: base.attesa ? await attesaPerModello(ctx, base.attesa) : null,
      fuso: (await impostazioni.preferenze(ctx)).fusoOrario,
    };
  });
  if (!prep) return "non_necessaria";

  const alias: Record<string, string> = { e1: prep.e1.id };
  prep.contesto.forEach((e, i) => (alias[`e${i + 2}`] = e.id));
  const esito = await invocaFunzione(dip, utenteId, {
    funzione: "bozze_assistite",
    emailId: prep.e1.id,
    dati: {
      tipo: prep.b.tipo,
      email: emailPerModello(prep.e1, "e1", prep.fuso),
      contesto: prep.contesto.map((e, i) => emailPerModello(e, `e${i + 2}`, prep.fuso, { contesto: true })),
      attesa: prep.attesa,
    },
    tabella: { email: alias },
    linguaOutput: prep.e1.lingua,
    // Ogni richiesta è un'invocazione distinta; la ripetizione dello stesso job riusa l'output salvato.
    richiestaRianalisiId: richiestaId,
  });
  if (esito.tipo === "riprova") {
    const quando = new Date(dip.orologio.ora().getTime() + esito.dopoMs);
    await dip.unita.perUtente(utenteId, (ctx) =>
      ctx.coda.accoda("genera_bozza", { utenteId, bozzaId, richiestaId }, opzioniGenerazione(utenteId, bozzaId, quando)),
    );
    return "riprova";
  }
  if (esito.tipo !== "ok") return esito.tipo === "in_pausa" ? "in_pausa" : "errore";

  const corpo = corpoNormalizzato(esito.output.corpo).trim().slice(0, LIMITE_CORPO);
  const creata = await dip.unita.perUtente(utenteId, async (ctx) => {
    const statoCasella = await caselle.bloccaStato(ctx, prep.b.casellaId);
    if (!statoCasella || STATI_SCOLLEGAMENTO.includes(statoCasella)) return null;
    return bozze.aggiungiVersione(ctx, {
      id: dip.ids.nuovo(),
      bozzaId,
      versioneAttesa: prep.b.versioneCorrente,
      busta: {
        casellaId: prep.b.casellaId,
        a: prep.intestazioni.a,
        cc: prep.intestazioni.cc,
        bcc: prep.intestazioni.bcc,
        inReplyTo: prep.intestazioni.inReplyTo,
        references: prep.intestazioni.references,
        thread: prep.intestazioni.thread,
        oggetto: prep.oggetto,
        corpo,
      },
      origine: "ai",
      emailContesto: [prep.e1.id, ...prep.contesto.map((e) => e.id)],
      analisiId: esito.analisiId,
      ora: dip.orologio.ora(),
    });
  });
  // Se l'utente ha scritto una versione nel frattempo, la sua vince e la proposta resta solo nell'analisi.
  return creata ? "creata" : "scartata";
}

/** Modifica dell'utente: nuova versione immutabile con la stessa busta e il nuovo oggetto e corpo. */
export async function modificaBozza(
  dip: Pick<Dipendenze, "orologio" | "ids">,
  ctx: ContestoUtente,
  bozzaId: string,
  m: { oggetto: string; corpo: string; versioneAttesa: number },
): Promise<EsitoModificaBozza> {
  if (!idValido(bozzaId)) return { esito: "non_trovata" };
  if (!numeroVersioneValido(m.versioneAttesa, 0)) return { esito: "versione_superata" };
  if (typeof m.oggetto !== "string") return { esito: "oggetto_non_valido" };
  if (typeof m.corpo !== "string") return { esito: "corpo_non_valido" };
  const oggetto = oggettoSuUnaRiga(m.oggetto);
  const corpo = corpoNormalizzato(m.corpo);
  if (oggetto.length > LIMITE_OGGETTO) return { esito: "oggetto_non_valido" };
  if (corpo.length > LIMITE_CORPO) return { esito: "corpo_non_valido" };
  const classifica = async (): Promise<EsitoModificaBozza> => {
    const b = await bozze.leggi(ctx, bozzaId);
    if (!b) return { esito: "non_trovata" };
    if (b.stato !== "modificabile") return { esito: "non_modificabile" };
    return { esito: "versione_superata" };
  };
  const b = await bozze.leggi(ctx, bozzaId);
  if (!b || b.stato !== "modificabile" || b.versioneCorrente !== m.versioneAttesa) return classifica();
  const statoCasella = await caselle.bloccaStato(ctx, b.casellaId);
  if (!statoCasella || STATI_SCOLLEGAMENTO.includes(statoCasella)) return { esito: "non_modificabile" };

  let intestazioni: IntestazioniBusta;
  let emailContesto: string[] = [];
  if (b.versioneCorrente > 0) {
    const precedente = await bozze.versione(ctx, b.id, b.versioneCorrente);
    if (!precedente) return { esito: "versione_superata" };
    intestazioni = precedente.busta;
    emailContesto = precedente.emailContesto;
  } else {
    if (!b.emailRispostaId) return { esito: "non_trovata" };
    const base = await intestazioniPer(ctx, { tipo: b.tipo, emailId: b.emailRispostaId, attesaId: b.attesaId, casellaId: b.casellaId }, await indirizzi.dellUtente(ctx));
    if (!base.ok) return { esito: "non_trovata" };
    intestazioni = base.intestazioni;
  }
  const r = await bozze.aggiungiVersione(ctx, {
    id: dip.ids.nuovo(),
    bozzaId,
    versioneAttesa: m.versioneAttesa,
    busta: {
      casellaId: b.casellaId,
      a: intestazioni.a,
      cc: intestazioni.cc,
      bcc: intestazioni.bcc,
      inReplyTo: intestazioni.inReplyTo,
      references: intestazioni.references,
      thread: intestazioni.thread,
      oggetto,
      corpo,
    },
    origine: "utente",
    emailContesto,
    analisiId: null,
    ora: dip.orologio.ora(),
  });
  if (!r) return classifica();
  return { esito: "modificata", versione: r.versione, hashBusta: r.hashBusta };
}

async function avvisiBozza(ctx: ContestoUtente, b: Bozza, versione: VersioneBozza | null, invio: Invio | null): Promise<AvvisoBozza[]> {
  const avvisi: AvvisoBozza[] = [];
  const email = b.emailRispostaId ? await posta.leggi(ctx, b.emailRispostaId, false) : null;
  if (email && b.tipo === "risposta") {
    const dominioMittente = dominioDi(email.mittente.indirizzo);
    if (email.replyTo.some((r) => dominioDi(r.indirizzo) !== dominioMittente)) avvisi.push("reply_to_dominio_diverso");
  }
  if (email && versione) {
    const ids = versione.busta.thread ? await posta.emailDelThread(ctx, b.casellaId, versione.busta.thread) : [];
    const noti = new Set<string>();
    for (const e of [email, ...(await posta.leggiMolte(ctx, ids.filter((id) => id !== email.id), false))]) {
      for (const p of partecipanti(e)) noti.add(p);
    }
    const destinatari = [...versione.busta.a, ...versione.busta.cc, ...versione.busta.bcc];
    if (destinatari.some((d) => !noti.has(normalizzaIndirizzo(d.indirizzo)))) avvisi.push("destinatari_nuovi");
  }
  if (invio?.stato === "annullato" && invio.errore === "utente_reinvia") avvisi.push("possibile_duplicato");
  return avvisi;
}

/** Vista della bozza per la schermata di conferma: versione corrente, email usate, ultimo invio e avvisi. */
export async function leggiBozza(ctx: ContestoUtente, bozzaId: string): Promise<VistaBozza | null> {
  if (!idValido(bozzaId)) return null;
  const b = await bozze.leggi(ctx, bozzaId);
  if (!b) return null;
  const versione = b.versioneCorrente > 0 ? await bozze.versione(ctx, b.id, b.versioneCorrente) : null;
  const invio = await bozze.ultimoInvio(ctx, b.id);
  const decisioneDal = invio?.stato === "esito_incerto" ? fineVerifica(invio) : null;
  return { bozza: b, versione, invio, decisioneDal, avvisi: await avvisiBozza(ctx, b, versione, invio) };
}
