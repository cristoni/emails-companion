import { caselle, eliminazione, indirizzi, sincronizzazione } from "@ec/db";
import type { Dipendenze } from "../dipendenze";
import { programmaRiepilogoNews } from "../news/riepilogo";

const LOTTO_ELIMINAZIONE = 200;

/**
 * Scollegamento (§6.4): ferma le notifiche, revoca il consenso, elimina a lotti copie ed email
 * della casella e riduce la casella a una riga terminale. Idempotente se ripetuto.
 */
export async function scollegaCasella(dip: Dipendenze, utenteId: string, casellaId: string): Promise<void> {
  const stato = await dip.unita.perUtente(utenteId, (ctx) => caselle.bloccaStato(ctx, casellaId));
  if (stato !== "scollegamento_in_corso") return;
  try {
    const connettore = await dip.connettori.per(casellaId);
    await connettore.fermaNotifiche().catch(() => {});
    await connettore.revoca().catch(() => {});
  } catch {
    // Senza credenziali valide non c'è nulla da fermare o revocare presso il provider.
  }
  for (;;) {
    const eliminate = await dip.unita.perUtente(utenteId, (ctx) => eliminazione.lottoCopie(ctx, casellaId, LOTTO_ELIMINAZIONE));
    if (eliminate === 0) break;
  }
  await dip.unita.perUtente(utenteId, async (ctx) => {
    await eliminazione.datiCasella(ctx, casellaId);
    await caselle.rendiTerminale(ctx, casellaId, dip.orologio.ora());
    await programmaRiepilogoNews(dip, ctx);
    await ctx.coda.accoda("riconcilia_utente", { utenteId }, { chiave: `riconcilia:${utenteId}`, coda: `utente:${utenteId}`, modalitaChiave: "preserve_run_at" });
  });
}

/** Eliminazione dell'account: scollega ogni casella, poi cancella l'utente e la sua chiave dati. */
export async function eliminaAccount(dip: Dipendenze, utenteId: string): Promise<void> {
  const elenco = await dip.unita.perUtente(utenteId, (ctx) => caselle.elenca(ctx));
  for (const c of elenco) {
    await dip.unita.perUtente(utenteId, (ctx) =>
      caselle.cambiaStato(ctx, c.id, "scollegamento_in_corso", ["collegata", "permessi_incompleti", "da_ricollegare"], dip.orologio.ora()),
    );
    await scollegaCasella(dip, utenteId, c.id);
  }
  await dip.unita.perUtente(utenteId, (ctx) => eliminazione.account(ctx));
  await dip.unita.cassaforte.dimenticaUtente(utenteId);
}

/** Rinnovo quotidiano del watch e degli alias "Invia come" della casella. */
export async function rinnovaWatchEAlias(dip: Dipendenze, utenteId: string, casellaId: string): Promise<void> {
  const casella = await dip.unita.perUtente(utenteId, (ctx) => caselle.leggi(ctx, casellaId));
  if (!casella || (casella.stato !== "collegata" && casella.stato !== "permessi_incompleti")) return;
  const connettore = await dip.connettori.per(casellaId);
  const alias = connettore.capacita.alias ? await connettore.alias() : [];
  const watch = connettore.capacita.notifiche ? await connettore.avviaNotifiche() : null;
  await dip.unita.perUtente(utenteId, async (ctx) => {
    if ((await caselle.bloccaStato(ctx, casellaId)) !== "collegata" && casella.stato !== "permessi_incompleti") return;
    await indirizzi.sostituisci(
      ctx,
      casellaId,
      [{ indirizzo: casella.indirizzo, origine: "casella" }, ...alias.map((a) => ({ indirizzo: a, origine: "alias" as const }))],
      () => dip.ids.nuovo(),
    );
    if (watch) await sincronizzazione.aggiorna(ctx, casellaId, { scadenzaWatch: watch.scadenza });
  });
}
