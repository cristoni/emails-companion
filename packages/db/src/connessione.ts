import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transazione = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Esecutore = Database | Transazione;

export interface Connessione {
  db: Database;
  pool: pg.Pool;
  chiudi(): Promise<void>;
}

export interface OpzioniConnessione {
  connectionString: string;
  /** Certificato della CA di Supabase: non va messo sslmode nell'URL, che sovrascriverebbe questa opzione. */
  ca?: string;
  massimo?: number;
}

export function connetti(opzioni: OpzioniConnessione): Connessione {
  const pool = new pg.Pool({
    connectionString: opzioni.connectionString,
    ssl: opzioni.ca ? { ca: opzioni.ca } : undefined,
    max: opzioni.massimo ?? 5,
  });
  pool.on("error", () => {});
  pool.on("connect", (client) => client.on("error", () => {}));
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db, pool, chiudi: () => pool.end() };
}
