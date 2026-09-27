import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generaChiaveBase64 } from "@ec/crypto";
import { FILE_AMBIENTE, NOME_DATABASE, UTENTE_POSTGRES } from "./percorsi";

export type Ambiente = Record<string, string>;

/**
 * Variabili che web e worker ricevono dalla demo, oltre a quelle ereditate dalla shell. La chiave
 * OpenRouter finta e la password di Postgres restano fuori: servono solo alla preparazione e ai test.
 */
const PER_LE_APP = [
  "APP_MODE",
  "EC_DATABASE_URL",
  "EC_CHIAVE_PRINCIPALE_V1",
  "EC_CHIAVE_PRINCIPALE_ATTIVA",
  "EC_CHIAVE_INDICI_GLOBALI",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "EC_URL_APP",
] as const;

/**
 * Variabili che la shell o un `apps/web/.env*` dello sviluppatore potrebbero fornire e che non devono
 * arrivare alla demo: definite vuote, Next non le sovrascrive dai file `.env` e la configurazione le
 * tratta come assenti. Senza questo, un segreto OAuth reale farebbe rifiutare la modalità finta.
 */
const NEUTRALIZZATE = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI_CASELLE",
  "GMAIL_PUBSUB_TOPIC",
  "GMAIL_PUBSUB_SUBSCRIPTION",
  "GCP_SERVICE_ACCOUNT_JSON",
  "EC_DATABASE_CA",
  "EC_DATABASE_URL_MIGRAZIONI",
  ...Array.from({ length: 8 }, (_, i) => `EC_CHIAVE_PRINCIPALE_V${i + 2}`),
];

const INTESTAZIONE = [
  "# Ambiente demo in modalità finta, generato da `pnpm demo`. Solo sviluppo locale: mai committare,",
  "# mai riusare questi valori altrove. Le chiavi vanno conservate finché esiste .demo/postgres",
  "# (servono a leggere i dati cifrati); `pnpm demo:reset` cancella entrambi.",
];

/**
 * Completa l'ambiente: i segreti già presenti restano (cambiarli renderebbe illeggibili i dati cifrati
 * nel database demo), quelli mancanti sono generati a caso; porte e URL sono ricalcolati.
 */
export function completaAmbiente(esistente: Ambiente, porte: { web: number; postgres: number }): { env: Ambiente; generate: string[] } {
  const env: Ambiente = { ...esistente };
  const generate: string[] = [];
  const genera = (nome: string, valore: () => string) => {
    if (env[nome]) return;
    env[nome] = valore();
    generate.push(nome);
  };
  genera("EC_CHIAVE_PRINCIPALE_V1", generaChiaveBase64);
  genera("EC_CHIAVE_INDICI_GLOBALI", generaChiaveBase64);
  genera("BETTER_AUTH_SECRET", () => randomBytes(32).toString("base64url"));
  // Esadecimale: la password finisce nell'URL del database, dove + / = andrebbero codificati.
  genera("EC_DEMO_PASSWORD_POSTGRES", () => randomBytes(18).toString("hex"));
  // Chiave finta (il gateway euristico accetta qualunque chiave ben formata): il corpo casuale fa da
  // "canarino" per i test E2E che verificano che la chiave non compaia mai nelle risposte.
  genera("EC_DEMO_CHIAVE_OPENROUTER", () => `sk-or-v1-demo${randomBytes(24).toString("hex")}`);

  env.APP_MODE = "fake";
  env.EC_CHIAVE_PRINCIPALE_ATTIVA = "1";
  env.EC_DEMO_PORTA_WEB = String(porte.web);
  env.EC_DEMO_PORTA_POSTGRES = String(porte.postgres);
  env.EC_DATABASE_URL = `postgres://${UTENTE_POSTGRES}:${env.EC_DEMO_PASSWORD_POSTGRES}@127.0.0.1:${porte.postgres}/${NOME_DATABASE}`;
  // `localhost` e non 127.0.0.1: il dominio del cookie di sessione deriva da questo URL.
  env.BETTER_AUTH_URL = `http://localhost:${porte.web}`;
  env.EC_URL_APP = env.BETTER_AUTH_URL;
  return { env, generate };
}

export function analizzaAmbiente(testo: string): Ambiente {
  const env: Ambiente = {};
  for (const riga of testo.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(riga.trim());
    if (m) env[m[1]!] = m[2]!;
  }
  return env;
}

export function serializzaAmbiente(env: Ambiente): string {
  const righe = Object.keys(env)
    .sort()
    .map((nome) => `${nome}=${env[nome]}`);
  return [...INTESTAZIONE, "", ...righe, ""].join("\n");
}

/**
 * Ambiente per web e worker: shell dello sviluppatore, variabili della demo, variabili pericolose svuotate.
 * Oltre all'elenco fisso (che copre anche i file `.env` letti da Next), ogni altra versione della chiave
 * principale presente nella shell è svuotata: la demo cifra solo con la propria V1.
 */
export function ambienteDelleApp(env: Ambiente, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const risultato: NodeJS.ProcessEnv = { ...base };
  for (const nome of Object.keys(risultato)) {
    if (nome.startsWith("EC_DEMO_")) delete risultato[nome];
    else if (nome.startsWith("EC_CHIAVE_PRINCIPALE_V")) risultato[nome] = "";
  }
  for (const nome of NEUTRALIZZATE) risultato[nome] = "";
  for (const nome of PER_LE_APP) risultato[nome] = env[nome] ?? "";
  return risultato;
}

/** Ambiente con cui la demo stessa legge la configurazione (stesse regole delle app). */
export function ambienteDiPreparazione(env: Ambiente, base: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  return { ...ambienteDelleApp(env, base), ...env };
}

export function leggiFileAmbiente(): Ambiente {
  return existsSync(FILE_AMBIENTE) ? analizzaAmbiente(readFileSync(FILE_AMBIENTE, "utf8")) : {};
}

export function scriviFileAmbiente(env: Ambiente): void {
  mkdirSync(dirname(FILE_AMBIENTE), { recursive: true });
  writeFileSync(FILE_AMBIENTE, serializzaAmbiente(env), { mode: 0o600 });
  try {
    chmodSync(FILE_AMBIENTE, 0o600);
  } catch {
    // Su Windows i permessi POSIX non si applicano: la cartella resta comunque esclusa da git.
  }
}

/** Mai un valore intero nei log: solo le ultime cifre, e solo per ciò che l'interfaccia mostra già così. */
export function ultimeCifre(valore: string): string {
  return `…${valore.slice(-4)}`;
}
