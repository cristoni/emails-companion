import {
  costruisciPrompt,
  jsonSchemaStrict,
  REGISTRO_FUNZIONI,
  risolviRiferimenti,
  validaOutput,
  type DatiFunzione,
  type OutputFunzione,
  type TabellaAlias,
} from "@ec/ai";
import { serializzazioneCanonica, type FunzioneAI, type MotivoPausa } from "@ec/core/dominio";
import { analisi, impostazioni, type ContestoUtente } from "@ec/db";
import { createHash } from "node:crypto";
import type { UtilizzoModello } from "@ec/core/porte";
import { MINUTO_MS, type Dipendenze } from "../dipendenze";
import { dataNelFuso } from "./per-modello";

export type EsitoInvocazione<F extends FunzioneAI> =
  | { tipo: "ok"; analisiId: string; output: OutputFunzione<F> }
  | { tipo: "in_pausa"; motivo: MotivoPausa; ambito: FunzioneAI | "*" }
  | { tipo: "riprova"; dopoMs: number }
  | { tipo: "errore"; codice: string };

export interface RichiestaInvocazione<F extends FunzioneAI> {
  funzione: F;
  emailId: string | null;
  dati: DatiFunzione<F>;
  tabella: TabellaAlias;
  linguaOutput: string;
  richiestaRianalisiId?: string | null;
}

const PAUSE_TOTALI: MotivoPausa[] = ["consenso_mancante", "chiave_mancante", "chiave_non_valida", "credito_esaurito", "pausa_manuale"];

/** Verifica le condizioni per chiamare un modello: consenso, pause, chiave, compatibilità del modello. */
async function condizioni(dip: Dipendenze, ctx: ContestoUtente, funzione: FunzioneAI) {
  const [preferenze, consenso, chiave, modelli, pause] = await Promise.all([
    impostazioni.preferenze(ctx),
    impostazioni.haConsenso(ctx, dip.configurazione.versioneInformativa),
    impostazioni.infoChiave(ctx),
    impostazioni.modelli(ctx),
    impostazioni.pauseAttive(ctx),
  ]);
  const blocco = (motivo: MotivoPausa, ambito: FunzioneAI | "*" = "*") => ({ tipo: "in_pausa" as const, motivo, ambito });
  if (!consenso) return blocco("consenso_mancante");
  if (preferenze.pausaManuale) return blocco("pausa_manuale");
  if (!chiave) return blocco("chiave_mancante");
  if (chiave.stato === "non_valida") return blocco("chiave_non_valida");
  if (chiave.stato === "credito_esaurito" || chiave.stato === "limitata") return blocco("credito_esaurito");
  const pausa = pause.find((p) => p.funzione === "*" || p.funzione === funzione);
  if (pausa) return blocco(pausa.motivo, pausa.funzione);
  const modello = modelli[funzione];
  if (modello.stato === "incompatibile") return blocco("modello_incompatibile", funzione);
  if (modello.stato === "non_disponibile") return blocco("modello_non_disponibile", funzione);
  return { tipo: "pronto" as const, preferenze, modello: modello.modello };
}

/**
 * Invoca una Funzione AI: claim idempotente sull'hash dell'input, chiamata fuori transazione,
 * errori tradotti in pause o ritentativi, output validato e con alias risolti.
 */
