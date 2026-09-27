import { FUNZIONI_AI, type FunzioneAI, type MotivoPausa } from "@ec/core/dominio";
import { impostazioni, posta, type ContestoUtente, type Preferenze } from "@ec/db";
import { MINUTO_MS, type Dipendenze } from "../dipendenze";
import { opzioniRiconciliazione } from "../analisi/analizza-email";
import { programmaRiepilogoNews } from "../news/riepilogo";
import { riprendiRianalisi } from "../rianalisi/rianalizza";

export type EsitoChiave = "valida" | "non_valida" | "credito_esaurito" | "errore_temporaneo" | "formato_non_valido";

/**
 * Verifica e salva la chiave OpenRouter (§6.5). Il valore in chiaro esiste solo durante la verifica
 * e non viene mai restituito.
 */
export async function salvaChiaveOpenRouter(dip: Dipendenze, ctx: ContestoUtente, chiave: string): Promise<EsitoChiave> {
  const pulita = chiave.trim();
  if (!/^sk-or-[A-Za-z0-9_-]{16,}$/.test(pulita)) return "formato_non_valido";
  const verifica = await dip.modelli.verificaChiave(pulita);
  if (verifica.stato === "errore_temporaneo") return "errore_temporaneo";
  const ora = dip.orologio.ora();
  await impostazioni.salvaChiave(
    ctx,
    pulita,
    verifica.stato,
    verifica.stato === "valida" ? { etichetta: verifica.etichetta, limiteResiduo: verifica.limiteResiduo } : { etichetta: null, limiteResiduo: null },
    ora,
  );
  if (verifica.stato === "valida") await riprendiAnalisi(dip, ctx, ["chiave_mancante", "chiave_non_valida", "credito_esaurito"]);
  return verifica.stato;
}

export async function rimuoviChiaveOpenRouter(ctx: ContestoUtente): Promise<void> {
  await impostazioni.rimuoviChiave(ctx);
}

/** Prova periodica dopo credito esaurito: riprende l'analisi appena la chiave torna utilizzabile. */
export async function verificaChiavePeriodica(dip: Dipendenze, utenteId: string): Promise<void> {
  const chiave = await dip.unita.perUtente(utenteId, (ctx) => impostazioni.chiaveInChiaro(ctx));
  if (!chiave) return;
  const verifica = await dip.modelli.verificaChiave(chiave);
  const ora = dip.orologio.ora();
  await dip.unita.perUtente(utenteId, async (ctx) => {
    if (verifica.stato === "valida" && (verifica.limiteResiduo === null || verifica.limiteResiduo > 0)) {
      await impostazioni.aggiornaStatoChiave(ctx, "valida", ora, verifica.limiteResiduo);
      await riprendiAnalisi(dip, ctx, ["credito_esaurito"]);
      return;
    }
    if (verifica.stato === "non_valida") {
      await impostazioni.aggiornaStatoChiave(ctx, "non_valida", ora);
      return;
    }
    const prossima = new Date(ora.getTime() + 30 * MINUTO_MS);
    await ctx.coda.accoda("verifica_chiave", { utenteId }, { chiave: `verifica_chiave:${utenteId}`, esegui: prossima, modalitaChiave: "replace" });
  });
}

export type EsitoModello = "ok" | "incompatibile" | "non_disponibile";

/** Imposta il modello di una Funzione AI solo se compatibile (output strutturato ed endpoint ZDR). */
export async function impostaModello(dip: Dipendenze, ctx: ContestoUtente, funzione: FunzioneAI, modello: string): Promise<EsitoModello> {
  const nome = modello.trim();
  if (!/^[a-z0-9._~-]+\/[A-Za-z0-9._:~-]+$/.test(nome)) return "non_disponibile";
  const compatibilita = await dip.modelli.verificaModello(nome);
  if (compatibilita !== "ok") return compatibilita;
  await impostazioni.impostaModello(ctx, funzione, nome, "ok", dip.orologio.ora());
  await impostazioni.chiudiPause(ctx, ["modello_incompatibile", "modello_non_disponibile"], funzione);
  await riprendiAnalisi(dip, ctx, ["modello_incompatibile", "modello_non_disponibile"], funzione);
  return "ok";
}

