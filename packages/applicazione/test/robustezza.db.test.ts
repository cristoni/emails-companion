import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { impostazioni, operativo, posta, sincronizzazione } from "@ec/db";
import { confermaImportazione, salvaChiaveOpenRouter } from "../src";
import { creaScenario, type Scenario } from "./support/scenario";

let s: Scenario;
beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
});

const MINUTO = 60 * 1000;

function classificazione(categoria = "operativa", urgente = false) {
  return () => ({
    output: {
      categoria,
      urgente,
      base_urgenza: "dedotto",
      priorita: "media",
      motivazione: "m",
      titolo_situazione: "Titolo",
      descrizione_situazione: "Descrizione",
      evidenze: [],
    },
  });
}

function estrazioneUnElemento(descrizione: string, citazione: string) {
  return () => ({
    output: {
      elementi: [{ esito: "nuovo", riferimento: null, descrizione, scadenza_iso: null, scadenza_citazione: null, priorita: "media", urgente: false, base: "rilevato", evidenze: [{ email: "e1", citazione }] }],
      titolo_situazione: null,
      descrizione_situazione: null,
    },
  });
}

async function righe<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const r = await s.db.execute(query);
  return (r as unknown as { rows: T[] }).rows;
}

async function sincronizza() {
  s.orologio.avanza(2 * MINUTO);
  s.coda.aggiungi("pianifica_sincronizzazioni", {});
  await s.eseguiJob();
}

