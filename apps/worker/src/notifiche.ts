import { PubSub, Duration, type Message } from "@google-cloud/pubsub";
import type { Logger } from "pino";
import type { Dipendenze } from "@ec/applicazione";
import { normalizzaIndirizzo } from "@ec/core/dominio";
import { caselle } from "@ec/db";
import { serializzaErrore } from "./errori";

/**
 * Consumer pull delle notifiche Gmail: una notifica è solo un segnale per sincronizzare dal cursore
 * salvato; il suo historyId non viene mai usato come punto di partenza.
 */
export async function avviaConsumerNotifiche(
  cfg: { subscription: string; credenziali: string },
  dip: Dipendenze,
  log: Logger,
): Promise<() => Promise<void>> {
  const credenziali = JSON.parse(cfg.credenziali) as { project_id: string; client_email: string; private_key: string };
  const pubsub = new PubSub({ projectId: credenziali.project_id, credentials: { client_email: credenziali.client_email, private_key: credenziali.private_key } });
  const sottoscrizione = pubsub.subscription(cfg.subscription, {
    flowControl: { maxMessages: 10, allowExcessMessages: false },
    maxExtensionTime: Duration.from({ minutes: 5 }),
  });
  sottoscrizione.on("message", async (messaggio: Message) => {
    try {
      const { emailAddress } = JSON.parse(messaggio.data.toString("utf8")) as { emailAddress?: string };
      if (emailAddress) {
        const indice = dip.unita.cassaforte.indiceGlobale("indirizzo_casella", normalizzaIndirizzo(emailAddress));
        await dip.unita.sistema(async (ctx) => {
          const casella = await caselle.attivaPerIndirizzo(ctx.tx, indice);
          if (casella) {
            await ctx.coda.accoda("sincronizza_casella", { utenteId: casella.utenteId, casellaId: casella.id }, { chiave: `sync:${casella.id}`, coda: `casella:${casella.id}`, modalitaChiave: "preserve_run_at" });
          }
        });
      }
      messaggio.ack();
    } catch (errore) {
      log.warn({ errore: serializzaErrore(errore) }, "notifica non elaborata");
      messaggio.nack();
    }
  });
  sottoscrizione.on("error", (errore) => log.error({ errore: serializzaErrore(errore) }, "errore della sottoscrizione"));
  return () => sottoscrizione.close();
}