export async function invocaFunzione<F extends FunzioneAI>(dip: Dipendenze, utenteId: string, r: RichiestaInvocazione<F>): Promise<EsitoInvocazione<F>> {
  const def = REGISTRO_FUNZIONI[r.funzione];
  const fase1 = await dip.unita.perUtente(utenteId, async (ctx) => {
    const c = await condizioni(dip, ctx, r.funzione);
    if (c.tipo === "in_pausa") return c;
    const contesto = await impostazioni.contestoCorrente(ctx);
    const chiave = await impostazioni.chiaveInChiaro(ctx);
    if (!chiave) return { tipo: "in_pausa" as const, motivo: "chiave_mancante" as MotivoPausa, ambito: "*" as const };
    const hashInput = createHash("sha256")
      .update(
        serializzazioneCanonica({
          funzione: r.funzione,
          // Il risultato salvato contiene id già risolti: email e tabella degli alias entrano nell'hash, così
          // due email con gli stessi campi visibili al modello non condividono mai un'analisi.
          email: r.emailId,
          tabella: r.tabella,
          dati: r.dati,
          modello: c.modello,
          prompt: def.versionePrompt,
          schema: def.versioneSchema,
          contesto: contesto?.numero ?? 0,
          lingua: r.linguaOutput,
          rianalisi: r.richiestaRianalisiId ?? null,
        }),
      )
      .digest("hex");
    const claim = await analisi.rivendica(ctx, {
      id: dip.ids.nuovo(),
      funzione: r.funzione,
      hashInput,
      modello: c.modello,
      versionePrompt: def.versionePrompt,
      contestoAiVersione: contesto?.numero ?? null,
      lingua: r.linguaOutput,
      emailId: r.emailId,
      richiestaRianalisiId: r.richiestaRianalisiId ?? null,
      ora: dip.orologio.ora(),
    });
    return { tipo: "claim" as const, claim, chiave, modello: c.modello, direttive: contesto?.testo ?? "", fuso: c.preferenze.fusoOrario };
  });

  if (fase1.tipo === "in_pausa") {
    await registraPausa(dip, utenteId, fase1.motivo, fase1.ambito);
    return fase1;
  }
  const { claim } = fase1;
  if (claim.tipo === "in_corso_altrove") return { tipo: "riprova", dopoMs: MINUTO_MS };
  if (claim.tipo === "completata") {
    const salvato = claim.output as { risolto?: unknown; grezzo?: unknown };
    if (salvato && typeof salvato === "object" && "risolto" in salvato) {
      return { tipo: "ok", analisiId: claim.id, output: salvato.risolto as OutputFunzione<F> };
    }
    return risolvi(r, claim.id, claim.output);
  }

  const prompt = costruisciPrompt(r.funzione, {
    linguaOutput: r.linguaOutput,
    direttive: fase1.direttive,
    dati: r.dati,
    oggi: dataNelFuso(dip.orologio.ora(), fase1.fuso),
    fusoOrario: fase1.fuso,
  });
  let esito = await dip.modelli.invoca({
    funzione: r.funzione,
    modello: fase1.modello,
    chiave: fase1.chiave,
    sistema: prompt.sistema,
    direttive: prompt.direttive,
    dati: prompt.dati,
    nomeSchema: def.nomeSchema,
    schema: jsonSchemaStrict(def.schema) as Record<string, unknown>,
    maxTokenUscita: def.maxTokenUscita,
  });
  let validato = esito.ok ? validaOutput(r.funzione, esito.output) : null;
  let utilizzoPrecedente: UtilizzoModello | null = null;
  if (esito.ok && validato && !validato.ok) {
    utilizzoPrecedente = esito.utilizzo;
    esito = await dip.modelli.invoca({
      funzione: r.funzione,
      modello: fase1.modello,
      chiave: fase1.chiave,
      sistema: `${prompt.sistema}\n\nYour previous answer did not match the required JSON schema. Answer again, strictly following the schema.`,
      direttive: prompt.direttive,
      dati: prompt.dati,
      nomeSchema: def.nomeSchema,
      schema: jsonSchemaStrict(def.schema) as Record<string, unknown>,
      maxTokenUscita: def.maxTokenUscita,
    });
    validato = esito.ok ? validaOutput(r.funzione, esito.output) : null;
    // Anche la risposta scartata è stata pagata: il consumo registrato somma i due tentativi.
    esito = esito.ok
      ? { ...esito, utilizzo: sommaUtilizzo(utilizzoPrecedente, esito.utilizzo)! }
      : { ...esito, utilizzo: sommaUtilizzo(utilizzoPrecedente, esito.utilizzo) };
  }
  const ora = dip.orologio.ora();

  if (!esito.ok) {
    await dip.unita.perUtente(utenteId, (ctx) => analisi.fallisci(ctx, claim.id, esito.ok ? "" : esito.codice, esito.ok ? null : esito.utilizzo, ora));
    return gestisciErrore(dip, utenteId, r.funzione, esito.codice, esito.riprovaDopoMs);
  }
  if (!validato || !validato.ok) {
    await dip.unita.perUtente(utenteId, (ctx) => analisi.fallisci(ctx, claim.id, "risposta_non_valida", esito.ok ? esito.utilizzo : null, ora));
    return { tipo: "errore", codice: "risposta_non_valida" };
  }
  const risolto = risolviRiferimenti(r.funzione, validato.output, r.tabella);
  if (!risolto.ok) {
    await dip.unita.perUtente(utenteId, (ctx) => analisi.fallisci(ctx, claim.id, "alias_sconosciuto", esito.ok ? esito.utilizzo : null, ora));
    return { tipo: "errore", codice: "alias_sconosciuto" };
  }
  await dip.unita.perUtente(utenteId, (ctx) =>
    analisi.completa(ctx, claim.id, { grezzo: validato.output, risolto: risolto.output }, esito.utilizzo, ora),
  );
  return { tipo: "ok", analisiId: claim.id, output: risolto.output };
}

