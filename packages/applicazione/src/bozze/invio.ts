import type { Attore, StatoInvio } from "@ec/core/dominio";
import { ErroreConnettore, type ConnettorePosta, type EsitoInvioConnettore, type MessaggioInUscita } from "@ec/core/porte";
import { caselle, operativo, posta, type ContestoUtente } from "@ec/db";
import { MINUTO_MS, type Dipendenze } from "../dipendenze";
import { idValido, improntaBusta, improntaEmail, messageIdPerInvio, numeroVersioneValido } from "./busta";
import { casellaPronta } from "./richiesta";
import { bozze, TOLLERANZA_IMPRONTA_MS, type Bozza, type Invio } from "./repository";
import { DURATA_VERIFICA_MS, fineVerifica, SOGLIA_CONFERMATO_MS, SOGLIA_IN_INVIO_MS } from "./tempi";

export { DURATA_VERIFICA_MS, fineVerifica, SOGLIA_CONFERMATO_MS, SOGLIA_IN_INVIO_MS } from "./tempi";

export type EsitoConfermaInvio =
  | { esito: "confermato"; invioId: string }
  | { esito: "gia_in_corso"; invioId: string; stato: StatoInvio }
  | { esito: "versione_superata" | "casella_non_pronta" | "non_trovata" | "bozza_vuota" };

export type EsitoInvioEmail = "inviato" | "esito_sconosciuto" | "fallito" | "non_necessario";
export type EsitoVerificaInvio = "inviato" | "in_verifica" | "non_trovato" | "non_necessaria";

export type EsitoDecisioneInvio =
  | { esito: "annullato"; bozzaId: string; nuovaConfermaRichiesta: boolean }
  | { esito: "non_trovato" }
  | { esito: "non_incerto"; stato: StatoInvio }
  /** La verifica automatica è ancora in corso: l'utente potrà decidere da `decisioneDal`. */
  | { esito: "in_verifica"; decisioneDal: Date };

export interface AbbinamentoInvio {
  /** Situazione della bozza: il riconciliatore vi collega l'email con origine `invio_app`. */
  situazioneId: string | null;
  ruolo: "risposta" | "sollecito";
  bozzaId: string;
  invioId: string;
}

async function evento(ctx: ContestoUtente, b: Bozza, tipo: string, attore: Attore, riferimenti: Record<string, string>, ora: Date) {
  const situazioneId = await bozze.situazioneAttuale(ctx, b.situazioneId);
  if (situazioneId) await operativo.evento(ctx, { situazioneId, attore, tipo, riferimenti, dettagli: null, creatoIl: ora });
}

/**
 * Conferma esplicita dell'utente (§12), l'unica via verso l'invio: in una sola transazione porta la
 * bozza da `modificabile` a `in_invio` per la versione e l'hash di busta mostrati, crea l'invio
 * `confermato` e accoda `invia_email` senza ritentativi. Ripetuta, restituisce l'invio già esistente.
 */
export async function confermaInvio(
  dip: Pick<Dipendenze, "orologio" | "ids">,
  ctx: ContestoUtente,
  c: { bozzaId: string; versione: number; hashBusta: string },
): Promise<EsitoConfermaInvio> {
  const ora = dip.orologio.ora();
  if (!idValido(c.bozzaId)) return { esito: "non_trovata" };
  if (!numeroVersioneValido(c.versione, 1) || typeof c.hashBusta !== "string") return { esito: "versione_superata" };
  const b = await bozze.leggi(ctx, c.bozzaId);
  if (!b) return { esito: "non_trovata" };
  const esistente = async (): Promise<EsitoConfermaInvio | null> => {
    const invio = await bozze.invioAttivo(ctx, b.id);
    return invio ? { esito: "gia_in_corso", invioId: invio.id, stato: invio.stato } : null;
  };

  const statoCasella = await caselle.bloccaStato(ctx, b.casellaId);
  const casella = await caselle.leggi(ctx, b.casellaId);
  const versione = await bozze.versione(ctx, b.id, c.versione);
  if (!versione || versione.hashBusta !== c.hashBusta) return (await esistente()) ?? { esito: "versione_superata" };
  if (!casellaPronta(casella, statoCasella)) return (await esistente()) ?? { esito: "casella_non_pronta" };
  if (versione.busta.corpo.trim() === "" || versione.busta.a.length + versione.busta.cc.length === 0) return { esito: "bozza_vuota" };

  if (!(await bozze.bloccaPerInvio(ctx, b.id, c.versione, ora))) return (await esistente()) ?? { esito: "versione_superata" };
  const invioId = dip.ids.nuovo();
  const inserito = await bozze.inserisciInvio(ctx, { id: invioId, bozzaId: b.id, versione: c.versione, hashBusta: versione.hashBusta, ora });
  if (!inserito) {
    // L'indice unico ha trovato un invio attivo: la bozza torna com'era e si restituisce quello.
    await bozze.cambiaStato(ctx, b.id, "modificabile", ["in_invio"], ora);
    return (await esistente()) ?? { esito: "versione_superata" };
  }
  await ctx.coda.accoda("invia_email", { utenteId: ctx.utenteId, invioId }, { tentativiMassimi: 1 });
  await evento(ctx, b, "invio_confermato", "utente", { bozza: b.id, invio: invioId }, ora);
  return { esito: "confermato", invioId };
}

