import { defineConfig, devices } from "@playwright/test";
import { PORTA, URL_BASE } from "./e2e/demo";

/**
 * E2E in modalità finta contro l'ambiente demo (`pnpm demo`): Postgres incorporato, utente sintetico,
 * web e worker simulati. Il server web è la demo stessa, che prima di avviare `next dev` scrive la
 * sessione dell'utente demo in `.demo/sessione-playwright.json`; i test autenticati la caricano con
 * `test.use({ storageState: FILE_SESSIONE })`, gli altri partono senza cookie. Nessuna route di accesso
 * di prova esiste nella webapp.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // La prima richiesta a una pagina compila la route in `next dev`.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: URL_BASE,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm -w demo",
    url: `${URL_BASE}/sign-in`,
    env: { EC_DEMO_PORTA: String(PORTA) },
    // Primo avvio: initdb, migrazioni, pipeline dell'utente demo e compilazione di next dev.
    timeout: 5 * 60_000,
    reuseExistingServer: !process.env.CI,
    // POSIX: la demo riceve SIGTERM e ferma web, worker (in gruppi di processi propri) e Postgres.
    // Windows ignora l'opzione e chiude l'intero albero di processi con taskkill.
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    stdout: "pipe",
    stderr: "pipe",
  },
});
