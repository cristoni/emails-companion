import type { StatoCasella } from "@ec/core/dominio";
import { caselle, credenziali, indirizzi, sincronizzazione, type ContestoUtente, type UnitaDiLavoro } from "@ec/db";
import type { Dipendenze } from "../dipendenze";
import { finestreImportazione } from "../posta/importazione";

export const SCOPE_LETTURA = "https://www.googleapis.com/auth/gmail.readonly";
export const SCOPE_INVIO = "https://www.googleapis.com/auth/gmail.send";

export interface ConsensoGoogleRicevuto {
  sub: string;
  email: string;
  scopeConcessi: string[];
  accessToken: string;
  scadenzaAccesso: Date;
  refreshToken: string | null;
  /** Da dove arriva il consenso: accesso con Better Auth o flusso proprio della webapp. */
  origine: "accesso" | "collega" | "ricollega";
  /** Casella attesa per Ricollega/Autorizza: il `sub` deve coincidere. */
  casellaAttesaId?: string;
}

export type EsitoConsenso =
  | { tipo: "collegata"; casellaId: string; stato: StatoCasella; nuova: boolean }
  | { tipo: "account_di_altro_utente" }
  | { tipo: "account_diverso_da_quello_atteso" };

export function statoDaScope(scope: string[], haRefresh: boolean): StatoCasella {
  if (!haRefresh) return "da_ricollegare";
  return scope.includes(SCOPE_LETTURA) && scope.includes(SCOPE_INVIO) ? "collegata" : "permessi_incompleti";
}

/**
 * Registra un consenso Google per una casella dell'utente (§6.1–§6.2). Un account esterno appartiene
 * a un solo utente; Ricollega/Autorizza devono restituire lo stesso account della casella.
 */
export async function registraConsensoGoogle(
  dip: Pick<Dipendenze, "orologio" | "ids" | "configurazione">,
  unita: UnitaDiLavoro,
  utenteId: string,
  consenso: ConsensoGoogleRicevuto,
  cursoreIniziale: () => Promise<string | null>,
): Promise<EsitoConsenso> {
  const ora = dip.orologio.ora();
  const esito = await unita.perUtente(utenteId, async (ctx) => {
    const accountGlobale = ctx.codec.indiceGlobale("account_esterno", `gmail:${consenso.sub}`);
    const attiva = await caselle.attivaPerAccount(ctx.tx, accountGlobale, "gmail");
    if (attiva && attiva.utenteId !== utenteId) return { tipo: "account_di_altro_utente" as const };
    if (consenso.casellaAttesaId && attiva?.id !== consenso.casellaAttesaId) return { tipo: "account_diverso_da_quello_atteso" as const };

    if (attiva) {
      const credenzialiEsistenti = await credenziali.leggi(ctx, attiva.id);
      const haRefresh = Boolean(consenso.refreshToken ?? credenzialiEsistenti?.refreshToken);
      await credenziali.registraConsenso(ctx, attiva.id, { refreshToken: consenso.refreshToken, accessToken: consenso.accessToken, scadenzaAccesso: consenso.scadenzaAccesso, ora });
      const stato = statoDaScope(consenso.scopeConcessi, haRefresh);
      await caselle.cambiaStato(ctx, attiva.id, stato, ["collegata", "permessi_incompleti", "da_ricollegare"], ora, { scope: consenso.scopeConcessi, ultimoErrore: null });
      if (stato !== "da_ricollegare") {
        await ctx.coda.accoda("sincronizza_casella", { utenteId, casellaId: attiva.id }, { chiave: `sync:${attiva.id}`, coda: `casella:${attiva.id}`, modalitaChiave: "replace" });
      }
      return { tipo: "collegata" as const, casellaId: attiva.id, stato, nuova: false };
    }

    const casellaId = dip.ids.nuovo();
    const stato = statoDaScope(consenso.scopeConcessi, Boolean(consenso.refreshToken));
    await caselle.inserisci(ctx, { id: casellaId, connettore: "gmail", indirizzo: consenso.email, accountEsterno: consenso.sub, stato, scope: consenso.scopeConcessi, ora });
    await credenziali.registraConsenso(ctx, casellaId, { refreshToken: consenso.refreshToken, accessToken: consenso.accessToken, scadenzaAccesso: consenso.scadenzaAccesso, ora });
    await indirizzi.sostituisci(ctx, casellaId, [{ indirizzo: consenso.email, origine: "casella" }], () => dip.ids.nuovo());
    return { tipo: "collegata" as const, casellaId, stato, nuova: true };
  });

  if (esito.tipo === "collegata" && esito.nuova && esito.stato !== "da_ricollegare") {
    await inizializzaSincronizzazione(dip, unita, utenteId, esito.casellaId, await cursoreIniziale());
  }
  return esito;
}

/** Salva il cursore iniziale prima di qualsiasi importazione e avvia stima, alias e watch. */
export async function inizializzaSincronizzazione(
  dip: Pick<Dipendenze, "orologio" | "configurazione">,
  unita: UnitaDiLavoro,
  utenteId: string,
  casellaId: string,
  cursore: string | null,
) {
  const riferimento = dip.orologio.ora();
  await unita.perUtente(utenteId, async (ctx) => {
    await sincronizzazione.inizializza(ctx, casellaId, {
      cursore: cursore ?? "",
      riferimento,
      ...finestreImportazione(dip as Dipendenze, riferimento),
    });
    await ctx.coda.accoda("stima_importazione", { utenteId, casellaId }, { coda: `casella:${casellaId}` });
    await ctx.coda.accoda("rinnova_watch_e_alias", { utenteId, casellaId }, { chiave: `watch:${casellaId}` });
  });
}

/** "Scollega" dalla webapp: la casella entra in scollegamento e il lavoro prosegue nel worker. */
export async function avviaScollegamento(dip: Pick<Dipendenze, "orologio">, ctx: ContestoUtente, casellaId: string): Promise<boolean> {
  const ok = await caselle.cambiaStato(ctx, casellaId, "scollegamento_in_corso", ["collegata", "permessi_incompleti", "da_ricollegare"], dip.orologio.ora());
  if (ok) await ctx.coda.accoda("scollega_casella", { utenteId: ctx.utenteId, casellaId }, { coda: `casella:${casellaId}` });
  return ok;
}
