import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

export const UTENTE_TEST = "postgres";
export const PASSWORD_TEST = "postgres";
export const DATABASE_MODELLO = "ec_modello";

export interface ClusterAvviato {
  porta: number;
  urlAmministrazione: string;
  urlModello: string;
  ferma(): Promise<void>;
}

async function portaLibera(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const indirizzo = server.address();
      if (indirizzo === null || typeof indirizzo === "string") {
        reject(new Error("porta non disponibile"));
        return;
      }
      server.close(() => resolve(indirizzo.port));
    });
  });
}

export function urlDatabase(porta: number, database: string): string {
  return `postgres://${UTENTE_TEST}:${PASSWORD_TEST}@127.0.0.1:${porta}/${database}`;
}

/**
 * Avvia un Postgres reale incorporato su una porta casuale.
 * Su Windows con impostazioni locali italiane initdb userebbe WIN1252:
 * UTF8 e locale C sono obbligatori per non corrompere il testo delle email.
 */
export async function avviaCluster(
  preparaModello?: (urlModello: string) => Promise<void>,
): Promise<ClusterAvviato> {
  const cartella = await mkdtemp(join(tmpdir(), "ec-pg-"));
  const porta = await portaLibera();
  const cluster = new EmbeddedPostgres({
    databaseDir: cartella,
    port: porta,
    user: UTENTE_TEST,
    password: PASSWORD_TEST,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: () => {},
  });
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase(DATABASE_MODELLO);
  const urlModello = urlDatabase(porta, DATABASE_MODELLO);
  if (preparaModello) await preparaModello(urlModello);

  return {
    porta,
    urlAmministrazione: urlDatabase(porta, "postgres"),
    urlModello,
    async ferma() {
      await cluster.stop();
      await rm(cartella, { recursive: true, force: true }).catch(() => {});
    },
  };
}

let contatore = 0;

/**
 * Crea un database isolato copiando il modello già migrato.
 * Il modello non deve avere connessioni aperte durante la copia.
 */
export async function creaDatabaseIsolato(urlAmministrazione: string, porta: number): Promise<string> {
  contatore += 1;
  const nome = `ec_t_${process.pid}_${Date.now().toString(36)}_${contatore}`;
  const client = new pg.Client({ connectionString: urlAmministrazione });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${nome}" TEMPLATE "${DATABASE_MODELLO}"`);
  } finally {
    await client.end();
  }
  return urlDatabase(porta, nome);
}