/** Invio riuscito o riconosciuto nella posta: vince su `in_invio` e su `esito_incerto`. */
async function segnaInviato(
  ctx: ContestoUtente,
  invioId: string,
  dati: { idConnettore: string | null; threadConnettore: string | null; messageIdIndice?: string },
  ora: Date,
): Promise<boolean> {
  const aggiornato = await bozze.transizioneInvio(
    ctx,
    invioId,
    "inviato",
    ["in_invio", "esito_incerto"],
    {
      ...(dati.idConnettore ? { idConnettore: dati.idConnettore } : {}),
      ...(dati.threadConnettore ? { threadConnettore: dati.threadConnettore } : {}),
      ...(dati.messageIdIndice ? { messageIdIndice: dati.messageIdIndice } : {}),
      inviatoIl: ora,
      errore: null,
    },
    ora,
  );
  if (!aggiornato) return false;
  const b = await bozze.leggi(ctx, aggiornato.bozzaId);
  if (b && (await bozze.cambiaStato(ctx, b.id, "inviata", ["in_invio"], ora))) {
    await evento(ctx, b, "bozza_inviata", "sistema", { bozza: b.id, invio: invioId }, ora);
  }
  return true;
}

/** Fallimento certo (nulla è partito): l'invio diventa `fallito` e la bozza torna modificabile. */
async function segnaFallito(ctx: ContestoUtente, invioId: string, daStati: StatoInvio[], codice: string, ora: Date): Promise<boolean> {
  const aggiornato = await bozze.transizioneInvio(ctx, invioId, "fallito", daStati, { errore: codice }, ora);
  if (!aggiornato) return false;
  const b = await bozze.leggi(ctx, aggiornato.bozzaId);
  if (b && (await bozze.cambiaStato(ctx, b.id, "modificabile", ["in_invio"], ora))) {
    await evento(ctx, b, "invio_fallito", "sistema", { bozza: b.id, invio: invioId }, ora);
  }
  return true;
}

/**
 * Job `invia_email` (max_attempts = 1): prende in carico l'invio confermato con un CAS, verifica di
 * nuovo la busta salvata e chiama `ConnettorePosta.invia` una sola volta, fuori da ogni transazione.
 * Un timeout lascia `in_invio`: lo sweeper lo porta a esito incerto. Mai nuovi tentativi automatici.
 */
