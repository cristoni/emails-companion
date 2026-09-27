import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { operativo, posta } from "@ec/db";
import { annullaCorrezioni, cambiaCategoria, cambiaUrgenza } from "../src/correzioni";
import { vistaSituazione } from "../src/viste";
import { emailDellaSituazioneWeb } from "../src/web";
import { creaScenario, type Scenario } from "./support/scenario";

let s: Scenario;
beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
});

const ORA = 60 * 60 * 1000;
const MINUTO = 60 * 1000;

function classificazione(urgente: boolean) {
  return () => ({
    output: {
      categoria: "operativa",
      urgente,
      base_urgenza: "rilevato",
      priorita: "alta",
      motivazione: "Il mittente segnala un blocco in produzione.",
      titolo_situazione: "Server giù",
      descrizione_situazione: "Il server di produzione non risponde.",
      evidenze: [{ email: "e1", citazione: "Il server di produzione è giù", campo: "urgenza" }],
    },
  });
}

const nessunElemento = () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } });

/** Una richiesta inviata dall'utente genera un'Attesa: la Situazione nasce da un'email in uscita. */
const richiestaInviata = (dati: { email: { direzione: string } }) => ({
  output: {
    richieste:
      dati.email.direzione === "uscita"
        ? [
            {
              esito: "nuovo",
              riferimento: null,
              destinatari: ["marco@esempio.example"],
              oggetto: "Dati di agosto",
              data_attesa_iso: null,
              data_attesa_citazione: null,
              requisiti: ["ricavi"],
              sollecito_di: null,
              base: "rilevato",
              evidenze: [{ email: "e1", citazione: "puoi mandarmi i dati di agosto" }],
            },
          ]
        : [],
    collegamenti: [],
    valutazioni: [],
    completamenti: [],
    titolo_situazione: "Dati di agosto",
    descrizione_situazione: "Richiesta dei dati di agosto a Marco.",
  },
});

async function preparaUtente() {
  const utente = await s.creaUtente("anna@esempio.it");
  const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
  await s.eseguiJob();
  return { utente, casella };
}

async function sincronizza() {
  s.orologio.avanza(2 * MINUTO);
  s.coda.aggiungi("pianifica_sincronizzazioni", {});
  await s.eseguiJob();
}

async function ultimaEmail(utente: string): Promise<string> {
  const [id] = await s.perUtente(utente, async (ctx) => (await posta.elenco(ctx, { limite: 1 })).map((e) => e.id));
  return id!;
}

