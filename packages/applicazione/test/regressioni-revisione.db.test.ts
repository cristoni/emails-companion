import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { authAccount } from "@ec/db/schema";
import { posta, sincronizzazione } from "@ec/db";
import { registraConsensoGoogle, SCOPE_INVIO, SCOPE_LETTURA } from "../src";
import { creaScenario, type Scenario } from "./support/scenario";

/** Regressioni dei difetti trovati nelle revisioni avversariali del ramo. */
let s: Scenario;
beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
});

const MINUTO = 60 * 1000;

const CLASSIFICAZIONE = {
  categoria: "operativa",
  urgente: false,
  base_urgenza: "dedotto",
  priorita: "media",
  motivazione: "m",
  titolo_situazione: "Titolo",
  descrizione_situazione: "Descrizione",
  evidenze: [],
};

function scriptSenzaElementi() {
  s.modelli
    .quando("classificazione_priorita", () => ({ output: CLASSIFICAZIONE }))
    .quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }));
}

async function sincronizza() {
  s.orologio.avanza(2 * MINUTO);
  s.coda.aggiungi("pianifica_sincronizzazioni", {});
  await s.eseguiJob();
}

async function righe<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  return ((await s.db.execute(query)) as unknown as { rows: T[] }).rows;
}

describe("casella autorizzata senza stato di sincronizzazione", () => {
  it("un primo consenso senza refresh token, poi Ricollega: la sincronizzazione inizializza la casella", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const primo = await s.collegaGmail(utente, "anna@esempio.it", { refresh: false });
    expect(primo.esito).toMatchObject({ tipo: "collegata", stato: "da_ricollegare" });
    const casellaId = primo.casellaId!;
    expect(await s.perUtente(utente, (ctx) => sincronizzazione.leggi(ctx, casellaId))).toBeNull();

    const secondo = await s.collegaGmail(utente, "anna@esempio.it");
    expect(secondo.esito).toMatchObject({ tipo: "collegata", stato: "collegata", nuova: false });
    await s.eseguiJob();
    const stato = await s.perUtente(utente, (ctx) => sincronizzazione.leggi(ctx, casellaId));
    expect(stato?.faseImportazione).toBe("stimata");
  });

  it("se la lettura del cursore iniziale fallisce, il consenso resta valido e la casella viene inizializzata dopo", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    s.connettori.casella("anna@esempio.it");
    const esito = await registraConsensoGoogle(
      s.dip,
      s.dip.unita,
      utente,
      {
        sub: "sub-anna",
        email: "anna@esempio.it",
        scopeConcessi: ["openid", "email", SCOPE_LETTURA, SCOPE_INVIO],
        accessToken: "ya29.finto",
        scadenzaAccesso: new Date(s.orologio.ora().getTime() + 3600_000),
        refreshToken: "1//refresh-finto",
        origine: "accesso",
      },
      async () => {
        throw new Error("gmail_non_disponibile");
      },
    );
    expect(esito).toMatchObject({ tipo: "collegata", stato: "collegata", nuova: true });
    const casellaId = esito.tipo === "collegata" ? esito.casellaId : "";
    expect(await s.perUtente(utente, (ctx) => sincronizzazione.leggi(ctx, casellaId))).toBeNull();

    // Anche senza il job accodato dal consenso, il pianificatore considera dovuta la casella.
    s.coda.pendenti.length = 0;
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await s.eseguiJob();
    expect((await s.perUtente(utente, (ctx) => sincronizzazione.leggi(ctx, casellaId)))?.faseImportazione).toBe("stimata");
  });
});

describe("riconciliatore con un errore temporaneo del modello", () => {
  it("un'email rinviata ferma il giro: una sola chiamata e il nuovo tentativo resta programmato più tardi", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    scriptSenzaElementi();
    s.modelli.quando("attese_risposte", () => ({ errore: "temporaneo", riprovaDopoMs: 10 * MINUTO }));

    casella.ricevi({ da: "anna@esempio.it", a: ["marco@cliente.it"], oggetto: "Dati", testo: "Puoi mandarmi i dati di agosto?", il: s.orologio.ora() });
    await sincronizza();

    expect(s.modelli.chiamateDi("attese_risposte")).toHaveLength(1);
    const riconciliazione = s.coda.pendenti.filter((j) => j.nome === "riconcilia_utente");
    expect(riconciliazione).toHaveLength(1);
    expect(riconciliazione[0]!.eseguiIl.getTime()).toBeGreaterThan(s.orologio.ora().getTime() + 5 * MINUTO);
  });
});

describe("invocazioni dei modelli", () => {
  it("due email con gli stessi campi visibili al modello non condividono l'analisi", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    scriptSenzaElementi();
    const uguale = { da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "Ciao", testo: "Stesso testo.", il: s.orologio.ora() };
    casella.ricevi({ ...uguale, messageId: "a@cliente.it" });
    casella.ricevi({ ...uguale, messageId: "b@cliente.it" });
    await sincronizza();

    expect(s.modelli.chiamateDi("classificazione_priorita")).toHaveLength(2);
    const analisi = await righe<{ email_id: string }>(sql`select email_id from analisi_ai where utente_id = ${utente} and funzione = 'classificazione_priorita'`);
    expect(new Set(analisi.map((a) => a.email_id)).size).toBe(2);
  });

  it("una risposta scartata e la sua ripetizione sono entrambe contate nel consumo", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    scriptSenzaElementi();
    let chiamate = 0;
    s.modelli.quando("classificazione_priorita", () => (++chiamate === 1 ? { output: { non: "valido" } } : { output: CLASSIFICAZIONE }));
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "Ciao", testo: "Un saluto.", il: s.orologio.ora() });
    await sincronizza();

    expect(chiamate).toBe(2);
    const [analisi] = await righe<{ stato: string; costo: string; token_ingresso: number; token_uscita: number }>(
      sql`select stato, costo, token_ingresso, token_uscita from analisi_ai where utente_id = ${utente} and funzione = 'classificazione_priorita'`,
    );
    expect(analisi).toMatchObject({ stato: "completata", token_ingresso: 200, token_uscita: 100 });
    expect(Number(analisi!.costo)).toBeCloseTo(0.0002, 10);
    const email = await s.perUtente(utente, (ctx) => posta.elenco(ctx, { limite: 5 }));
    expect(email).toHaveLength(1);
  });
});

describe("token del provider d'identità", () => {
  it("il database rifiuta qualunque token in chiaro in auth_account", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const base = { id: crypto.randomUUID(), accountId: "sub-anna", providerId: "google", userId: utente };
    await expect(s.db.insert(authAccount).values({ ...base, accessToken: "ya29.in-chiaro" })).rejects.toThrow();
    await expect(s.db.insert(authAccount).values({ ...base, id: crypto.randomUUID(), refreshToken: "1//in-chiaro" })).rejects.toThrow();
    await s.db.insert(authAccount).values({ ...base, id: crypto.randomUUID() });
    await expect(s.db.update(authAccount).set({ accessToken: "ya29.in-chiaro" }).where(sql`${authAccount.userId} = ${utente}`)).rejects.toThrow();
  });
});