export async function inviaEmail(dip: Dipendenze, utenteId: string, invioId: string): Promise<EsitoInvioEmail> {
  const ora = dip.orologio.ora();
  const presa = await dip.unita.perUtente(utenteId, async (ctx) => {
    const invio = await bozze.leggiInvio(ctx, invioId);
    if (!invio || invio.stato !== "confermato") return null;
    const b = await bozze.leggi(ctx, invio.bozzaId);
    if (!b) return null;
    const statoCasella = await caselle.bloccaStato(ctx, b.casellaId);
    const casella = await caselle.leggi(ctx, b.casellaId);
    const fallisci = async (codice: string) => ((await segnaFallito(ctx, invio.id, ["confermato"], codice, ora)) ? ("fallito" as const) : null);
    if (!casellaPronta(casella, statoCasella)) return fallisci("casella_non_pronta");
    const versione = await bozze.versione(ctx, b.id, invio.versione);
    if (!versione) return fallisci("versione_mancante");
    const hash = await bozze.hashBusta(ctx, versione.busta);
    if (hash !== invio.hashBusta || hash !== versione.hashBusta) return fallisci("busta_modificata");
    const messageId = messageIdPerInvio(invio.id, casella.indirizzo);
    if (!messageId) return fallisci("casella_non_pronta");
    const preso = await bozze.transizioneInvio(
      ctx,
      invio.id,
      "in_invio",
      ["confermato"],
      {
        inizioInvio: ora,
        messageIdIndice: await ctx.codec.indice("message_id", messageId),
        impronta: await improntaBusta(ctx, versione.busta),
        threadConnettore: versione.busta.thread,
      },
      ora,
    );
    if (!preso) return null;
    const messaggio: MessaggioInUscita = {
      messageId,
      da: { indirizzo: casella.indirizzo },
      a: versione.busta.a,
      cc: versione.busta.cc,
      bcc: versione.busta.bcc,
      oggetto: versione.busta.oggetto,
      corpo: versione.busta.corpo,
      inReplyTo: versione.busta.inReplyTo,
      references: versione.busta.references,
      threadConnettore: versione.busta.thread,
    };
    return { casellaId: b.casellaId, messaggio };
  });
  if (presa === null) return "non_necessario";
  if (presa === "fallito") return "fallito";

  let connettore: ConnettorePosta;
  try {
    connettore = await dip.connettori.per(presa.casellaId);
  } catch (e) {
    // Nulla è partito: il connettore non è nemmeno stato ottenuto.
    const codice = e instanceof ErroreConnettore ? e.codice : "connettore_non_disponibile";
    await dip.unita.perUtente(utenteId, (ctx) => segnaFallito(ctx, invioId, ["in_invio", "esito_incerto"], codice, dip.orologio.ora()));
    return "fallito";
  }

  let esito: EsitoInvioConnettore;
  try {
    esito = await connettore.invia(presa.messaggio);
  } catch (e) {
    if (e instanceof ErroreConnettore && e.codice !== "timeout_invio") {
      await dip.unita.perUtente(utenteId, (ctx) => segnaFallito(ctx, invioId, ["in_invio", "esito_incerto"], e.codice, dip.orologio.ora()));
      return "fallito";
    }
    // Esito ignoto (timeout o errore inatteso): resta `in_invio`, lo sweeper e la verifica decidono.
    return "esito_sconosciuto";
  }

  try {
    await dip.unita.perUtente(utenteId, async (ctx) => {
      const effettivo = esito.messageId && esito.messageId !== presa.messaggio.messageId ? await ctx.codec.indice("message_id", esito.messageId) : undefined;
      await segnaInviato(
        ctx,
        invioId,
        { idConnettore: esito.idConnettore, threadConnettore: esito.threadConnettore, ...(effettivo ? { messageIdIndice: effettivo } : {}) },
        dip.orologio.ora(),
      );
    });
  } catch {
    // L'email è partita ma lo stato non è stato salvato: la verifica la ritroverà nella posta inviata.
    return "esito_sconosciuto";
  }
  return "inviato";
}

/**
 * Sweeper (cron): `confermato` mai preso in carico diventa `fallito` ("non inviato") e sblocca la bozza;
 * `in_invio` oltre il timeout diventa `esito_incerto` e avvia la verifica. Transizioni condizionali:
 * un `inviato` tardivo vince sempre. Ogni voce ha la propria transazione e un suo errore non ferma le
 * altre: la voce resta com'era e viene ripresa al giro successivo (il conteggio degli errori è nel
 * risultato, senza dettagli).
 */
