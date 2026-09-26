import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { runMigrations } from "graphile-worker";
import pg from "pg";

const CARTELLA_MIGRAZIONI = fileURLToPath(new URL("../migrazioni", import.meta.url));
/** Identificativo del lock consultivo: una sola migrazione alla volta. */
const LOCK_MIGRAZIONI = 7_331_001;

/** Applica le migrazioni del dominio e poi quelle di graphile-worker, sotto lock consultivo. */
export async function applicaMigrazioni(connectionString: string, opzioni: { ssl?: pg.PoolConfig["ssl"] } = {}): Promise<void> {
  const pool = new pg.Pool({ connectionString, ssl: opzioni.ssl, max: 2 });
  pool.on("error", () => {});
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_MIGRAZIONI]);
    try {
      await migrate(drizzle({ client, casing: "snake_case" }), { migrationsFolder: CARTELLA_MIGRAZIONI });
      await runMigrations({ pgPool: pool });
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_MIGRAZIONI]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