describe("robustezza della pipeline", () => {
  it("la stessa email in due caselle dell'utente conta una volta e viene analizzata una volta", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella: personale } = await s.collegaGmail(utente, "anna@esempio.it");
    const { casella: lavoro } = await s.collegaGmail(utente, "anna@lavoro.it");
    await s.eseguiJob();
    s.modelli.quando("classificazione_priorita", classificazione("informativa")).quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }));
    const comune = { da: "team@cliente.it", a: ["anna@esempio.it", "anna@lavoro.it"], oggetto: "Aggiornamento", testo: "Ecco l'aggiornamento.", il: s.orologio.ora(), messageId: "agg-1@cliente.it" };
    personale.ricevi(comune);
    lavoro.ricevi(comune);
    await sincronizza();
    const email = await righe<{ id: string }>(sql`select id from email`);
    const copie = await righe<{ id: string }>(sql`select id from email_copia`);
    expect(email).toHaveLength(1);
    expect(copie).toHaveLength(2);
    expect(s.modelli.chiamateDi("classificazione_priorita")).toHaveLength(1);
  });

  it("con credito esaurito la sincronizzazione continua, l'analisi va in pausa e riprende con una chiave valida", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    s.modelli.quando("classificazione_priorita", () => ({ errore: "credito_esaurito" }));
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "Report", testo: "Mi mandi il report?", il: s.orologio.ora() });
    await sincronizza();
    expect(await righe(sql`select id from email`)).toHaveLength(1);
    const pause = await s.perUtente(utente, (ctx) => impostazioni.pauseAttive(ctx));
    expect(pause.map((p) => p.motivo)).toContain("credito_esaurito");
    const [stato] = await righe<{ stato: string; motivo: string }>(sql`select stato, motivo from stato_funzione_email where funzione = 'classificazione_priorita'`);
    expect(stato).toMatchObject({ stato: "in_pausa", motivo: "credito_esaurito" });

    casella.ricevi({ da: "luca@cliente.it", a: ["anna@esempio.it"], oggetto: "Altro", testo: "Altro messaggio", il: s.orologio.ora() });
    await sincronizza();
    expect(await righe(sql`select id from email`)).toHaveLength(2);
    const chiamatePrima = s.modelli.chiamate.length;
    expect(chiamatePrima).toBe(1);

    s.modelli
      .quando("classificazione_priorita", classificazione())
      .quando("estrazione_attivita", estrazioneUnElemento("Mandare il report", "Mi mandi il report?"))
      .quando("attese_risposte", () => ({ output: { richieste: [], collegamenti: [], valutazioni: [], completamenti: [], titolo_situazione: null, descrizione_situazione: null } }));
    await s.perUtente(utente, (ctx) => salvaChiaveOpenRouter(s.dip, ctx, "sk-or-v1-nuovachiavevalida0123456789"));
    await s.eseguiJob();
    expect(await s.perUtente(utente, (ctx) => impostazioni.pauseAttive(ctx))).toHaveLength(0);
    const aperte = await s.perUtente(utente, (ctx) => operativo.attivitaAperteDellUtente(ctx));
    expect(aperte.map((a) => a.descrizione)).toContain("Mandare il report");
  });

  it("un utente non vede i dati di un altro e non può collegare la sua casella", async () => {
    const anna = await s.creaUtente("anna@esempio.it");
    const bruno = await s.creaUtente("bruno@esempio.it");
    const { casella } = await s.collegaGmail(anna, "anna@esempio.it");
    await s.eseguiJob();
    s.modelli.quando("classificazione_priorita", classificazione()).quando("estrazione_attivita", estrazioneUnElemento("Mandare il report", "Mi mandi il report?"));
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "Report", testo: "Mi mandi il report?", il: s.orologio.ora() });
    await sincronizza();

    expect(await s.perUtente(anna, (ctx) => operativo.idSituazioniVisibili(ctx))).toHaveLength(1);
    expect(await s.perUtente(bruno, (ctx) => operativo.idSituazioniVisibili(ctx))).toHaveLength(0);
    const [emailAnna] = await righe<{ id: string }>(sql`select id from email`);
    expect(await s.perUtente(bruno, (ctx) => posta.leggi(ctx, emailAnna!.id))).toBeNull();

    const tentativo = await s.collegaGmail(bruno, "anna@esempio.it");
    expect(tentativo.esito.tipo).toBe("account_di_altro_utente");
  });

  it("un cursore scaduto porta a una risincronizzazione che non perde né duplica email", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella, casellaId } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    s.modelli.quando("classificazione_priorita", classificazione("informativa")).quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }));
    casella.ricevi({ da: "a@x.it", a: ["anna@esempio.it"], oggetto: "1", testo: "uno", il: s.orologio.ora() });
    await sincronizza();
    casella.ricevi({ da: "b@x.it", a: ["anna@esempio.it"], oggetto: "2", testo: "due", il: s.orologio.ora() });
    casella.scadiCursori();
    await sincronizza();
    expect(await righe(sql`select id from email`)).toHaveLength(2);
    const stato = await s.perUtente(utente, (ctx) => sincronizzazione.leggi(ctx, casellaId!));
    expect(stato?.cursoreProvvisorio).toBeNull();
    expect(Number(stato?.cursore)).toBeGreaterThan(0);
  });

  it("l'importazione iniziale ricostruisce le Situazioni in ordine cronologico solo a fine analisi", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const casellaFinta = s.casella("anna@esempio.it");
    const t0 = s.orologio.ora().getTime();
    casellaFinta.ricevi({ da: "anna@esempio.it", a: ["marco@cliente.it"], oggetto: "Dati", testo: "Puoi mandarmi i dati di agosto?", il: new Date(t0 - 3 * 24 * 60 * MINUTO), thread: "t1" });
    casellaFinta.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "Re: Dati", testo: "Ecco i dati di agosto.", il: new Date(t0 - 2 * 24 * 60 * MINUTO), thread: "t1" });
    const { casellaId } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    s.modelli
      .quando("classificazione_priorita", classificazione())
      .quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }))
      .quando("attese_risposte", (dati) =>
        dati.email.direzione === "uscita"
          ? {
              output: {
                richieste: [{ esito: "nuovo", riferimento: null, destinatari: ["marco@cliente.it"], oggetto: "Dati di agosto", data_attesa_iso: null, data_attesa_citazione: null, requisiti: [], sollecito_di: null, base: "rilevato", evidenze: [{ email: "e1", citazione: "Puoi mandarmi i dati di agosto?" }] }],
                collegamenti: [],
                valutazioni: [],
                completamenti: [],
                titolo_situazione: "Dati di agosto",
                descrizione_situazione: null,
              },
            }
          : {
              output: {
                richieste: [],
                collegamenti: [],
                valutazioni: dati.attese_candidate.map((w: { alias: string }) => ({
                  attesa: w.alias,
                  valutazione: "completa",
                  requisiti: [{ requisito: `${w.alias}r1`, soddisfatto: true, evidenze: [{ email: "e1", citazione: "Ecco i dati di agosto." }] }],
                  motivazione: "m",
                })),
                completamenti: [],
                titolo_situazione: null,
                descrizione_situazione: null,
              },
            },
      );
    const confermata = await s.perUtente(utente, (ctx) => confermaImportazione(s.dip, ctx, casellaId!));
    expect(confermata).toBe(true);
    await s.eseguiJob();
    const aggregati = await s.perUtente(utente, async (ctx) => operativo.aggregati(ctx, await operativo.idSituazioniVisibili(ctx)));
    expect(aggregati).toHaveLength(1);
    expect(aggregati[0]!.risposte).toHaveLength(1);
    expect(aggregati[0]!.collegamenti.find((c) => c.origine === "thread" && c.ruolo === "risposta")).toBeTruthy();
    const stato = await s.perUtente(utente, (ctx) => sincronizzazione.leggi(ctx, casellaId!));
    expect(stato?.faseImportazione).toBe("completata");
  });

  it("una risposta inviata da Gmail completa l'Attività solo con un'evidenza verificata", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    s.modelli
      .quando("classificazione_priorita", classificazione())
      .quando("estrazione_attivita", (dati) =>
        dati.email.direzione === "entrata" ? estrazioneUnElemento("Mandare il report", "Mi mandi il report?")() : { output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } },
      )
      .quando("attese_risposte", (dati) => ({
        output: {
          richieste: [],
          collegamenti: [],
          valutazioni: [],
          completamenti: dati.attivita_candidate.map((t: { alias: string }) => ({ attivita: t.alias, esito: "completata", nuova_scadenza_iso: null, evidenze: [{ email: "e1", citazione: "Ecco il report in allegato" }] })),
          titolo_situazione: null,
          descrizione_situazione: null,
        },
      }));
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "Report", testo: "Mi mandi il report?", il: s.orologio.ora(), thread: "t9", messageId: "q@cliente.it" });
    await sincronizza();
    casella.ricevi({ da: "anna@esempio.it", a: ["marco@cliente.it"], oggetto: "Re: Report", testo: "Ecco il report in allegato", il: s.orologio.ora(), thread: "t9", inReplyTo: "q@cliente.it" });
    await sincronizza();
    const [agg] = await s.perUtente(utente, async (ctx) => operativo.aggregati(ctx, await operativo.idSituazioniVisibili(ctx)));
    const attivita = agg!.attivita[0]!;
    expect(attivita.stato).toBe("completata");
    expect(attivita.completataDa).toBe("ai");
  });
});