describe("dettaglio della Situazione: email d'origine e correzioni sulle email", () => {
  it("espone l'urgenza effettiva dell'origine e le correzioni attive annullabili dalla cronologia", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli
      .quando("classificazione_priorita", classificazione(true))
      .quando("estrazione_attivita", nessunElemento)
      .quando("attese_risposte", richiestaInviata);
    s.orologio.avanza(ORA);
    casella.ricevi({ da: "ops@esempio.example", a: ["anna@esempio.it"], oggetto: "Server giù", testo: "Ciao Anna,\nIl server di produzione è giù.\nOps", il: s.orologio.ora() });
    await sincronizza();
    const emailId = await ultimaEmail(utente);
    const situazioneId = (await s.perUtente(utente, (ctx) => operativo.situazionePerOrigine(ctx, emailId)))!;
    const vista = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, situazioneId)))!;
    const leggi = () =>
      s.perUtente(utente, (ctx) =>
        emailDellaSituazioneWeb(
          s.dip,
          ctx,
          vista.situazione.emailOrigineId,
          vista.fonti.map((f) => f.emailId),
        ),
      );

    let dati = await leggi();
    expect(dati.origine).toMatchObject({
      emailId,
      correggibile: true,
      urgente: true,
      urgenteAi: true,
      base: "rilevato",
      motivazione: "Il mittente segnala un blocco in produzione.",
      correzioni: [],
    });
    expect(dati.origine?.analisiId).toEqual(expect.any(String));
    expect(dati.origine?.evidenze).toEqual([expect.objectContaining({ emailId, citazione: "Il server di produzione è giù", verificata: true })]);
    // L'analisi dell'urgenza ha la sua voce nel pannello "Perché?" del dettaglio.
    expect(vista.perche.map((p) => p.analisiId)).toContain(dati.origine?.analisiId);
    expect(dati.correzioniEmail).toEqual([]);

    // L'utente toglie l'urgenza: la correzione è attiva e l'evento della cronologia la richiama.
    const esito = await s.perUtente(utente, (ctx) => cambiaUrgenza(s.dip, ctx, emailId, false));
    if (esito.codice !== "ok") throw new Error("atteso ok");
    dati = await leggi();
    expect(dati.origine).toMatchObject({ urgente: false, urgenteAi: true });
    expect(dati.origine?.correzioni.map((c) => c.id)).toEqual(esito.correzioni);
    expect(dati.correzioniEmail).toEqual([expect.objectContaining({ id: esito.correzioni[0], emailId, campo: "urgente", valore: false })]);
    const dopo = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, situazioneId)))!;
    const evento = dopo.eventi.find((e) => e.tipo === "urgenza_corretta");
    expect(evento?.riferimenti.correzione).toBe(esito.correzioni[0]);

    // Anche le altre correzioni sull'email (per esempio la categoria) sono elencate.
    const categoria = await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, emailId, "informativa"));
    if (categoria.codice !== "ok") throw new Error("atteso ok");
    dati = await leggi();
    expect(dati.correzioniEmail.map((c) => c.campo).sort()).toEqual(["categoria", "urgente"]);
    expect(dati.origine?.correzioni.map((c) => c.campo)).toEqual(["urgente"]);

    // Annullata, la correzione sparisce: la cronologia non offre più l'annullamento.
    expect((await s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, esito.correzioni))).codice).toBe("ok");
    dati = await leggi();
    expect(dati.origine).toMatchObject({ urgente: true, correzioni: [] });
    expect(dati.correzioniEmail.map((c) => c.id)).toEqual(categoria.correzioni);
  });

  it("un'origine in uscita non ha urgenza correggibile; id non validi o altrui vengono ignorati", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli
      .quando("classificazione_priorita", classificazione(false))
      .quando("estrazione_attivita", nessunElemento)
      .quando("attese_risposte", richiestaInviata);
    s.orologio.avanza(ORA);
    casella.ricevi({ da: "anna@esempio.it", a: ["marco@esempio.example"], oggetto: "Dati di agosto", testo: "Ciao Marco, puoi mandarmi i dati di agosto?", il: s.orologio.ora() });
    await sincronizza();
    const emailId = await ultimaEmail(utente);
    const situazioneId = (await s.perUtente(utente, (ctx) => operativo.situazionePerOrigine(ctx, emailId)))!;
    expect(situazioneId).toEqual(expect.any(String));

    const dati = await s.perUtente(utente, (ctx) => emailDellaSituazioneWeb(s.dip, ctx, emailId, ["non-un-id", emailId]));
    expect(dati.origine).toMatchObject({ emailId, correggibile: false, urgente: false });
    expect(dati.correzioniEmail).toEqual([]);

    // Un altro utente non vede nulla delle email di Anna.
    const altro = await s.creaUtente("bruno@esempio.it");
    const estraneo = await s.perUtente(altro, (ctx) => emailDellaSituazioneWeb(s.dip, ctx, emailId, [emailId]));
    expect(estraneo).toEqual({ origine: null, correzioniEmail: [] });

    const vuoto = await s.perUtente(utente, (ctx) => emailDellaSituazioneWeb(s.dip, ctx, "x", []));
    expect(vuoto).toEqual({ origine: null, correzioniEmail: [] });
  });
});
