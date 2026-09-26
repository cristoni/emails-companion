import { run, type TaskList } from "graphile-worker";
import pino from "pino";
import { gestoriJob } from "@ec/applicazione";
import { componi, leggiConfigurazione } from "@ec/composizione";
import { NOMI_JOB } from "@ec/core/porte";
import { caselle, codaGraphile } from "@ec/db";
import { avviaConsumerNotifiche } from "./notifiche";
import { serializzaErrore } from "./errori";

const log = pino({ level: process.env.LOG_LEVEL ?? "info", redact: { paths: ["*.token", "*.chiave", "*.authorization", "*.refreshToken", "*.accessToken"], remove: true } });

const CRONTAB = [
  "* * * * * pianifica_sincronizzazioni ?max=1",
  "*/2 * * * * sweeper_invii ?max=1",
  "17 3 * * * pulizia ?max=1",
].join("\n");

async function principale() {
  const cfg = leggiConfigurazione(process.env);
  const composizione = await componi(cfg, { coda: (tx) => codaGraphile(tx), massimoConnessioni: 12 });
  const { dip, connessione } = composizione;

  const schema = await connessione.pool.query<{ tabella: string | null }>("select to_regclass('public.email') as tabella");
  if (!schema.rows[0]?.tabella) {
    log.fatal({ codice: "schema_non_migrato" }, "eseguire pnpm db:migrate prima di avviare il worker");
    process.exit(57);
  }

  const gestori = gestoriJob(dip, {
    pulizia: async () => {
      await dip.unita.sistema(async (ctx) => {
        for (const c of await caselle.attiveDiTutti(ctx.tx)) {
          await ctx.coda.accoda("rinnova_watch_e_alias", c, { chiave: `watch:${c.casellaId}` });
        }
      });
    },
  });

  const taskList: TaskList = Object.fromEntries(
    NOMI_JOB.map((nome) => [
      nome,
      async (payload: unknown) => {
        const inizio = Date.now();
        try {
          await (gestori[nome] as (p: unknown) => Promise<void>)(payload);
          log.debug({ job: nome, ms: Date.now() - inizio }, "job completato");
        } catch (errore) {
          log.error({ job: nome, errore: serializzaErrore(errore) }, "job fallito");
          throw new Error(serializzaErrore(errore).codice);
        }
      },
    ]),
  );

  const runner = await run({
    pgPool: connessione.pool,
    concurrency: Number(process.env.EC_CONCORRENZA ?? 5),
    taskList,
    crontab: CRONTAB,
    noHandleSignals: false,
  });

  const fermaNotifiche = cfg.pubsub ? await avviaConsumerNotifiche(cfg.pubsub, dip, log) : null;
  log.info({ modalita: cfg.modalita, pubsub: Boolean(cfg.pubsub) }, "worker avviato");

  await runner.promise;
  await fermaNotifiche?.();
  await composizione.chiudi();
}

principale().catch((errore) => {
  log.fatal({ errore: serializzaErrore(errore) }, "worker terminato");
  process.exit(1);
});
