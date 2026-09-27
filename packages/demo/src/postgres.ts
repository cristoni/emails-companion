import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { applicaMigrazioni } from "@ec/db/migrazioni";
import { ErroreDemo } from "./guardia";
import { CARTELLA_POSTGRES, NOME_DATABASE } from "./percorsi";

/** Porta libera su 127.0.0.1 (0 = qualunque); null se quella richiesta è occupata. */
export function portaLibera(porta = 0): Promise<number | null> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(null));
    server.listen(porta, "127.0.0.1", () => {
      const indirizzo = server.address();
      const trovata = indirizzo && typeof indirizzo !== "string" ? indirizzo.port : null;
      server.close(() => resolve(trovata));
    });
  });
}

async function raggiungibile(url: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

function urlAmministrazione(url: string): string {
  const u = new URL(url);
  u.pathname = "/postgres";
  return u.toString();
}

export interface PostgresDemo {
  /** true se il cluster era già in esecuzione (per esempio dopo un'interruzione brusca): non lo fermiamo noi. */
  riusato: boolean;
  ferma(): Promise<void>;
}

export type EsitoPorta = { tipo: "libera" } | { tipo: "nostro" } | { tipo: "occupata" };

/** Stato della porta salvata: libera, occupata dal cluster demo già avviato, oppure da altro. */
export async function statoPorta(porta: number, url: string): Promise<EsitoPorta> {
  if ((await portaLibera(porta)) !== null) return { tipo: "libera" };
  return (await raggiungibile(urlAmministrazione(url))) ? { tipo: "nostro" } : { tipo: "occupata" };
}

/**
 * Avvia (o riusa) il Postgres incorporato persistente in `.demo/postgres`, crea il database se manca e
 * applica le migrazioni del repository (Drizzle, poi graphile-worker), come il passo di rilascio.
 * UTF8 e locale C come nei test: su Windows con impostazioni italiane initdb userebbe WIN1252.
 */
export async function avviaPostgres(opzioni: { porta: number; utente: string; password: string; url: string; log: (riga: string) => void }): Promise<PostgresDemo> {
  const stato = await statoPorta(opzioni.porta, opzioni.url);
  if (stato.tipo === "occupata") throw new ErroreDemo("porta_postgres_occupata");

  let cluster: EmbeddedPostgres | null = null;
  if (stato.tipo === "libera") {
    const ultime: string[] = [];
    const registra = (messaggio: unknown) => {
      ultime.push(...String(messaggio).split(/\r?\n/).filter(Boolean));
      ultime.splice(0, Math.max(0, ultime.length - 30));
    };
    cluster = new EmbeddedPostgres({
      databaseDir: CARTELLA_POSTGRES,
      port: opzioni.porta,
      user: opzioni.utente,
      password: opzioni.password,
      authMethod: "scram-sha-256",
      persistent: true,
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
      onLog: registra,
      onError: registra,
    });
    try {
      if (!existsSync(join(CARTELLA_POSTGRES, "PG_VERSION"))) {
        if (existsSync(CARTELLA_POSTGRES) && readdirSync(CARTELLA_POSTGRES).length > 0) throw new ErroreDemo("cartella_postgres_incompleta");
        opzioni.log("inizializzo il cluster Postgres in .demo/postgres");
        await cluster.initialise();
      }
      await cluster.start();
    } catch (errore) {
      for (const riga of ultime) opzioni.log(`  postgres: ${riga}`);
      if (errore instanceof ErroreDemo) throw errore;
      throw new ErroreDemo("avvio_postgres_fallito");
    }
  } else {
    opzioni.log("Postgres demo già in esecuzione sulla porta salvata: lo riuso senza fermarlo alla fine");
  }

  const amministrazione = new pg.Client({ connectionString: urlAmministrazione(opzioni.url) });
  amministrazione.on("error", () => {});
  await amministrazione.connect();
  try {
    const esistente = await amministrazione.query("select 1 from pg_database where datname = $1", [NOME_DATABASE]);
    if (esistente.rowCount === 0) await amministrazione.query(`create database "${NOME_DATABASE}" encoding 'UTF8'`);
  } finally {
    await amministrazione.end();
  }
  await applicaMigrazioni(opzioni.url);

  const avviato = cluster;
  return {
    riusato: avviato === null,
    async ferma() {
      await avviato?.stop();
    },
  };
}
