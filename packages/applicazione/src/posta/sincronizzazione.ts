import { ErroreConnettore, type ConnettorePosta } from "@ec/core/porte";
import { caselle, posta, sincronizzazione, type ContestoUtente } from "@ec/db";
import { GIORNO_MS, MINUTO_MS, type Dipendenze } from "../dipendenze";
import { prossimoTentativo } from "../ritentativi";
import { acquisisciCopia } from "./acquisizione";

const STATI_SINCRONIZZABILI = ["collegata", "permessi_incompleti"] as const;
const MASSIMO_RECUPERO_MS = 90 * GIORNO_MS;

export type EsitoSincronizzazione =
  | { tipo: "ok"; acquisite: number }
  | { tipo: "rinviata"; finoA: Date }
  | { tipo: "non_sincronizzabile" }
  | { tipo: "errore"; codice: string };

/** Opzioni di accodamento per la sincronizzazione di una casella (debounce per casella, coda seriale). */
export function opzioniSincronizzazione(casellaId: string, esegui?: Date, modalita: "replace" | "preserve_run_at" = "preserve_run_at") {
  return { chiave: `sync:${casellaId}`, coda: `casella:${casellaId}`, modalitaChiave: modalita, esegui };
}

/**
 * Sincronizzazione incrementale dal cursore salvato (§7.2), con risincronizzazione completa
 * quando il cursore è scaduto (§7.3). I ritentativi sono gestiti nel dominio, non nel motore dei job.
 */
export async function sincronizzaCasella(dip: Dipendenze, utenteId: string, casellaId: string): Promise<EsitoSincronizzazione> {
  const ora = dip.orologio.ora();
  const preparazione = await dip.unita.perUtente(utenteId, async (ctx) => {
    const c = await caselle.leggi(ctx, casellaId);
    const stato = await sincronizzazione.leggi(ctx, casellaId);
    if (!c || !stato || !STATI_SINCRONIZZABILI.includes(c.stato as (typeof STATI_SINCRONIZZABILI)[number])) return null;
    if (c.stato === "permessi_incompleti" && !c.scopeConcessi.some((s) => s.endsWith("gmail.readonly"))) return null;
    if (stato.nonPrimaDi && stato.nonPrimaDi > ora) {
      await ctx.coda.accoda("sincronizza_casella", { utenteId, casellaId }, opzioniSincronizzazione(casellaId, stato.nonPrimaDi, "replace"));
      return { rinviata: stato.nonPrimaDi } as const;
    }
    return { casella: c, cursore: stato.cursore, cursoreProvvisorio: stato.cursoreProvvisorio, ultimaSyncOk: stato.ultimaSyncOk, stato } as const;
  });
  if (!preparazione) return { tipo: "non_sincronizzabile" };
  if ("rinviata" in preparazione && preparazione.rinviata) return { tipo: "rinviata", finoA: preparazione.rinviata };
  if (!("casella" in preparazione)) return { tipo: "non_sincronizzabile" };

  let connettore: ConnettorePosta;
  let acquisite = 0;
  try {
    connettore = await dip.connettori.per(casellaId);
    if (preparazione.cursoreProvvisorio || !preparazione.cursore) {
      acquisite += await risincronizza(dip, utenteId, casellaId, connettore, preparazione.ultimaSyncOk, preparazione.cursoreProvvisorio);
    } else {
      try {
        for await (const pagina of connettore.modifiche(preparazione.cursore)) {
          const continua = await dip.unita.perUtente(utenteId, async (ctx) => {
            const stato = await caselle.bloccaStato(ctx, casellaId);
            if (!stato || !STATI_SINCRONIZZABILI.includes(stato as (typeof STATI_SINCRONIZZABILI)[number])) return false;
            for (const id of pagina.eliminate) await posta.segnaEliminata(ctx, casellaId, id);
            for (const cambio of pagina.cambiCartelle) {
              await posta.aggiornaCartelle(ctx, casellaId, cambio.idConnettore, cambio.cartelle, cambio.etichette);
            }
            return true;
          });
          if (!continua) return { tipo: "non_sincronizzabile" };
          for (const id of pagina.aggiunte) {
            const copia = await connettore.leggi(id);
            if (!copia) continue;
            await dip.unita.perUtente(utenteId, async (ctx) => {
              const stato = await caselle.bloccaStato(ctx, casellaId);
              if (stato !== "collegata" && stato !== "permessi_incompleti") return;
              const casella = await caselle.leggi(ctx, casellaId);
              if (!casella) return;
              const esito = await acquisisciCopia(dip, ctx, casella, copia);
              if (esito.nuovaCopia) acquisite += 1;
            });
          }
          await dip.unita.perUtente(utenteId, (ctx) => sincronizzazione.aggiorna(ctx, casellaId, { cursore: pagina.cursore, aggiornataIl: dip.orologio.ora() }));
        }
      } catch (e) {
        if (e instanceof ErroreConnettore && e.codice === "cursore_scaduto") {
          acquisite += await risincronizza(dip, utenteId, casellaId, connettore, preparazione.ultimaSyncOk, null);
        } else throw e;
      }
    }
  } catch (e) {
    return gestisciErrore(dip, utenteId, casellaId, e);
  }

  await dip.unita.perUtente(utenteId, (ctx) =>
    sincronizzazione.aggiorna(ctx, casellaId, { ultimaSyncOk: dip.orologio.ora(), erroriConsecutivi: 0, ultimoErrore: null, nonPrimaDi: null }),
  );
  return { tipo: "ok", acquisite };
}