export async function sweeperInvii(dip: Dipendenze): Promise<{ nonInviati: number; incerti: number; errori: number }> {
  const ora = dip.orologio.ora();
  const voci = await dip.unita.sistema((ctx) =>
    bozze.daSpazzare(ctx.tx, {
      confermatoPrimaDi: new Date(ora.getTime() - SOGLIA_CONFERMATO_MS),
      inInvioPrimaDi: new Date(ora.getTime() - SOGLIA_IN_INVIO_MS),
    }),
  );
  let nonInviati = 0;
  let incerti = 0;
  let errori = 0;
  for (const v of voci) {
    try {
      const esito = await dip.unita.perUtente(v.utenteId, async (ctx): Promise<"non_inviato" | "incerto" | null> => {
        if (v.stato === "confermato") {
          return (await segnaFallito(ctx, v.id, ["confermato"], "non_inviato", ora)) ? "non_inviato" : null;
        }
        const incerto = await bozze.transizioneInvio(ctx, v.id, "esito_incerto", ["in_invio"], {}, ora);
        if (!incerto) return null;
        await ctx.coda.accoda("verifica_invio", { utenteId: v.utenteId, invioId: v.id }, { chiave: `verifica:${v.id}` });
        const b = await bozze.leggi(ctx, incerto.bozzaId);
        if (b) await evento(ctx, b, "invio_esito_incerto", "sistema", { bozza: b.id, invio: v.id }, ora);
        return "incerto";
      });
      if (esito === "non_inviato") nonInviati++;
      if (esito === "incerto") incerti++;
    } catch {
      errori++;
    }
  }
  return { nonInviati, incerti, errori };
}

/**
 * Job `verifica_invio`: cerca la copia inviata nella posta sincronizzata della casella (Message-ID
 * generato, poi thread + impronta), poi presso il connettore. Senza risultato riprova con attese
 * crescenti per circa 15 minuti; poi l'esito resta incerto e decide l'utente.
 */
export async function verificaInvio(dip: Dipendenze, utenteId: string, invioId: string): Promise<EsitoVerificaInvio> {
  const ora = dip.orologio.ora();
  const locale = await dip.unita.perUtente(utenteId, async (ctx) => {
    const invio = await bozze.leggiInvio(ctx, invioId);
    if (!invio || invio.stato !== "esito_incerto") return null;
    const b = await bozze.leggi(ctx, invio.bozzaId);
    const casella = b ? await caselle.leggi(ctx, b.casellaId) : null;
    if (!b || !casella) return null;
    const trovata = await copiaInviataLocale(ctx, b.casellaId, invio);
    if (trovata) {
      await posta.impostaOrigineInvio(ctx, trovata.copiaId, "app");
      await segnaInviato(ctx, invio.id, { idConnettore: trovata.idConnettore, threadConnettore: trovata.thread }, ora);
      return { tipo: "trovato" as const };
    }
    return { tipo: "cerca" as const, invio, casellaId: b.casellaId, messageId: messageIdPerInvio(invio.id, casella.indirizzo) };
  });
  if (!locale) return "non_necessaria";
  if (locale.tipo === "trovato") return "inviato";

  const inizio = locale.invio.inizioInvio ?? locale.invio.confermatoIl;
  const fine = fineVerifica(locale.invio).getTime();
  let trovati: string[] = [];
  if (locale.messageId) {
    try {
      const connettore = await dip.connettori.per(locale.casellaId);
      trovati = await connettore.cercaInviati({ messageId: locale.messageId, dopo: new Date(inizio.getTime() - MINUTO_MS) });
    } catch {
      trovati = [];
    }
  }
  const [trovato] = trovati;
  if (trovato) {
    await dip.unita.perUtente(utenteId, (ctx) =>
      segnaInviato(ctx, invioId, { idConnettore: trovato, threadConnettore: locale.invio.threadConnettore }, dip.orologio.ora()),
    );
    return "inviato";
  }

  const inizioVerifica = fine - DURATA_VERIFICA_MS;
  if (ora.getTime() >= fine) return "non_trovato";
  const attesa = Math.min(Math.max(MINUTO_MS, ora.getTime() - inizioVerifica), fine - ora.getTime());
  await dip.unita.perUtente(utenteId, (ctx) =>
    ctx.coda.accoda("verifica_invio", { utenteId, invioId }, { chiave: `verifica:${invioId}`, esegui: new Date(ora.getTime() + attesa) }),
  );
  return "in_verifica";
}

async function copiaInviataLocale(ctx: ContestoUtente, casellaId: string, invio: Invio) {
  if (invio.messageIdIndice) {
    const [perMessageId] = await bozze.copieInviate(ctx, casellaId, { messageIdIndice: invio.messageIdIndice });
    if (perMessageId) return perMessageId;
  }
  if (invio.impronta && invio.threadConnettore && invio.inizioInvio) {
    // Solo copie non precedenti all'invio: una risposta identica scritta prima a mano non conta.
    const dal = invio.inizioInvio.getTime() - TOLLERANZA_IMPRONTA_MS;
    for (const copia of await bozze.copieInviate(ctx, casellaId, { thread: invio.threadConnettore })) {
      const email = await posta.leggi(ctx, copia.emailId);
      if (email && email.ricevutaIl.getTime() >= dal && (await improntaEmail(ctx, email)) === invio.impronta) return copia;
    }
  }
  return null;
}

