import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { operativo } from "@ec/db";
import { creaScenario, type Scenario } from "./support/scenario";

let s: Scenario;
beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
});

function classificazioneOperativa(titolo: string) {
  return () => ({
    output: {
      categoria: "operativa",
      urgente: false,
      base_urgenza: "dedotto",
      priorita: "media",
      motivazione: "Richiesta diretta con scadenza.",
      titolo_situazione: titolo,
      descrizione_situazione: "Richiesta di un report.",
      evidenze: [{ email: "e1", citazione: "entro venerdì", campo: "priorita" }],
    },
  });
}

describe("richiesta ricevuta con scadenza", () => {
  it("diventa un'Attività proposta in una nuova Situazione, con scadenza ed evidenza verificate", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();

    s.modelli
      .quando("classificazione_priorita", classificazioneOperativa("Report di settembre"))
      .quando("estrazione_attivita", () => ({
        output: {
          elementi: [
            {
              esito: "nuovo",
              riferimento: null,
              descrizione: "Mandare il report a Marco",
              scadenza_iso: "2026-09-25",
              scadenza_citazione: "entro venerdì",
              priorita: "media",
              urgente: false,
              base: "rilevato",
              evidenze: [{ email: "e1", citazione: "Mi mandi il report entro venerdì?" }],
            },
          ],
          titolo_situazione: null,
          descrizione_situazione: null,
        },
      }));

    s.orologio.avanza(60 * 60 * 1000);
    casella.ricevi({
      da: "marco@cliente.it",
      a: ["anna@esempio.it"],
      oggetto: "Report",
      testo: "Ciao Anna,\nMi mandi il report entro venerdì?\nGrazie, Marco",
      il: s.orologio.ora(),
    });
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await s.eseguiJob();

    const aggregati = await s.perUtente(utente, async (ctx) => operativo.aggregati(ctx, await operativo.idSituazioniVisibili(ctx)));
    expect(aggregati).toHaveLength(1);
    const [a] = aggregati;
    expect(a!.situazione.titolo).toBe("Report di settembre");
    expect(a!.attivita).toHaveLength(1);
    const attivita = a!.attivita[0]!;
    expect(attivita.stato).toBe("proposta");
    expect(attivita.descrizione).toBe("Mandare il report a Marco");
    expect(attivita.scadenza?.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(attivita.base).toBe("rilevato");
    expect(attivita.evidenze[0]?.verificata).toBe(true);
    expect(s.modelli.chiamateDi("attese_risposte")).toHaveLength(0);
  });

  it("non richiama il modello quando lo stesso job viene ripetuto", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    s.modelli
      .quando("classificazione_priorita", classificazioneOperativa("Report"))
      .quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }));
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "Report", testo: "Mi mandi il report entro venerdì?", il: s.orologio.ora() });
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await s.eseguiJob();
    const primaChiamate = s.modelli.chiamate.length;

    const [emailId] = await s.perUtente(utente, async (ctx) => {
      const r = await ctx.tx.execute(`select id from email` as never);
      return (r as unknown as { rows: { id: string }[] }).rows.map((x) => x.id);
    });
    const { posta } = await import("@ec/db");
    await s.perUtente(utente, (ctx) => posta.impostaStatoFunzione(ctx, emailId!, "classificazione_priorita", "da_eseguire", s.orologio.ora()));
    s.coda.aggiungi("analizza_email", { utenteId: utente, emailId: emailId! });
    await s.eseguiJob();
    expect(s.modelli.chiamate.length).toBe(primaChiamate);
  });
});
