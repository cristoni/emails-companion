import { verificaEvidenze, type OutputClassificazione } from "@ec/ai";
import { inFinestraNews, valoreEffettivo, type Categoria, type Email, type FunzioneAI } from "@ec/core/dominio";
import { impostazioni, operativo, posta, type ContestoUtente } from "@ec/db";
import type { Dipendenze } from "../dipendenze";
import { verificaFineImportazione } from "../posta/importazione";
import { programmaRiepilogoNews } from "../news/riepilogo";
import { invocaFunzione } from "./invocazione";
import { emailPerModello } from "./per-modello";

/** Funzioni eseguite per singola email, nell'ordine; `attese_risposte` gira nel riconciliatore. */
const ORDINE: FunzioneAI[] = ["classificazione_priorita", "estrazione_attivita"];
const MASSIMO_CONTESTO = 3;

export function opzioniRiconciliazione(utenteId: string) {
  return { chiave: `riconcilia:${utenteId}`, coda: `utente:${utenteId}`, modalitaChiave: "preserve_run_at" as const };
}

/**
 * Analisi di un'email, una funzione alla volta. Quando nessuna funzione resta da eseguire
 * l'email diventa pronta per il riconciliatore.
 */
export async function analizzaEmail(dip: Dipendenze, utenteId: string, emailId: string, richiestaRianalisiId: string | null = null): Promise<void> {
  for (let passo = 0; passo < ORDINE.length + 1; passo++) {
    const stato = await dip.unita.perUtente(utenteId, async (ctx) => ({
      email: await posta.leggi(ctx, emailId),
      stati: await posta.statiFunzione(ctx, emailId),
      fuso: (await impostazioni.preferenze(ctx)).fusoOrario,
    }));
    if (!stato.email) return;
    const funzione = ORDINE.find((f) => stato.stati[f]?.stato === "da_eseguire");
    if (!funzione) {
      await dip.unita.perUtente(utenteId, (ctx) => concludi(dip, ctx, stato.email as Email, stato.stati));
      return;
    }
    const esito = await (funzione === "classificazione_priorita"
      ? classifica(dip, utenteId, stato.email, stato.fuso, richiestaRianalisiId)
      : estrai(dip, utenteId, stato.email, stato.fuso, richiestaRianalisiId));
    if (esito === "fermati") return;
  }
}

async function concludi(dip: Dipendenze, ctx: ContestoUtente, email: Email, stati: Awaited<ReturnType<typeof posta.statiFunzione>>) {
  if (Object.values(stati).some((s) => s?.stato === "in_pausa" || s?.stato === "da_eseguire")) return;
  await posta.segnaPronta(ctx, email.id);
  await ctx.coda.accoda("riconcilia_utente", { utenteId: ctx.utenteId }, opzioniRiconciliazione(ctx.utenteId));
  for (const copia of await posta.copieDellEmail(ctx, email.id)) await verificaFineImportazione(dip, ctx, copia.casellaId);
}

type Passo = "continua" | "fermati";

async function segnaEsito(
  dip: Dipendenze,
  utenteId: string,
  emailId: string,
  funzione: FunzioneAI,
  esito: { tipo: "in_pausa"; motivo: string } | { tipo: "riprova"; dopoMs: number } | { tipo: "errore"; codice: string },
): Promise<Passo> {
  const ora = dip.orologio.ora();
  return dip.unita.perUtente(utenteId, async (ctx) => {
    if (esito.tipo === "in_pausa") {
      await posta.impostaStatoFunzione(ctx, emailId, funzione, "in_pausa", ora, esito.motivo);
      return "fermati";
    }
    if (esito.tipo === "riprova") {
      await ctx.coda.accoda("analizza_email", { utenteId, emailId }, { chiave: `analisi:${emailId}`, esegui: new Date(ora.getTime() + esito.dopoMs) });
      return "fermati";
    }
    await posta.impostaStatoFunzione(ctx, emailId, funzione, "errore", ora, esito.codice);
    if (funzione === "classificazione_priorita") {
      await posta.impostaStatoFunzione(ctx, emailId, "estrazione_attivita", "da_eseguire", ora);
    }
    return "continua";
  });
}

