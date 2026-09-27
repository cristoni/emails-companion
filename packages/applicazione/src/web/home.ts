/**
 * Casi d'uso di lettura o azioni aggiuntive richiesti dalle pagine web dell'area "home".
 * Ogni area ha il proprio file, così le pagine possono crescere senza modificare moduli condivisi.
 */
import { correzioniAttive, type Categoria, type Correzione, type Indirizzo } from "@ec/core/dominio";
import { caselle, operativo, posta, type ContestoUtente } from "@ec/db";
import { annullaCorrezioni, type EsitoCorrezione } from "../correzioni/correzioni";
import type { Dipendenze } from "../dipendenze";
import { news } from "../news/repository";
import { iso, UUID } from "../viste/calcolo";
import type { Istante } from "../viste/tipi";

/** Email della finestra delle News spostata fuori dalla categoria dall'utente: la pagina `/news` ne offre l'annullamento. */
export interface EmailSpostataDalleNewsDto {
  emailId: string;
  mittente: Indirizzo;
  oggetto: string;
  ricevutaIl: Istante;
  /** Casella collegata di provenienza. */
  casella: string | null;
  /** Categoria effettiva attuale (mai `news`). */
  categoria: Categoria;
  spostataIl: Istante;
  /** Correzioni della categoria da annullare, dalla più vecchia, per rimettere l'email nelle News. */
  correzioni: string[];
}

interface Spostamento {
  emailId: string;
  categoria: Categoria;
  correzioni: Correzione[];
}

/**
 * Correzioni della categoria che hanno portato l'email fuori dalle News: dall'ultima attiva che partiva da
 * `news` fino alla più recente. Annullandole tutte la categoria torna `news` (la correzione precedente o
 * il valore dell'AI). null se l'email è nelle News o non ne è stata spostata dall'utente.
 */
function spostamento(correzioni: readonly Correzione[], emailId: string): Spostamento | null {
  const attive = correzioniAttive(correzioni, { tipo: "email", id: emailId }, "categoria");
  const ultima = attive.at(-1);
  if (!ultima || ultima.valore === "news") return null;
  const indice = attive.findLastIndex((c) => c.valorePrecedente === "news");
  if (indice < 0) return null;
  return { emailId, categoria: ultima.valore as Categoria, correzioni: attive.slice(indice) };
}

async function spostamenti(dip: Pick<Dipendenze, "orologio">, ctx: ContestoUtente): Promise<Spostamento[]> {
  // Stesse candidate del Riepilogo News: email in entrata della finestra classificate `news` o con una correzione della categoria.
  const candidate = await news.candidate(ctx, dip.orologio.ora());
  if (candidate.length === 0) return [];
  const correzioni = await operativo.correzioniPer(
    ctx,
    candidate.map((c) => ({ tipo: "email" as const, id: c.id })),
  );
  return candidate.flatMap((c) => spostamento(correzioni, c.id) ?? []);
}

/**
 * Email ricevute nelle ultime 24 ore che l'utente ha spostato fuori dalle News, dalla più recente, con le
 * correzioni da annullare. Servono alla pagina `/news`: dopo lo spostamento l'email non è più tra i membri
 * del riepilogo e senza questo elenco la correzione non sarebbe annullabile da lì.
 */
export async function spostateFuoriDalleNews(dip: Pick<Dipendenze, "orologio">, ctx: ContestoUtente): Promise<EmailSpostataDalleNewsDto[]> {
  const trovati = await spostamenti(dip, ctx);
  if (trovati.length === 0) return [];
  const ids = trovati.map((s) => s.emailId);
  const lette = new Map((await posta.leggiMolte(ctx, ids, false)).map((e) => [e.id, e]));
  const caselleEmail = await news.caselleDelleEmail(ctx, ids);
  const indirizzi = new Map((await caselle.elenca(ctx)).map((c) => [c.id, c.indirizzo]));
  return trovati.flatMap((s): EmailSpostataDalleNewsDto[] => {
    const e = lette.get(s.emailId);
    if (!e) return [];
    const casellaId = caselleEmail.get(s.emailId);
    return [
      {
        emailId: s.emailId,
        mittente: e.mittente,
        oggetto: e.oggetto,
        ricevutaIl: iso(e.ricevutaIl),
        casella: casellaId ? (indirizzi.get(casellaId) ?? null) : null,
        categoria: s.categoria,
        spostataIl: iso(s.correzioni.at(-1)!.creataIl),
        correzioni: s.correzioni.map((c) => c.id),
      },
    ];
  });
}

/**
 * "Annulla" sullo spostamento fuori dalle News: ricalcola sul server le correzioni da annullare (mai quelle
 * inviate dal browser) e le annulla con `annullaCorrezioni`, che ripristina gli effetti e riprogramma il riepilogo.
 */
export async function annullaSpostamentoDalleNews(dip: Dipendenze, ctx: ContestoUtente, emailId: string): Promise<EsitoCorrezione> {
  if (!UUID.test(emailId)) return { codice: "non_trovato" };
  const trovato = (await spostamenti(dip, ctx)).find((s) => s.emailId === emailId);
  if (!trovato) return { codice: "non_trovato" };
  return annullaCorrezioni(
    dip,
    ctx,
    trovato.correzioni.map((c) => c.id),
  );
}
