import { stimaCosto } from "@ec/ai";
import {
  derivaStatoAttesa,
  derivaVistaSituazione,
  valoreEffettivo,
  type Categoria,
  type Direzione,
  type FunzioneAI,
  type StatoCollegamento,
} from "@ec/core/dominio";
import { analisi, impostazioni, operativo, posta, type ContestoUtente } from "@ec/db";
import { analizzaEmail } from "../analisi/analizza-email";
import { GIORNO_MS, MINUTO_MS, type Dipendenze } from "../dipendenze";
import { programmaRiepilogoNews } from "../news/riepilogo";
import { prossimoTentativo } from "../ritentativi";
import { rianalisi, type AmbitoRianalisi, type StatoFunzioneRianalisi } from "./repository";

export type { AmbitoRianalisi } from "./repository";

/** Email rianalizzate per esecuzione del job; il resto prosegue in un job successivo. */
const EMAIL_PER_GIRO = 25;
export const MASSIMO_GIORNI_RIANALISI = 365;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function opzioniRianalisi(richiestaId: string, esegui?: Date) {
  return { chiave: `rianalisi:${richiestaId}`, modalitaChiave: "replace" as const, ...(esegui ? { esegui } : {}) };
}

/** Valida l'ambito ricevuto dal web e ne restituisce una copia con i soli campi previsti, da salvare. */
function normalizzaAmbito(ambito: AmbitoRianalisi): AmbitoRianalisi {
  if (ambito?.tipo === "aperti") return { tipo: "aperti" };
  if (ambito?.tipo === "email" && typeof ambito.emailId === "string" && UUID.test(ambito.emailId)) {
    return { tipo: "email", emailId: ambito.emailId.toLowerCase() };
  }
  if (ambito?.tipo === "giorni" && Number.isInteger(ambito.giorni) && ambito.giorni >= 1 && ambito.giorni <= MASSIMO_GIORNI_RIANALISI) {
    return { tipo: "giorni", giorni: ambito.giorni };
  }
  throw new Error("ambito_non_valido");
}

interface Bersaglio {
  id: string;
  direzione: Direzione;
  /** Funzioni che la rianalisi rieseguirà, per la stima. */
  funzioni: FunzioneAI[];
}

/** Come in `analizzaEmail`: le email in entrata sono classificate e, se non News, estratte; le altre solo estratte. */
function funzioniDaRieseguire(direzione: Direzione, categoria: Categoria | null): FunzioneAI[] {
  if (direzione !== "entrata") return ["estrazione_attivita"];
  return categoria === "news" ? ["classificazione_priorita"] : ["classificazione_priorita", "estrazione_attivita"];
}

/**
 * Email delle Situazioni con elementi aperti (Attività da fare o Attese aperte/parziali): origine e
 * collegamenti non rifiutati. Le Situazioni archiviate non hanno aree e restano escluse.
 */
async function emailDegliElementiAperti(ctx: ContestoUtente, ora: Date): Promise<string[]> {
  const aggregati = await operativo.aggregati(ctx, await operativo.idSituazioniVisibili(ctx));
  const ids = new Set<string>();
  for (const a of aggregati) {
    const attese = a.attese.map(({ attesa, requisiti }) => ({
      attesa,
      stato: derivaStatoAttesa({ attesa, requisiti, risposte: a.risposte, correzioni: a.correzioni }).stato,
    }));
    const vista = derivaVistaSituazione({
      situazione: a.situazione,
      attivita: a.attivita,
      attese,
      risposte: a.risposte,
      segnaliUrgenza: [],
      correzioni: a.correzioni,
      ora,
    });
    if (!vista.aree.includes("da_fare") && !vista.aree.includes("in_attesa")) continue;
    ids.add(a.situazione.emailOrigineId);
    for (const l of a.collegamenti) {
      const stato = valoreEffettivo<StatoCollegamento>(l.stato, a.correzioni, { tipo: "collegamento", id: l.id }, "stato").valore;
      if (stato !== "rifiutato") ids.add(l.emailId);
    }
  }
  return [...ids];
}

