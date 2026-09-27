import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Collegamento con l'ambiente demo di `pnpm demo` (pacchetto `@ec/demo`): stessi percorsi in `.demo/`
 * alla radice del repository. Qui solo lettura di file: la webapp e i suoi test non importano strumenti
 * di test né creano sessioni (le crea la demo, in modalità finta).
 */
const CARTELLA_DEMO = join(import.meta.dirname, "..", "..", "..", ".demo");

export const FILE_SESSIONE = join(CARTELLA_DEMO, "sessione-playwright.json");
export const PORTA = Number(process.env.EC_DEMO_PORTA ?? 3100);
export const URL_BASE = `http://localhost:${PORTA}`;

/** Chiave OpenRouter finta dell'utente demo, letta solo per verificare che non compaia mai nelle risposte. */
export function chiaveOpenRouterFinta(): string {
  const testo = readFileSync(join(CARTELLA_DEMO, ".env.local"), "utf8");
  const chiave = /^EC_DEMO_CHIAVE_OPENROUTER=(.+)$/m.exec(testo)?.[1]?.trim();
  if (!chiave) throw new Error("chiave finta assente: avviare prima `pnpm demo`");
  return chiave;
}

type Lingua = "en" | "it";

/** Testo di un messaggio dell'interfaccia, dai file di traduzione (namespace = nome del file). */
export function messaggio(lingua: Lingua, namespace: string, chiave: string): string {
  const dati: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "..", "messages", lingua, `${namespace}.json`), "utf8"));
  const valore = chiave.split(".").reduce<unknown>((nodo, parte) => (nodo as Record<string, unknown> | undefined)?.[parte], dati);
  if (typeof valore !== "string") throw new Error(`messaggio mancante: ${lingua}/${namespace}.${chiave}`);
  return valore;
}
