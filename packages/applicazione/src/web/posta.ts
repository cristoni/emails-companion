/**
 * Casi d'uso di lettura o azioni aggiuntive richiesti dalle pagine web dell'area "posta".
 * Ogni area ha il proprio file, così le pagine possono crescere senza modificare moduli condivisi.
 */
import type { StatoCasella } from "@ec/core/dominio";
import type { ContestoUtente } from "@ec/db";
import type { Dipendenze } from "../dipendenze";
import { rianalisi, type StatoRichiestaRianalisi } from "../rianalisi/repository";
import { iso, UUID } from "../viste/calcolo";
import { viste } from "../viste/repository";
import type { Istante } from "../viste/tipi";

export interface CasellaPostaDto {
  id: string;
  indirizzo: string;
  stato: StatoCasella;
}

/**
 * Caselle dell'utente per il filtro dell'elenco `/mail`: solo id, indirizzo e stato, senza caricare il
 * resto delle impostazioni. Nessun segreto: l'indirizzo è già mostrato ovunque nell'interfaccia.
 */
export async function casellePosta(_dip: Dipendenze, ctx: ContestoUtente): Promise<CasellaPostaDto[]> {
  const caselle = await viste.caselle(ctx);
  return caselle
    .map((c) => ({ id: c.id, indirizzo: c.indirizzo, stato: c.stato }))
    .sort((a, b) => a.indirizzo.localeCompare(b.indirizzo) || (a.id < b.id ? -1 : 1));
}

export interface RianalisiEmailDto {
  richiestaId: string;
  stato: StatoRichiestaRianalisi;
  numeroEmail: number;
  costoStimato: number;
  creataIl: Istante;
}

/**
 * Richiesta di "Rianalizza" di una singola email, per mostrarne la stima prima della conferma e poi il suo
 * avanzamento (§10.7). Restituisce null se la richiesta non esiste per l'utente o riguarda un altro ambito:
 * un id preso da un altro contesto non mostra mai la stima di un'altra email.
 */
export async function vistaRianalisiEmail(_dip: Dipendenze, ctx: ContestoUtente, emailId: string, richiestaId: string): Promise<RianalisiEmailDto | null> {
  if (typeof emailId !== "string" || typeof richiestaId !== "string" || !UUID.test(emailId) || !UUID.test(richiestaId)) return null;
  const richiesta = await rianalisi.leggi(ctx, richiestaId.toLowerCase());
  if (!richiesta || richiesta.ambito.tipo !== "email" || richiesta.ambito.emailId !== emailId.toLowerCase()) return null;
  return {
    richiestaId: richiesta.id,
    stato: richiesta.stato,
    numeroEmail: richiesta.stima?.numeroEmail ?? 0,
    costoStimato: richiesta.stima?.costoStimato ?? 0,
    creataIl: iso(richiesta.creataIl),
  };
}