/** Email dell'ambito, calcolate rispetto all'istante della richiesta (la stima e l'esecuzione vedono la stessa finestra). */
async function bersagli(ctx: ContestoUtente, ambito: AmbitoRianalisi, riferimento: Date): Promise<Bersaglio[]> {
  const trovate =
    ambito.tipo === "email"
      ? await rianalisi.rianalizzabili(ctx, { ids: [ambito.emailId] })
      : ambito.tipo === "giorni"
        ? await rianalisi.rianalizzabili(ctx, { dal: new Date(riferimento.getTime() - ambito.giorni * GIORNO_MS), al: riferimento })
        : await rianalisi.rianalizzabili(ctx, { ids: await emailDegliElementiAperti(ctx, riferimento) });
  const correzioni = await operativo.correzioniPer(
    ctx,
    trovate.map((e) => ({ tipo: "email" as const, id: e.id })),
  );
  return trovate.map((e) => ({
    id: e.id,
    direzione: e.direzione,
    funzioni: funzioniDaRieseguire(
      e.direzione,
      valoreEffettivo<Categoria | null>(e.categoriaAI, correzioni, { tipo: "email", id: e.id }, "categoria").valore,
    ),
  }));
}

export interface StimaRianalisi {
  richiestaId: string;
  numeroEmail: number;
  /** Somma delle sole funzioni con prezzo noto. */
  costoStimato: number;
  prezziMancanti: FunzioneAI[];
  /** Numero di invocazioni previste per Funzione AI. */
  perFunzione: Partial<Record<FunzioneAI, number>>;
}

/**
 * Prima di "Rianalizza" (§10.7): conta le email dell'ambito e stima il costo con i prezzi dei modelli
 * configurati per ogni funzione. Registra la richiesta in stato `stimata`; nessun modello viene chiamato.
 */
export async function stimaRianalisi(dip: Dipendenze, ctx: ContestoUtente, ambitoRicevuto: AmbitoRianalisi): Promise<StimaRianalisi> {
  const ambito = normalizzaAmbito(ambitoRicevuto);
  const ora = dip.orologio.ora();
  const elenco = await bersagli(ctx, ambito, ora);
  const perFunzione = new Map<FunzioneAI, number>();
  for (const b of elenco) for (const f of b.funzioni) perFunzione.set(f, (perFunzione.get(f) ?? 0) + 1);
  const modelli = await impostazioni.modelli(ctx);
  let costoStimato = 0;
  const prezziMancanti: FunzioneAI[] = [];
  for (const [funzione, numeroEmail] of perFunzione) {
    const prezzi = await dip.modelli.prezzi(modelli[funzione].modello);
    const stima = stimaCosto({ numeroEmail, funzioni: [funzione], prezzi: prezzi ? { [funzione]: prezzi } : {} });
    costoStimato += stima.costoStimato;
    prezziMancanti.push(...stima.prezziMancanti);
  }
  const richiestaId = dip.ids.nuovo();
  await rianalisi.crea(ctx, {
    id: richiestaId,
    ambito,
    stima: { numeroEmail: elenco.length, costoStimato },
    stato: "stimata",
    creataIl: ora,
  });
  return { richiestaId, numeroEmail: elenco.length, costoStimato, prezziMancanti, perFunzione: Object.fromEntries(perFunzione) };
}

/** Conferma esplicita dell'utente dopo aver visto la stima: avvia il job `rianalizza`. */
export async function confermaRianalisi(dip: Dipendenze, ctx: ContestoUtente, richiestaId: string): Promise<boolean> {
  void dip;
  if (typeof richiestaId !== "string" || !UUID.test(richiestaId)) return false;
  const confermata = await rianalisi.cambiaStato(ctx, richiestaId, "confermata", ["stimata"]);
  if (confermata) await ctx.coda.accoda("rianalizza", { utenteId: ctx.utenteId, richiestaId }, opzioniRianalisi(richiestaId));
  return confermata;
}