/** Risincronizzazione completa con cursore provvisorio salvato prima di elencare (§7.3). */
async function risincronizza(
  dip: Dipendenze,
  utenteId: string,
  casellaId: string,
  connettore: ConnettorePosta,
  ultimaSyncOk: Date | null,
  cursoreProvvisorio: string | null,
): Promise<number> {
  const ora = dip.orologio.ora();
  const provvisorio = cursoreProvvisorio ?? (await connettore.cursoreAttuale());
  let dal = new Date((ultimaSyncOk ?? ora).getTime() - GIORNO_MS);
  let limitato = false;
  if (ora.getTime() - dal.getTime() > MASSIMO_RECUPERO_MS) {
    dal = new Date(ora.getTime() - MASSIMO_RECUPERO_MS);
    limitato = true;
  }
  await dip.unita.perUtente(utenteId, (ctx) =>
    sincronizzazione.aggiorna(ctx, casellaId, { cursoreProvvisorio: provvisorio, ultimoErrore: limitato ? "recupero_limitato" : null }),
  );
  let acquisite = 0;
  for (const tipo of ["ricevute", "inviate"] as const) {
    for await (const ids of connettore.elenca({ dopo: dal, tipo })) {
      for (const id of ids) {
        const nota = await dip.unita.perUtente(utenteId, (ctx) => posta.trovaCopia(ctx, casellaId, id));
        if (nota) {
          const cartelle = await connettore.cartelle(id);
          await dip.unita.perUtente(utenteId, async (ctx) => {
            if (!cartelle) await posta.segnaEliminata(ctx, casellaId, id);
            else await posta.aggiornaCartelle(ctx, casellaId, id, cartelle.cartelle, cartelle.etichette);
          });
          continue;
        }
        const copia = await connettore.leggi(id);
        if (!copia) continue;
        await dip.unita.perUtente(utenteId, async (ctx) => {
          if ((await caselle.bloccaStato(ctx, casellaId)) !== "collegata") return;
          const casella = await caselle.leggi(ctx, casellaId);
          if (casella && (await acquisisciCopia(dip, ctx, casella, copia)).nuovaCopia) acquisite += 1;
        });
      }
    }
  }
  await dip.unita.perUtente(utenteId, (ctx) => sincronizzazione.aggiorna(ctx, casellaId, { cursore: provvisorio, cursoreProvvisorio: null }));
  return acquisite;
}

async function gestisciErrore(dip: Dipendenze, utenteId: string, casellaId: string, e: unknown): Promise<EsitoSincronizzazione> {
  const ora = dip.orologio.ora();
  const codice = e instanceof ErroreConnettore ? e.codice : "inatteso";
  await dip.unita.perUtente(utenteId, async (ctx: ContestoUtente) => {
    if (codice === "autorizzazione_revocata") {
      await caselle.cambiaStato(ctx, casellaId, "da_ricollegare", ["collegata", "permessi_incompleti"], ora, { ultimoErrore: codice });
      await sincronizzazione.aggiorna(ctx, casellaId, { ultimoErrore: codice });
      return;
    }
    if (codice === "permessi_insufficienti") {
      await caselle.cambiaStato(ctx, casellaId, "permessi_incompleti", ["collegata"], ora, { ultimoErrore: codice });
      await sincronizzazione.aggiorna(ctx, casellaId, { ultimoErrore: codice });
      return;
    }
    const stato = await sincronizzazione.leggi(ctx, casellaId);
    const errori = (stato?.erroriConsecutivi ?? 0) + 1;
    const riprova = e instanceof ErroreConnettore ? e.riprovaDopoMs : null;
    const nonPrimaDi = prossimoTentativo(ora, errori, riprova, casellaId);
    await sincronizzazione.aggiorna(ctx, casellaId, { erroriConsecutivi: errori, ultimoErrore: codice, nonPrimaDi });
    await ctx.coda.accoda("sincronizza_casella", { utenteId, casellaId }, opzioniSincronizzazione(casellaId, nonPrimaDi, "replace"));
  });
  return { tipo: "errore", codice };
}

/** Pianificatore: accoda la sincronizzazione delle caselle dovute. */
export async function pianificaSincronizzazioni(dip: Dipendenze): Promise<number> {
  const ora = dip.orologio.ora();
  const intervallo = dip.configurazione.notifichePushAttive ? 5 * MINUTO_MS : MINUTO_MS;
  return dip.unita.sistema(async (ctx) => {
    const dovute = await sincronizzazione.dovute(ctx.tx, ora, intervallo - 5_000);
    for (const d of dovute) {
      await ctx.coda.accoda("sincronizza_casella", { utenteId: d.utenteId, casellaId: d.casellaId }, opzioniSincronizzazione(d.casellaId));
    }
    return dovute.length;
  });
}
