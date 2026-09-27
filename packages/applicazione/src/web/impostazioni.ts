/**
 * Casi d'uso di lettura o azioni aggiuntive richiesti dalle pagine web dell'area "impostazioni".
 * Ogni area ha il proprio file, così le pagine possono crescere senza modificare moduli condivisi.
 * I nomi sono specifici dell'area perché `web/index.ts` riesporta tutti i file con `export *`.
 */
import { DIRETTIVE_PREDEFINITE, REGISTRO_FUNZIONI } from "@ec/ai";
import { FUNZIONI_AI, type FunzioneAI, type MotivoPausa } from "@ec/core/dominio";
import { caselle, impostazioni, rianalisi, viste, type ContestoUtente } from "@ec/db";
import type { Dipendenze } from "../dipendenze";
import { impostaModello, salvaContestoAi, type EsitoModello } from "../impostazioni/impostazioni";
import { confermaImportazione, rifiutaImportazione } from "../posta/importazione";
import { confermaRianalisi } from "../rianalisi/rianalizza";
import { iso, isoOpzionale } from "../viste/calcolo";
import type { VistaStatoDto } from "../viste/tipi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EsitoDecisioneImportazione = "ok" | "gia_decisa" | "non_trovata";

/**
 * Conferma o rinvio dell'Importazione iniziale da `/settings`. Una casella che per questo utente non
 * esiste (per esempio l'id di un altro utente) o è scollegata risulta `non_trovata`, mai "già decisa";
 * `gia_decisa` resta per la casella dell'utente la cui importazione è già partita o cambiata.
 */
export async function decidiImportazioneImpostazioni(
  dip: Dipendenze,
  ctx: ContestoUtente,
  casellaId: string,
  scelta: "conferma" | "rinvia",
): Promise<EsitoDecisioneImportazione> {
  const casella = UUID.test(casellaId) ? await caselle.leggi(ctx, casellaId) : null;
  if (!casella || casella.stato === "scollegata" || casella.stato === "scollegamento_in_corso") return "non_trovata";
  const fatto = scelta === "conferma" ? await confermaImportazione(dip, ctx, casellaId) : await rifiutaImportazione(dip, ctx, casellaId);
  return fatto ? "ok" : "gia_decisa";
}

export type EsitoConfermaRianalisiImpostazioni = "ok" | "stima_scaduta" | "non_trovata";

/**
 * Conferma esplicita di una rianalisi stimata. Una richiesta che per questo utente non esiste è
 * `non_trovata`; una già confermata o avviata è `stima_scaduta` (va ripetuta la stima).
 */
export async function confermaRianalisiImpostazioni(dip: Dipendenze, ctx: ContestoUtente, richiestaId: string): Promise<EsitoConfermaRianalisiImpostazioni> {
  if (!UUID.test(richiestaId) || !(await rianalisi.leggi(ctx, richiestaId))) return "non_trovata";
  return (await confermaRianalisi(dip, ctx, richiestaId)) ? "ok" : "stima_scaduta";
}

export type PausaEffettivaImpostazioni = VistaStatoDto["pause"][number];

/**
 * Pause dell'analisi che sono davvero in vigore, con la stessa regola di `condizioni` in
 * `analisi/invocazione.ts`. Oltre alle pause registrate (che hanno `dal` e `prossimaVerifica`) include le
 * cause che fermano l'analisi senza lasciare una riga: informativa non accettata, pausa manuale, chiave
 * assente, non valida o senza credito, modello non compatibile o non disponibile. Così `/status` e
 * `/settings` non dicono "analisi attiva" quando non lo è. Prima le pause globali, poi quelle per funzione.
 */