/**
 * Decisione dell'utente su un esito incerto, possibile solo al termine della verifica automatica (§12:
 * prima la copia può ancora comparire, e un "non inviato" prematuro aprirebbe la strada a un duplicato).
 * "Non è stato inviato" annulla l'invio e sblocca la bozza; "Invia di nuovo" fa lo stesso e chiede una
 * nuova conferma esplicita, con l'avviso di possibile duplicato. Mai un nuovo invio automatico.
 */
export async function decidiEsitoIncerto(
  dip: Pick<Dipendenze, "orologio">,
  ctx: ContestoUtente,
  invioId: string,
  decisione: "non_inviato" | "reinvia",
): Promise<EsitoDecisioneInvio> {
  const ora = dip.orologio.ora();
  if (!idValido(invioId) || (decisione !== "non_inviato" && decisione !== "reinvia")) return { esito: "non_trovato" };
  const attuale = await bozze.leggiInvio(ctx, invioId);
  if (!attuale) return { esito: "non_trovato" };
  if (attuale.stato !== "esito_incerto") return { esito: "non_incerto", stato: attuale.stato };
  const decisioneDal = fineVerifica(attuale);
  if (ora.getTime() < decisioneDal.getTime()) return { esito: "in_verifica", decisioneDal };
  const codice = decisione === "non_inviato" ? "utente_non_inviato" : "utente_reinvia";
  const annullato = await bozze.transizioneInvio(ctx, invioId, "annullato", ["esito_incerto"], { errore: codice }, ora);
  if (!annullato) {
    const invio = await bozze.leggiInvio(ctx, invioId);
    return invio ? { esito: "non_incerto", stato: invio.stato } : { esito: "non_trovato" };
  }
  const b = await bozze.leggi(ctx, annullato.bozzaId);
  if (b) {
    await bozze.cambiaStato(ctx, b.id, "modificabile", ["in_invio"], ora);
    await evento(ctx, b, decisione === "non_inviato" ? "invio_segnato_non_inviato" : "invio_da_ripetere", "utente", { bozza: b.id, invio: invioId }, ora);
  }
  return { esito: "annullato", bozzaId: annullato.bozzaId, nuovaConfermaRichiesta: decisione === "reinvia" };
}

/**
 * Hook del riconciliatore per un'email in uscita: se corrisponde a un invio dell'app nella stessa
 * casella (id del connettore, Message-ID generato, oppure thread + impronta) segna la copia come
 * inviata dall'app, chiude un eventuale esito incerto e indica la Situazione per il collegamento
 * deterministico `invio_app`.
 */
export async function abbinaInvioPerEmail(ctx: ContestoUtente, emailId: string, ora: Date): Promise<AbbinamentoInvio | null> {
  const email = await posta.leggi(ctx, emailId);
  if (!email || email.direzione === "entrata") return null;
  const messageIdIndice = email.messageId ? await ctx.codec.indice("message_id", email.messageId) : null;
  const impronta = await improntaEmail(ctx, email);
  for (const copia of await posta.copieDellEmail(ctx, emailId)) {
    const abbinato = await bozze.invioPerCopia(ctx, {
      casellaId: copia.casellaId,
      idConnettore: copia.idConnettore,
      messageIdIndice,
      thread: copia.threadConnettore,
      impronta,
      ricevutaIl: email.ricevutaIl,
    });
    if (!abbinato) continue;
    if (copia.origineInvio !== "app") await posta.impostaOrigineInvio(ctx, copia.id, "app");
    if (abbinato.invio.stato !== "inviato") {
      await segnaInviato(ctx, abbinato.invio.id, { idConnettore: copia.idConnettore, threadConnettore: copia.threadConnettore }, ora);
    }
    return { situazioneId: abbinato.situazioneId, ruolo: abbinato.tipo === "sollecito" ? "sollecito" : "risposta", bozzaId: abbinato.bozzaId, invioId: abbinato.invio.id };
  }
  return null;
}
