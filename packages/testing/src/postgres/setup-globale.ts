import type { TestProject } from "vitest/node";
import { avviaCluster } from "./cluster";

/**
 * Setup globale di Vitest: un solo cluster per esecuzione, con un database
 * modello migrato da cui ogni file di test copia il proprio database.
 * La preparazione dello schema viene aggiunta quando esistono le migrazioni.
 */
export default async function setupGlobale(project: TestProject) {
  const { preparaDatabaseModello } = await import("./prepara-modello");
  const cluster = await avviaCluster(preparaDatabaseModello);
  project.provide("pgUrlAmministrazione", cluster.urlAmministrazione);
  project.provide("pgPorta", cluster.porta);
  return async () => {
    await cluster.ferma();
  };
}
