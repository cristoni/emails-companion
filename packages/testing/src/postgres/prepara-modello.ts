import { applicaMigrazioni } from "@ec/db/migrazioni";

/** Applica le migrazioni del dominio e di graphile-worker al database modello. */
export async function preparaDatabaseModello(urlModello: string): Promise<void> {
  await applicaMigrazioni(urlModello);
}