/** Somma il consumo di più tentativi della stessa invocazione; modello e generazione sono quelli dell'ultimo. */
export function sommaUtilizzo(a: UtilizzoModello | null, b: UtilizzoModello | null): UtilizzoModello | null {
  if (!a) return b;
  if (!b) return a;
  return {
    modelloServito: b.modelloServito,
    fornitore: b.fornitore ?? a.fornitore,
    tokenIngresso: a.tokenIngresso + b.tokenIngresso,
    tokenUscita: a.tokenUscita + b.tokenUscita,
    costo: a.costo === null && b.costo === null ? null : (a.costo ?? 0) + (b.costo ?? 0),
    idGenerazione: b.idGenerazione ?? a.idGenerazione,
    latenzaMs: a.latenzaMs + b.latenzaMs,
  };
}

function risolvi<F extends FunzioneAI>(r: RichiestaInvocazione<F>, analisiId: string, grezzo: unknown): EsitoInvocazione<F> {
  const validato = validaOutput(r.funzione, grezzo);
  if (!validato.ok) return { tipo: "errore", codice: "risposta_non_valida" };
  const risolto = risolviRiferimenti(r.funzione, validato.output, r.tabella);
  if (!risolto.ok) return { tipo: "errore", codice: "alias_sconosciuto" };
  return { tipo: "ok", analisiId, output: risolto.output };
}

async function registraPausa(dip: Dipendenze, utenteId: string, motivo: MotivoPausa, ambito: FunzioneAI | "*") {
  if (motivo === "pausa_manuale" || motivo === "consenso_mancante" || motivo === "chiave_mancante") return;
  const ora = dip.orologio.ora();
  await dip.unita.perUtente(utenteId, (ctx) => impostazioni.apriPausa(ctx, ambito, motivo, dip.ids.nuovo(), ora));
}

async function gestisciErrore<F extends FunzioneAI>(
  dip: Dipendenze,
  utenteId: string,
  funzione: F,
  codice: string,
  riprovaDopoMs: number | null,
): Promise<EsitoInvocazione<F>> {
  const ora = dip.orologio.ora();
  switch (codice) {
    case "chiave_non_valida":
      await dip.unita.perUtente(utenteId, async (ctx) => {
        await impostazioni.aggiornaStatoChiave(ctx, "non_valida", ora);
        await impostazioni.apriPausa(ctx, "*", "chiave_non_valida", dip.ids.nuovo(), ora);
      });
      return { tipo: "in_pausa", motivo: "chiave_non_valida", ambito: "*" };
    case "credito_esaurito":
    case "limite_chiave": {
      const verifica = new Date(ora.getTime() + 30 * MINUTO_MS);
      await dip.unita.perUtente(utenteId, async (ctx) => {
        await impostazioni.aggiornaStatoChiave(ctx, codice === "limite_chiave" ? "limitata" : "credito_esaurito", ora);
        await impostazioni.apriPausa(ctx, "*", "credito_esaurito", dip.ids.nuovo(), ora, verifica);
        await ctx.coda.accoda("verifica_chiave", { utenteId }, { chiave: `verifica_chiave:${utenteId}`, esegui: verifica, modalitaChiave: "preserve_run_at" });
      });
      return { tipo: "in_pausa", motivo: "credito_esaurito", ambito: "*" };
    }
    case "modello_incompatibile": {
      const verifica = new Date(ora.getTime() + 6 * 60 * MINUTO_MS);
      await dip.unita.perUtente(utenteId, async (ctx) => {
        const modelli = await impostazioni.modelli(ctx);
        await impostazioni.impostaModello(ctx, funzione, modelli[funzione].modello, "incompatibile", ora);
        await impostazioni.apriPausa(ctx, funzione, "modello_incompatibile", dip.ids.nuovo(), ora, verifica);
        await ctx.coda.accoda("verifica_modelli", { utenteId, funzione }, { chiave: `verifica_modelli:${utenteId}:${funzione}`, esegui: verifica, modalitaChiave: "preserve_run_at" });
      });
      return { tipo: "in_pausa", motivo: "modello_incompatibile", ambito: funzione };
    }
    case "budget_in_volo":
    case "temporaneo":
    case "timeout":
      return { tipo: "riprova", dopoMs: Math.max(riprovaDopoMs ?? 0, MINUTO_MS) };
    default:
      return { tipo: "errore", codice };
  }
}

export { PAUSE_TOTALI };
