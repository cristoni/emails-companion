import { describe, expect, it } from "vitest";
import type { Connessione } from "@ec/db";
import { ambienteDelleApp, ambienteDiPreparazione, analizzaAmbiente, completaAmbiente, serializzaAmbiente } from "../src/ambiente";
import { creaAuthDiProva } from "../src/auth-di-prova";
import { configurazioneFinta, sintesiErrore } from "../src/guardia";

const porte = { web: 3100, postgres: 54321 };
const { env: generato } = completaAmbiente({}, porte);
/** Ambiente della demo come lo vedono web e worker, senza ereditare la shell di chi esegue i test. */
const demo = ambienteDiPreparazione(generato, {});
const connessioneMai = {} as Connessione;

describe("guardia della demo: solo modalità finta, mai in produzione", () => {
  it("accetta l'ambiente generato", () => {
    expect(configurazioneFinta(demo).modalita).toBe("finta");
  });

  it.each([
    ["Vercel in produzione", { VERCEL_ENV: "production" }],
    ["Railway in produzione", { RAILWAY_ENVIRONMENT_NAME: "production" }],
    ["ambiente dichiarato di produzione", { EC_AMBIENTE: "produzione" }],
    ["segreto OAuth di Google presente", { GOOGLE_CLIENT_SECRET: "segreto-reale" }],
    ["chiave principale marcata di produzione", { EC_CHIAVE_PRINCIPALE_ATTIVA: "produzione" }],
    ["NODE_ENV=production", { NODE_ENV: "production" }],
  ])("rifiuta: %s", (_caso, variazione) => {
    expect(() => configurazioneFinta({ ...demo, ...variazione })).toThrow();
  });

  it("rifiuta la modalità reale anche con una configurazione Google completa", () => {
    const reale = { ...demo, APP_MODE: undefined, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "segreto", GOOGLE_REDIRECT_URI_CASELLE: "http://localhost/cb" };
    expect(() => configurazioneFinta(reale)).toThrow("demo_solo_in_modalita_finta");
  });

  // Percorso reale della demo: la shell dello sviluppatore passa da `ambienteDiPreparazione`, che forza
  // APP_MODE=fake, la chiave attiva 1 e svuota il segreto OAuth. Restano efficaci i marcatori di
  // produzione e NODE_ENV, che quindi devono bloccare anche arrivando dalla shell.
  it.each([
    ["Vercel in produzione", { VERCEL_ENV: "production" }],
    ["Railway in produzione", { RAILWAY_ENVIRONMENT_NAME: "production" }],
    ["ambiente dichiarato di produzione", { EC_AMBIENTE: "produzione" }],
    ["NODE_ENV=production", { NODE_ENV: "production" }],
  ])("rifiuta dalla shell dello sviluppatore: %s", (_caso, shell) => {
    const env = ambienteDiPreparazione(generato, shell);
    expect(() => configurazioneFinta(env)).toThrow();
    expect(() => creaAuthDiProva(env, connessioneMai)).toThrow();
  });

  it("i segreti reali della shell non arrivano alla demo: sono svuotati, non usati", () => {
    const env = ambienteDiPreparazione(generato, { GOOGLE_CLIENT_SECRET: "segreto-reale", EC_CHIAVE_PRINCIPALE_ATTIVA: "produzione", EC_CHIAVE_PRINCIPALE_V12: "vecchia" });
    expect(env.GOOGLE_CLIENT_SECRET).toBe("");
    expect(env.EC_CHIAVE_PRINCIPALE_ATTIVA).toBe("1");
    expect(env.EC_CHIAVE_PRINCIPALE_V12).toBe("");
    const cfg = configurazioneFinta(env);
    expect(cfg.google).toBeNull();
    expect(Object.keys(cfg.chiavi.chiaviPrincipali)).toEqual(["1"]);
    expect(cfg.databaseUrl).toMatch(/^postgres:\/\/[^@]+@127\.0\.0\.1:\d+\//);
  });

  it("l'istanza di Better Auth con il plugin di test non nasce fuori dalla modalità finta", () => {
    expect(() => creaAuthDiProva({ ...demo, APP_MODE: undefined }, connessioneMai)).toThrow();
    expect(() => creaAuthDiProva({ ...demo, VERCEL_ENV: "production" }, connessioneMai)).toThrow();
  });
});

describe("errori stampati dalla demo", () => {
  it("solo codice o prima riga: mai i parametri di una query fallita", () => {
    const query = new Error("Failed query: insert into auth_sessione values ($1)\nparams: token-segreto", { cause: Object.assign(new Error("x"), { code: "23505" }) });
    query.name = "DrizzleQueryError";
    expect(sintesiErrore(query)).toBe("DrizzleQueryError: Failed query: insert into auth_sessione values ($1) (causa 23505)");
    expect(sintesiErrore(Object.assign(new Error("dettagli"), { codice: "chiave_non_valida" }))).toBe("chiave_non_valida");
    expect(sintesiErrore("stringa")).toBe("errore_sconosciuto");
  });
});

describe("ambiente generato", () => {
  it("chiavi casuali, distinte e conservate tra un avvio e l'altro", () => {
    const { env: altro } = completaAmbiente({}, porte);
    expect(altro.EC_CHIAVE_PRINCIPALE_V1).not.toBe(generato.EC_CHIAVE_PRINCIPALE_V1);
    expect(generato.EC_CHIAVE_PRINCIPALE_V1).not.toBe(generato.EC_CHIAVE_INDICI_GLOBALI);
    const riletto = completaAmbiente(analizzaAmbiente(serializzaAmbiente(generato)), { web: 3200, postgres: 54400 });
    expect(riletto.generate).toEqual([]);
    expect(riletto.env.EC_CHIAVE_PRINCIPALE_V1).toBe(generato.EC_CHIAVE_PRINCIPALE_V1);
    expect(riletto.env.BETTER_AUTH_SECRET).toBe(generato.BETTER_AUTH_SECRET);
    expect(riletto.env.BETTER_AUTH_URL).toBe("http://localhost:3200");
    expect(riletto.env.EC_DATABASE_URL).toContain(":54400/");
  });

  it("web e worker non ricevono la chiave finta né segreti ereditati dalla shell", () => {
    const app = ambienteDelleApp(generato, { GOOGLE_CLIENT_SECRET: "dalla-shell", EC_CHIAVE_PRINCIPALE_V2: "vecchia", EC_DEMO_QUALSIASI: "x", PATH: "/bin" });
    expect(app.EC_DEMO_CHIAVE_OPENROUTER).toBeUndefined();
    expect(app.EC_DEMO_PASSWORD_POSTGRES).toBeUndefined();
    expect(app.EC_DEMO_QUALSIASI).toBeUndefined();
    expect(app.GOOGLE_CLIENT_SECRET).toBe("");
    expect(app.EC_CHIAVE_PRINCIPALE_V2).toBe("");
    expect(app.PATH).toBe("/bin");
    expect(app.APP_MODE).toBe("fake");
    expect(Object.values(app)).not.toContain(generato.EC_DEMO_CHIAVE_OPENROUTER);
  });

  it("la chiave finta ha il formato accettato dall'app", () => {
    expect(generato.EC_DEMO_CHIAVE_OPENROUTER).toMatch(/^sk-or-[A-Za-z0-9_-]{16,}$/);
  });
});