async function classifica(dip: Dipendenze, utenteId: string, email: Email, fuso: string, rianalisi: string | null): Promise<Passo> {
  const esito = await invocaFunzione(dip, utenteId, {
    funzione: "classificazione_priorita",
    emailId: email.id,
    dati: { email: emailPerModello(email, "e1", fuso) },
    tabella: { email: { e1: email.id } },
    linguaOutput: email.lingua,
    richiestaRianalisiId: rianalisi,
  });
  if (esito.tipo !== "ok") return segnaEsito(dip, utenteId, email.id, "classificazione_priorita", esito);
  const output: OutputClassificazione = esito.output;
  const evidenze = verificaEvidenze(output.evidenze, { [email.id]: email.testo });
  const ora = dip.orologio.ora();
  await dip.unita.perUtente(utenteId, async (ctx) => {
    const precedente = await posta.leggiClassificazione(ctx, email.id);
    const eraNews = precedente !== null && (await categoriaEffettiva(ctx, email.id, precedente.categoria)) === "news";
    await posta.salvaClassificazione(
      ctx,
      {
        emailId: email.id,
        categoria: output.categoria,
        urgente: output.urgente,
        priorita: output.priorita,
        motivazione: output.motivazione,
        titoloSituazione: output.titolo_situazione,
        descrizioneSituazione: output.descrizione_situazione,
        evidenze,
        analisiId: esito.analisiId,
      },
      output.base_urgenza === "rilevato" && evidenze.some((e) => e.verificata) ? "rilevato" : "dedotto",
      ora,
    );
    await posta.impostaStatoFunzione(ctx, email.id, "classificazione_priorita", "eseguita", ora, null, esito.analisiId);
    const categoria = await categoriaEffettiva(ctx, email.id, output.categoria);
    await posta.impostaStatoFunzione(ctx, email.id, "estrazione_attivita", categoria === "news" ? "non_necessaria" : "da_eseguire", ora);
    if (email.direzione === "entrata" && !email.soloPerRisposte && (categoria === "news" || eraNews) && inFinestraNews(email.ricevutaIl, ora)) {
      await programmaRiepilogoNews(dip, ctx);
    }
  });
  return "continua";
}

export async function categoriaEffettiva(ctx: ContestoUtente, emailId: string, categoriaAI: Categoria): Promise<Categoria> {
  const correzioni = await operativo.correzioniPer(ctx, [{ tipo: "email", id: emailId }]);
  return valoreEffettivo(categoriaAI, correzioni, { tipo: "email", id: emailId }, "categoria").valore;
}

async function estrai(dip: Dipendenze, utenteId: string, email: Email, fuso: string, rianalisi: string | null): Promise<Passo> {
  const contesto = await dip.unita.perUtente(utenteId, async (ctx) => {
    const riferite = await posta.idPerMessageId(ctx, [...email.references, ...(email.inReplyTo ? [email.inReplyTo] : [])]);
    const precedenti = (await posta.leggiMolte(ctx, riferite.filter((id) => id !== email.id)))
      .sort((a, b) => b.ricevutaIl.getTime() - a.ricevutaIl.getTime())
      .slice(0, MASSIMO_CONTESTO);
    const esistenti = (await operativo.attivitaDellEmail(ctx, email.id)).filter((a) => a.stato !== "superata");
    return { precedenti, esistenti };
  });
  const aliasEmail: Record<string, string> = { e1: email.id };
  contesto.precedenti.forEach((e, i) => (aliasEmail[`e${i + 2}`] = e.id));
  const aliasElementi: Record<string, string> = {};
  contesto.esistenti.forEach((a, i) => (aliasElementi[`t${i + 1}`] = a.id));
  const esito = await invocaFunzione(dip, utenteId, {
    funzione: "estrazione_attivita",
    emailId: email.id,
    dati: {
      email: emailPerModello(email, "e1", fuso),
      contesto: contesto.precedenti.map((e, i) => emailPerModello(e, `e${i + 2}`, fuso, { contesto: true })),
      elementi_esistenti: contesto.esistenti.map((a, i) => ({
        alias: `t${i + 1}`,
        descrizione: a.descrizione,
        scadenza_iso: a.scadenza ? a.scadenza.toISOString().slice(0, 10) : null,
        priorita: a.priorita,
        urgente: a.urgente,
      })),
    },
    tabella: { email: aliasEmail, elementiEsistenti: aliasElementi },
    linguaOutput: email.lingua,
    richiestaRianalisiId: rianalisi,
  });
  if (esito.tipo !== "ok") return segnaEsito(dip, utenteId, email.id, "estrazione_attivita", esito);
  await dip.unita.perUtente(utenteId, (ctx) =>
    posta.impostaStatoFunzione(ctx, email.id, "estrazione_attivita", "eseguita", dip.orologio.ora(), null, esito.analisiId),
  );
  return "continua";
}