/** Verifica periodica dei modelli segnati come incompatibili o non disponibili. */
export async function verificaModelliPeriodica(dip: Dipendenze, utenteId: string, funzione?: FunzioneAI): Promise<void> {
  const modelli = await dip.unita.perUtente(utenteId, (ctx) => impostazioni.modelli(ctx));
  for (const f of funzione ? [funzione] : FUNZIONI_AI) {
    const voce = modelli[f];
    if (voce.stato === "ok") continue;
    const compatibilita = await dip.modelli.verificaModello(voce.modello);
    await dip.unita.perUtente(utenteId, async (ctx) => {
      await impostazioni.impostaModello(ctx, f, voce.modello, compatibilita, dip.orologio.ora());
      if (compatibilita === "ok") {
        await impostazioni.chiudiPause(ctx, ["modello_incompatibile", "modello_non_disponibile"], f);
        await riprendiAnalisi(dip, ctx, ["modello_incompatibile", "modello_non_disponibile"], f);
      }
    });
  }
}

export async function salvaContestoAi(dip: Dipendenze, ctx: ContestoUtente, testo: string): Promise<number> {
  return impostazioni.salvaContesto(ctx, dip.ids.nuovo(), testo.trim(), dip.orologio.ora());
}

export async function accettaInformativa(dip: Dipendenze, ctx: ContestoUtente): Promise<void> {
  await impostazioni.accettaInformativa(ctx, dip.configurazione.versioneInformativa, dip.ids.nuovo(), dip.orologio.ora());
  await riprendiAnalisi(dip, ctx, ["consenso_mancante"]);
}

export async function aggiornaPreferenze(dip: Dipendenze, ctx: ContestoUtente, modifiche: Partial<Preferenze>): Promise<void> {
  const prima = await impostazioni.preferenze(ctx);
  await impostazioni.aggiornaPreferenze(ctx, modifiche, dip.orologio.ora());
  if (prima.pausaManuale && modifiche.pausaManuale === false) await riprendiAnalisi(dip, ctx, ["pausa_manuale"]);
  if (modifiche.lingua !== undefined && modifiche.lingua !== prima.lingua) await programmaRiepilogoNews(dip, ctx);
}

/**
 * Ripresa dopo la risoluzione di una causa di pausa: chiude le pause e rimette in esecuzione le
 * funzioni sospese per quei motivi (§9.4).
 */
export async function riprendiAnalisi(dip: Dipendenze, ctx: ContestoUtente, motivi: MotivoPausa[], funzione?: FunzioneAI): Promise<number> {
  await impostazioni.chiudiPause(ctx, motivi, funzione);
  const ora = dip.orologio.ora();
  const funzioni = funzione ? [funzione] : [...FUNZIONI_AI];
  const sospese = await posta.emailConFunzioniInStato(ctx, "in_pausa", funzioni);
  let riprese = 0;
  for (const emailId of sospese) {
    const stati = await posta.statiFunzione(ctx, emailId);
    for (const f of funzioni) {
      const s = stati[f];
      if (s?.stato !== "in_pausa" || (s.motivo && !motivi.includes(s.motivo as MotivoPausa))) continue;
      if (f === "attese_risposte") {
        await posta.impostaStatoFunzione(ctx, emailId, f, "da_eseguire", ora);
        await posta.segnaPronta(ctx, emailId);
        await ctx.coda.accoda("riconcilia_utente", { utenteId: ctx.utenteId }, opzioniRiconciliazione(ctx.utenteId));
      } else {
        await posta.impostaStatoFunzione(ctx, emailId, f, "da_eseguire", ora);
        await ctx.coda.accoda("analizza_email", { utenteId: ctx.utenteId, emailId }, { chiave: `analisi:${emailId}` });
      }
      riprese += 1;
    }
  }
  if (!funzione || funzione === "riepilogo_news") await programmaRiepilogoNews(dip, ctx);
  if (!funzione || funzione === "classificazione_priorita" || funzione === "estrazione_attivita") await riprendiRianalisi(ctx);
  return riprese;
}
