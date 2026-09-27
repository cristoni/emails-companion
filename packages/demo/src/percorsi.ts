import { join } from "node:path";

/** Radice del repository: questo file sta in `packages/demo/src`. */
export const RADICE = join(import.meta.dirname, "..", "..", "..");

/**
 * Tutto lo stato dell'ambiente demo vive in `.demo/` alla radice, esclusa da git: database, variabili
 * con le chiavi generate e sessione di Playwright. `pnpm demo:reset` la cancella.
 */
export const CARTELLA_DEMO = join(RADICE, ".demo");
export const FILE_AMBIENTE = join(CARTELLA_DEMO, ".env.local");
export const CARTELLA_POSTGRES = join(CARTELLA_DEMO, "postgres");
/** storageState di Playwright con il cookie della sessione demo (percorso letto anche da `apps/web/e2e`). */
export const FILE_SESSIONE = join(CARTELLA_DEMO, "sessione-playwright.json");

export const CARTELLA_WEB = join(RADICE, "apps", "web");
export const CARTELLA_WORKER = join(RADICE, "apps", "worker");

export const PORTA_WEB_PREDEFINITA = 3100;
export const NOME_DATABASE = "ec_demo";
export const UTENTE_POSTGRES = "ec_demo";

/** Utente demo sintetico: dominio riservato, nessun dato reale. */
export const EMAIL_DEMO = "demo@esempio.example";
export const NOME_DEMO = "Demo";
