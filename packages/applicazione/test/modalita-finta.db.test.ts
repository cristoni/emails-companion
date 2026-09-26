import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { derivaStatoAttesa } from "@ec/core/dominio";
import { operativo, sincronizzazione } from "@ec/db";
import { gatewayEuristico, popolaCasellaSintetica } from "@ec/testing";
import { confermaImportazione } from "../src";
import { creaScenario, type Scenario } from "./support/scenario";

let s: Scenario;
beforeEach(async () => {
  s = await creaScenario("2026-09-26T09:00:00Z");
  for (const [funzione, script] of gatewayEuristico().script) s.modelli.quando(funzione, script);
});
afterEach(async () => {
  await s.chiudi();
});

describe("modalità finta: casella sintetica e modello euristico", () => {
  it("l'importazione produce Situazioni con Attività, Attese, urgenza e News", async () => {
    const utente = await s.creaUtente("demo@esempio.example");
    popolaCasellaSintetica(s.casella("demo@esempio.example"), s.orologio.ora());
    const { casellaId } = await s.collegaGmail(utente, "demo@esempio.example");
    await s.eseguiJob();
    expect(await s.perUtente(utente, (ctx) => confermaImportazione(s.dip, ctx, casellaId!))).toBe(true);
    await s.eseguiJob();

    const stato = await s.perUtente(utente, (ctx) => sincronizzazione.leggi(ctx, casellaId!));
    expect(stato?.faseImportazione).toBe("completata");
    const aggregati = await s.perUtente(utente, async (ctx) => operativo.aggregati(ctx, await operativo.idSituazioniVisibili(ctx)));
    const titoli = aggregati.map((a) => a.situazione.titolo).sort();
    expect(titoli).toEqual(expect.arrayContaining(["August figures", "Production is down", "Quarterly report"]));

    const report = aggregati.find((a) => a.situazione.titolo === "Quarterly report")!;
    expect(report.attivita[0]?.evidenze[0]?.verificata).toBe(true);

    const agosto = aggregati.find((a) => a.situazione.titolo === "August figures")!;
    const voce = agosto.attese[0]!;
    const derivato = derivaStatoAttesa({ attesa: voce.attesa, requisiti: voce.requisiti, risposte: agosto.risposte, correzioni: agosto.correzioni });
    expect(agosto.risposte).toHaveLength(1);
    expect(derivato.stato).toBe("soddisfatta");

    const classificazioni = s.modelli.chiamateDi("classificazione_priorita").length;
    expect(classificazioni).toBe(5);
  });
});
