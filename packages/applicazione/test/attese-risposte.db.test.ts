import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { derivaStatoAttesa } from "@ec/core/dominio";
import { operativo } from "@ec/db";
import { creaScenario, type Scenario } from "./support/scenario";

let s: Scenario;
beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
});

const ORA = 60 * 60 * 1000;

function scriptBase() {
  s.modelli
    .quando("classificazione_priorita", () => ({
      output: {
        categoria: "operativa",
        urgente: false,
        base_urgenza: "dedotto",
        priorita: "media",
        motivazione: "Risposta a una richiesta.",
        titolo_situazione: null,
        descrizione_situazione: null,
        evidenze: [],
      },
    }))
    .quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }))
    .quando("attese_risposte", (dati) => {
      if (dati.email.direzione === "uscita") {
        return {
          output: {
            richieste: [
              {
                esito: "nuovo",
                riferimento: null,
                destinatari: ["marco@cliente.it"],
                oggetto: "Dati di agosto",
                data_attesa_iso: null,
                data_attesa_citazione: null,
                requisiti: ["ricavi", "costi"],
                sollecito_di: null,
                base: "rilevato",
                evidenze: [{ email: "e1", citazione: "Puoi mandarmi i dati di agosto" }],
              },
            ],
            collegamenti: [],
            valutazioni: [],
            completamenti: [],
            titolo_situazione: "Dati di agosto",
            descrizione_situazione: "Richiesta dei dati di agosto a Marco.",
          },
        };
      }
      const attesa = dati.attese_candidate[0];
      const testo: string = dati.email.testo;
      const ricavi = testo.includes("Ricavi");
      const costi = testo.includes("Costi");
      return {
        output: {
          richieste: [],
          collegamenti: dati.situazioni_candidate.map((c: { alias: string }) => ({ candidato: c.alias, pertinente: true, confidenza: 0.8, motivazione: "stessa richiesta", evidenze: [] })),
          valutazioni: attesa
            ? [
                {
                  attesa: attesa.alias,
                  valutazione: ricavi && costi ? "completa" : ricavi || costi ? "parziale" : "non_pertinente",
                  requisiti: [
                    { requisito: `${attesa.alias}r1`, soddisfatto: ricavi, evidenze: ricavi ? [{ email: "e1", citazione: "Ricavi: 10.000" }] : [] },
                    { requisito: `${attesa.alias}r2`, soddisfatto: costi, evidenze: costi ? [{ email: "e1", citazione: "Costi: 4.000" }] : [] },
                  ],
                  motivazione: "valutazione",
                },
              ]
            : [],
          completamenti: [],
          titolo_situazione: null,
          descrizione_situazione: null,
        },
      };
    });
}

async function statoAttesa(utente: string) {
  return s.perUtente(utente, async (ctx) => {
    const [agg] = await operativo.aggregati(ctx, await operativo.idSituazioniVisibili(ctx));
    const voce = agg!.attese[0]!;
    return { agg: agg!, derivato: derivaStatoAttesa({ attesa: voce.attesa, requisiti: voce.requisiti, risposte: agg!.risposte, correzioni: agg!.correzioni }) };
  });
}

describe("richiesta inviata da Gmail e risposte in altri thread", () => {
  it("una risposta parziale lascia l'Attesa aperta, la risposta completa la chiude", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    scriptBase();

    s.orologio.avanza(ORA);
    casella.ricevi({ da: "anna@esempio.it", a: ["marco@cliente.it"], oggetto: "Dati", testo: "Ciao Marco, puoi mandarmi i dati di agosto (ricavi e costi)?", il: s.orologio.ora(), thread: "t-richiesta" });
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await s.eseguiJob();

    let { agg, derivato } = await statoAttesa(utente);
    expect(agg.situazione.titolo).toBe("Dati di agosto");
    expect(agg.attese[0]!.requisiti.map((r) => r.descrizione)).toEqual(["ricavi", "costi"]);
    expect(derivato.stato).toBe("aperta");

    s.orologio.avanza(ORA);
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "agosto", testo: "Ricavi: 10.000. Ti mando i costi domani.", il: s.orologio.ora(), thread: "t-nuovo" });
    s.orologio.avanza(2 * 60 * 1000);
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await s.eseguiJob();
    ({ agg, derivato } = await statoAttesa(utente));
    expect(agg.risposte).toHaveLength(1);
    expect(agg.risposte[0]!.valutazione).toBe("parziale");
    expect(agg.risposte[0]!.statoCollegamento).toBe("proposto");
    expect(derivato.stato).toBe("parziale");

    s.orologio.avanza(ORA);
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "costi agosto", testo: "Ricavi: 10.000\nCosti: 4.000", il: s.orologio.ora(), thread: "t-altro" });
    s.orologio.avanza(2 * 60 * 1000);
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await s.eseguiJob();
    ({ agg, derivato } = await statoAttesa(utente));
    expect(derivato.stato).toBe("soddisfatta");
    expect(derivato.chiusaDa).toBe("ai");
    expect(agg.collegamenti.filter((c) => c.stato !== "rifiutato").length).toBe(3);
  });

  it("converge quando la risposta viene riconciliata prima della richiesta", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    scriptBase();

    const richiestaIl = new Date(s.orologio.ora().getTime() + ORA);
    s.orologio.avanza(2 * ORA);
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "agosto", testo: "Ricavi: 10.000\nCosti: 4.000", il: s.orologio.ora(), thread: "t-risposta" });
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await s.eseguiJob();
    expect(await s.perUtente(utente, (ctx) => operativo.idSituazioniVisibili(ctx))).toHaveLength(0);

    casella.ricevi({ da: "anna@esempio.it", a: ["marco@cliente.it"], oggetto: "Dati", testo: "Ciao Marco, puoi mandarmi i dati di agosto?", il: richiestaIl, thread: "t-richiesta" });
    s.orologio.avanza(2 * 60 * 1000);
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await s.eseguiJob();

    const { agg, derivato } = await statoAttesa(utente);
    expect(agg.risposte).toHaveLength(1);
    expect(derivato.stato).toBe("soddisfatta");
  });
});