/**
 * Alla ripresa dell'analisi dopo una pausa: riaccoda le rianalisi rimaste `in_corso`. Va chiamata insieme a
 * `riprendiAnalisi`, che riaccoda `analizza_email` senza l'id della richiesta (riuserebbe l'output precedente).
 */
export async function riprendiRianalisi(ctx: ContestoUtente): Promise<number> {
  const inCorso = await rianalisi.inCorso(ctx);
  for (const richiestaId of inCorso) {
    await ctx.coda.accoda("rianalizza", { utenteId: ctx.utenteId, richiestaId }, opzioniRianalisi(richiestaId));
  }
  return inCorso.length;
}

type InvocazioneRichiesta = Awaited<ReturnType<typeof rianalisi.analisiDellaRichiesta>>[number];

/**
 * Un'email è rianalizzata quando nessuna funzione è da eseguire o in pausa e ogni funzione attesa (secondo la
 * categoria effettiva attuale) è eseguita con un'invocazione di questa richiesta — non un output riusato né lo
 * stato precedente ripristinato — oppure è finita in errore dopo un'invocazione fallita di questa richiesta.
 */
function rianalizzata(
  stati: readonly StatoFunzioneRianalisi[],
  invocazioni: readonly InvocazioneRichiesta[],
  funzioniAttese: readonly FunzioneAI[],
): boolean {
  if (stati.some((s) => s.stato === "da_eseguire" || s.stato === "in_pausa")) return false;
  return funzioniAttese.every((f) => {
    const s = stati.find((x) => x.funzione === f);
    if (!s) return false;
    if (s.stato === "eseguita") return invocazioni.some((a) => a.id === s.analisiId);
    return s.stato === "errore" && invocazioni.some((a) => a.funzione === f && a.stato === "fallita");
  });
}

export type EsitoRianalisi = "completata" | "continua" | "in_pausa" | "ignorata";

/** Almeno un minuto, poi esponenziale con i fallimenti. Il Retry-After del fornitore non arriva fin qui. */
function attesaRitentativo(ora: Date, fallite: number, seme: string): Date {
  const minimo = ora.getTime() + MINUTO_MS;
  return new Date(Math.max(minimo, prossimoTentativo(ora, fallite, null, seme).getTime()));
}

/**
 * Job `rianalizza`: riesegue le funzioni per email con l'id della richiesta nell'input (nuova invocazione
 * intenzionale, §9.5), poi rende superate le analisi precedenti. Il riconciliatore applica i nuovi output
 * senza toccare gli elementi corretti dall'utente. Idempotente: le email già rianalizzate vengono saltate.
 */