export async function pauseEffettiveImpostazioni(dip: Pick<Dipendenze, "configurazione">, ctx: ContestoUtente): Promise<PausaEffettivaImpostazioni[]> {
  const [consenso, preferenze, chiave, modelli, registrate] = await Promise.all([
    impostazioni.haConsenso(ctx, dip.configurazione.versioneInformativa),
    impostazioni.preferenze(ctx),
    impostazioni.infoChiave(ctx),
    impostazioni.modelli(ctx),
    impostazioni.pauseAttive(ctx),
  ]);
  const righe = new Map(registrate.map((p) => [`${p.funzione}:${p.motivo}`, p]));
  const risultato: PausaEffettivaImpostazioni[] = [];
  const aggiunte = new Set<string>();
  const aggiungi = (funzione: FunzioneAI | "*", motivo: MotivoPausa) => {
    const k = `${funzione}:${motivo}`;
    if (aggiunte.has(k)) return;
    aggiunte.add(k);
    const riga = righe.get(k);
    risultato.push({ funzione, motivo, dal: riga ? iso(riga.dal) : null, prossimaVerifica: isoOpzionale(riga?.prossimaVerifica) });
  };
  if (!consenso) aggiungi("*", "consenso_mancante");
  if (preferenze.pausaManuale) aggiungi("*", "pausa_manuale");
  if (!chiave) aggiungi("*", "chiave_mancante");
  else if (chiave.stato === "non_valida") aggiungi("*", "chiave_non_valida");
  else if (chiave.stato === "credito_esaurito" || chiave.stato === "limitata") aggiungi("*", "credito_esaurito");
  for (const p of registrate) if (p.funzione === "*") aggiungi(p.funzione, p.motivo);
  for (const f of FUNZIONI_AI) {
    for (const p of registrate) if (p.funzione === f) aggiungi(f, p.motivo);
    if (modelli[f].stato === "incompatibile") aggiungi(f, "modello_incompatibile");
    else if (modelli[f].stato === "non_disponibile") aggiungi(f, "modello_non_disponibile");
  }
  // Righe con una funzione che l'app non conosce più: restano visibili, mai nascoste.
  for (const p of registrate) aggiungi(p.funzione, p.motivo);
  return risultato;
}

export interface StimaImportazioneCasella {
  numeroEmail: number;
  costoStimato: number;
  calcolataIl: string;
}

/**
 * Stima dell'Importazione iniziale per ogni casella non scollegata che ne ha una, indicizzata per id:
 * serve alla scheda di conferma in `/settings` (la vista delle impostazioni riporta solo la fase).
 */
export async function stimeImportazioneImpostazioni(ctx: ContestoUtente): Promise<Record<string, StimaImportazioneCasella>> {
  const elenco = await viste.caselle(ctx);
  const risultato: Record<string, StimaImportazioneCasella> = {};
  for (const c of elenco) {
    if (c.stima) risultato[c.id] = { numeroEmail: c.stima.numeroEmail, costoStimato: c.stima.costoStimato, calcolataIl: c.stima.calcolataIl };
  }
  return risultato;
}

/**
 * Riporta una Funzione AI al suo modello predefinito, con la stessa verifica di compatibilità di
 * `impostaModello`: se anche il predefinito non è compatibile o disponibile, l'esito lo dice e nulla cambia.
 */
export async function ripristinaModelloPredefinitoImpostazioni(dip: Dipendenze, ctx: ContestoUtente, funzione: FunzioneAI): Promise<EsitoModello> {
  return impostaModello(dip, ctx, funzione, REGISTRO_FUNZIONI[funzione].modelloPredefinito);
}

/**
 * "Ripristina" una versione precedente del Contesto AI: il testo di quella versione, letto sul server,
 * diventa una nuova versione. Restituisce il numero della nuova versione, o null se la versione non esiste.
 */
export async function ripristinaVersioneContestoImpostazioni(dip: Dipendenze, ctx: ContestoUtente, numero: number): Promise<number | null> {
  if (!Number.isInteger(numero) || numero < 1) return null;
  const versioni = await impostazioni.versioniContesto(ctx);
  const versione = versioni.find((v) => v.numero === numero);
  if (!versione) return null;
  return salvaContestoAi(dip, ctx, versione.testo);
}

/** Salva le Direttive predefinite dell'app come nuova versione del Contesto AI. */
export async function ripristinaDirettivePredefiniteImpostazioni(dip: Dipendenze, ctx: ContestoUtente): Promise<number> {
  return salvaContestoAi(dip, ctx, DIRETTIVE_PREDEFINITE);
}
