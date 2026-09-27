import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import {
  ambienteDelleApp,
  ambienteDiPreparazione,
  completaAmbiente,
  leggiFileAmbiente,
  scriviFileAmbiente,
  ultimeCifre,
} from "./ambiente";
import { configurazioneFinta, ErroreDemo, sintesiErrore } from "./guardia";
import { avviaPostgres, portaLibera, statoPorta, type PostgresDemo } from "./postgres";
import { avviaProcesso, terminaAlbero, type ProcessoFiglio } from "./processi";
import {
  CARTELLA_DEMO,
  CARTELLA_WEB,
  CARTELLA_WORKER,
  EMAIL_DEMO,
  FILE_AMBIENTE,
  FILE_SESSIONE,
  PORTA_WEB_PREDEFINITA,
  RADICE,
  UTENTE_POSTGRES,
} from "./percorsi";
import { preparaDatiDemo } from "./semina";

/**
 * `pnpm demo`: ambiente completo in modalità finta, senza Google, OpenRouter né Railway.
 *   1. Postgres incorporato persistente in `.demo/postgres`, migrato con le migrazioni del repository;
 *   2. variabili con chiavi casuali in `.demo/.env.local` (mai stampate);
 *   3. utente demo sintetico portato fino alla home piena (pipeline eseguita in processo);
 *   4. sessione di Better Auth salvata come storageState di Playwright, senza route di accesso di prova;
 *   5. worker e `next dev` in modalità finta contro quel database.
 * Opzioni: `--reset` riparte da zero; `--prepara` si ferma dopo il punto 4. Porta web: `EC_DEMO_PORTA`.
 */
const opzioni = new Set(process.argv.slice(2));
const log = (riga: string) => console.log(`[demo] ${riga}`);
const percorso = (p: string) => relative(RADICE, p).split("\\").join("/");

const figli: ProcessoFiglio[] = [];
let postgres: PostgresDemo | null = null;
let chiusura: Promise<void> | null = null;

function chiudi(codice: number): Promise<void> {
  chiusura ??= (async () => {
    for (const f of figli) terminaAlbero(f);
    // Con Ctrl+C su Windows Postgres riceve l'evento e si chiude da solo: `stop()` attenderebbe per sempre.
    await Promise.race([postgres?.ferma().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    process.exit(codice);
  })();
  return chiusura;
}

process.on("SIGINT", () => void chiudi(0));
process.on("SIGTERM", () => void chiudi(0));
// Ultima difesa se il processo esce per altre vie (per esempio l'hook di uscita di embedded-postgres).
process.on("exit", () => {
  for (const f of figli) terminaAlbero(f);
});

function portaValida(valore: string | undefined): number | null {
  const n = Number(valore);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

async function principale() {
  if (opzioni.has("--reset") && existsSync(CARTELLA_DEMO)) {
    log(`cancello ${percorso(CARTELLA_DEMO)} (database, chiavi e sessione della demo)`);
    rmSync(CARTELLA_DEMO, { recursive: true, force: true });
  }

  const salvato = leggiFileAmbiente();
  // Non salvata tra un avvio e l'altro: stessa regola di `apps/web/e2e/demo.ts` e di `pnpm demo:browser`.
  const portaWeb = portaValida(process.env.EC_DEMO_PORTA) ?? PORTA_WEB_PREDEFINITA;
  let portaPostgres = portaValida(salvato.EC_DEMO_PORTA_POSTGRES) ?? (await portaLibera());
  if (portaPostgres === null) throw new ErroreDemo("nessuna_porta_libera");
  let { env, generate } = completaAmbiente(salvato, { web: portaWeb, postgres: portaPostgres });
  if ((await statoPorta(portaPostgres, env.EC_DATABASE_URL!)).tipo === "occupata") {
    const nuova = await portaLibera();
    if (nuova === null) throw new ErroreDemo("nessuna_porta_libera");
    log(`porta ${portaPostgres} occupata da un altro processo: Postgres demo passa alla ${nuova}`);
    portaPostgres = nuova;
    ({ env } = completaAmbiente(env, { web: portaWeb, postgres: portaPostgres }));
  }
  scriviFileAmbiente(env);
  if (generate.length > 0) log(`generati valori casuali per ${generate.join(", ")} in ${percorso(FILE_AMBIENTE)} (mai stampati)`);

  // Prima di avviare qualsiasi cosa: stessa regola di web e worker, più l'obbligo della modalità finta.
  const envPreparazione = ambienteDiPreparazione(env);
  configurazioneFinta(envPreparazione);

  const soloPreparazione = opzioni.has("--prepara");
  if (!soloPreparazione && (await portaLibera(portaWeb)) === null) throw new ErroreDemo(`porta_web_${portaWeb}_occupata`);

  postgres = await avviaPostgres({
    porta: portaPostgres,
    utente: UTENTE_POSTGRES,
    password: env.EC_DEMO_PASSWORD_POSTGRES!,
    url: env.EC_DATABASE_URL!,
    log,
  });
  log(`Postgres incorporato sulla porta ${portaPostgres}, migrazioni applicate`);

  const esito = await preparaDatiDemo(envPreparazione, log);
  const aree = Object.entries(esito.aree)
    .map(([area, n]) => `${area} ${n}`)
    .join(", ");
  log(`home: ${aree}; News ${esito.news} (voci del riepilogo ${esito.vociRiepilogo}); avvisi ${esito.avvisi}`);
  if (esito.news === 0) log("nessuna News nelle ultime 24 ore: la posta sintetica è datata al primo avvio, `pnpm demo:reset` la rigenera");
  log(`utente ${EMAIL_DEMO}, chiave OpenRouter finta ${ultimeCifre(env.EC_DEMO_CHIAVE_OPENROUTER!)}`);
  log(`sessione Better Auth (${esito.sessione.nomeCookie}) salvata in ${percorso(FILE_SESSIONE)}, scade il ${esito.sessione.scadenza.toISOString()}`);

  if (soloPreparazione) {
    await postgres.ferma();
    return;
  }

  const envApp = ambienteDelleApp(env);
  const tsx = import.meta.resolve("tsx");
  figli.push(avviaProcesso("worker", ["--import", tsx, "src/main.ts"], { cwd: CARTELLA_WORKER, env: { ...envApp, LOG_LEVEL: process.env.LOG_LEVEL ?? "info" } }));
  const next = createRequire(join(CARTELLA_WEB, "package.json")).resolve("next/dist/bin/next");
  figli.push(avviaProcesso("web", [next, "dev", "--port", String(portaWeb), "--hostname", "localhost"], { cwd: CARTELLA_WEB, env: envApp }));
  for (const { nome, figlio } of figli) {
    figlio.on("exit", (codice, segnale) => {
      if (chiusura) return;
      log(`${nome} terminato (${codice ?? segnale}): chiudo la demo`);
      void chiudi(1);
    });
  }
  log(`web su ${env.BETTER_AUTH_URL} e worker in modalità finta; Ctrl+C per fermare tutto`);
  log("browser già autenticato: `pnpm demo:browser` (con la demo avviata); test E2E: `pnpm test:e2e`");
}

principale().catch(async (errore: unknown) => {
  const codice = sintesiErrore(errore);
  console.error(`[demo] errore: ${codice}`);
  if (codice === "cartella_postgres_incompleta" || codice === "avvio_postgres_fallito") {
    console.error("[demo] se il database demo è danneggiato: `pnpm demo:reset`");
  }
  await chiudi(1);
});