export async function rianalizza(dip: Dipendenze, utenteId: string, richiestaId: string): Promise<EsitoRianalisi> {
  const daFare = await dip.unita.perUtente(utenteId, async (ctx) => {
    const richiesta = await rianalisi.leggi(ctx, richiestaId);
    if (!richiesta || (richiesta.stato !== "confermata" && richiesta.stato !== "in_corso")) return null;
    await rianalisi.cambiaStato(ctx, richiestaId, "in_corso", ["confermata"]);
    const elenco = await bersagli(ctx, richiesta.ambito, richiesta.creataIl);
    const ids = elenco.map((b) => b.id);
    const stati = await rianalisi.statiFunzioni(ctx, ids);
    const invocazioni = await rianalisi.analisiDellaRichiesta(ctx, richiestaId, ids);
    return elenco.filter(
      (b) =>
        !rianalizzata(
          stati.get(b.id) ?? [],
          invocazioni.filter((a) => a.emailId === b.id),
          b.funzioni,
        ),
    );
  });
  if (daFare === null) return "ignorata";

  const lotto = daFare.slice(0, EMAIL_PER_GIRO);
  let toccaNews = false;
  const concludi = async (esito: EsitoRianalisi, esegui?: Date): Promise<EsitoRianalisi> => {
    await dip.unita.perUtente(utenteId, async (ctx) => {
      // Una classificazione nuova può spostare email dentro o fuori dalle News.
      if (toccaNews) await programmaRiepilogoNews(dip, ctx);
      if (esito === "completata") await rianalisi.cambiaStato(ctx, richiestaId, "completata", ["in_corso"]);
      if (esito === "continua") await ctx.coda.accoda("rianalizza", { utenteId, richiestaId }, opzioniRianalisi(richiestaId, esegui));
    });
    return esito;
  };

  let senzaProgresso = 0;
  for (const b of lotto) {
    const prima = await dip.unita.perUtente(utenteId, async (ctx) => {
      const stati = (await rianalisi.statiFunzioni(ctx, [b.id])).get(b.id) ?? [];
      const funzione = b.direzione === "entrata" ? "classificazione_priorita" : "estrazione_attivita";
      await posta.impostaStatoFunzione(ctx, b.id, funzione, "da_eseguire", dip.orologio.ora());
      return stati;
    });
    await analizzaEmail(dip, utenteId, b.id, richiestaId);
    if (b.direzione === "entrata") toccaNews = true;
    const esito = await dip.unita.perUtente(utenteId, async (ctx) => {
      const stati = (await rianalisi.statiFunzioni(ctx, [b.id])).get(b.id) ?? [];
      const nuove = await rianalisi.analisiDellaRichiesta(ctx, richiestaId, [b.id]);
      for (const s of stati) {
        const nuova = nuove.find((n) => n.id === s.analisiId && n.stato === "completata");
        if (s.stato === "eseguita" && nuova) await analisi.supera(ctx, s.funzione, b.id, nuova.id);
      }
      const sospese = stati.filter((s) => s.stato === "in_pausa" || s.stato === "da_eseguire");
      if (sospese.length === 0) {
        // La categoria può essere cambiata con la nuova classificazione: le funzioni attese si ricalcolano.
        const [attuale] = await bersagli(ctx, { tipo: "email", emailId: b.id }, dip.orologio.ora());
        return { tipo: !attuale || rianalizzata(stati, nuove, attuale.funzioni) ? ("ok" as const) : ("bloccata" as const) };
      }
      // Le funzioni non concluse tornano allo stato precedente la rianalisi (con il suo motivo: codice d'errore o
      // causa della pausa): l'analisi già in vigore resta valida e né la ripresa generica né un ritentativo di
      // `analizza_email` (entrambi senza l'id della richiesta) la rieseguono con un output riusato. Solo questo
      // job riprende la rianalisi.
      for (const s of sospese) {
        const precedente = prima.find((p) => p.funzione === s.funzione);
        if (precedente) {
          await posta.impostaStatoFunzione(ctx, b.id, s.funzione, precedente.stato, dip.orologio.ora(), precedente.motivo, precedente.analisiId);
        }
      }
      if (sospese.some((s) => s.stato === "in_pausa")) return { tipo: "in_pausa" as const };
      // Backoff (§8) sul numero di invocazioni di questa richiesta fallite per questa email.
      return { tipo: "riprova" as const, fallite: nuove.filter((n) => n.stato === "fallita").length };
    });
    // In pausa la richiesta resta `in_corso`: alla ripresa dell'analisi `riprendiRianalisi` riaccoda il job.
    if (esito.tipo === "in_pausa") return concludi("in_pausa");
    if (esito.tipo === "riprova") return concludi("continua", attesaRitentativo(dip.orologio.ora(), esito.fallite, richiestaId));
    if (esito.tipo === "bloccata") senzaProgresso += 1;
  }
  // Un altro giro solo se restano email e questo giro ne ha concluse: ogni giro riduce l'insieme, quindi termina.
  return concludi(daFare.length > lotto.length && senzaProgresso < lotto.length ? "continua" : "completata");
}
