import { describe, expect, it } from "vitest";
import { derivaStatoAttesa } from "../src/dominio/attesa";
import type { Requisito, RispostaArrivata } from "../src/dominio/entita";
import { attesa, correzione, evidenza, ore, risposta } from "./costruttori";

const requisiti: Requisito[] = [
  { id: "q-ricavi", attesaId: "w1", descrizione: "ricavi", ordine: 1 },
  { id: "q-costi", attesaId: "w1", descrizione: "costi", ordine: 2 },
];

function copre(...ids: string[]): RispostaArrivata["requisitiSoddisfatti"] {
  return ids.map((requisitoId) => ({ requisitoId, evidenze: [evidenza(false), evidenza(true)] }));
}

function senzaEvidenza(...ids: string[]): RispostaArrivata["requisitiSoddisfatti"] {
  return ids.map((requisitoId) => ({ requisitoId, evidenze: [evidenza(false)] }));
}

const suRisposta = (id: string) => ({ tipo: "risposta", id }) as const;
const suAttesa = { tipo: "attesa", id: "w1" } as const;

describe("derivaStatoAttesa", () => {
  it("senza risposte è aperta", () => {
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [], correzioni: [] })).toEqual({
      stato: "aperta",
      chiusaDa: null,
      rispostaDiChiusura: null,
      requisitiSoddisfatti: [],
      daVerificare: [],
    });
  });

  it("una risposta completa con evidenze verificate per ogni requisito la soddisfa (chiusa dall'AI)", () => {
    const r1 = risposta({ id: "r1", requisitiSoddisfatti: copre("q-costi", "q-ricavi") });
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [] })).toEqual({
      stato: "soddisfatta",
      chiusaDa: "ai",
      rispostaDiChiusura: "r1",
      requisitiSoddisfatti: ["q-ricavi", "q-costi"],
      daVerificare: [],
    });
  });

  it("una completa senza evidenza verificata per un requisito non chiude e va verificata", () => {
    const r1 = risposta({ id: "r1", requisitiSoddisfatti: [...copre("q-ricavi"), ...senzaEvidenza("q-costi")] });
    const esito = derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [] });
    expect(esito.stato).toBe("parziale");
    expect(esito.chiusaDa).toBeNull();
    expect(esito.requisitiSoddisfatti).toEqual(["q-ricavi"]);
    expect(esito.daVerificare).toEqual(["r1"]);
  });

  it("una completa che non dichiara tutti i requisiti va verificata", () => {
    const r1 = risposta({ id: "r1", requisitiSoddisfatti: copre("q-ricavi") });
    const esito = derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [] });
    expect(esito.stato).toBe("parziale");
    expect(esito.daVerificare).toEqual(["r1"]);
  });

  it("una parziale che dichiara un requisito senza evidenza verificata va verificata", () => {
    const r1 = risposta({ id: "r1", valutazione: "parziale", requisitiSoddisfatti: senzaEvidenza("q-ricavi") });
    const esito = derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [] });
    expect(esito.stato).toBe("aperta");
    expect(esito.daVerificare).toEqual(["r1"]);
  });

  it("una parziale senza requisiti dichiarati (\"ti mando i dati domani\") lascia l'attesa aperta", () => {
    const r1 = risposta({ id: "r1", valutazione: "parziale" });
    const esito = derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [] });
    expect(esito.stato).toBe("aperta");
    expect(esito.daVerificare).toEqual([]);
  });

  it("una parziale con evidenza verificata su un requisito rende l'attesa parziale", () => {
    const r1 = risposta({ id: "r1", valutazione: "parziale", requisitiSoddisfatti: copre("q-ricavi") });
    const esito = derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [] });
    expect(esito.stato).toBe("parziale");
    expect(esito.requisitiSoddisfatti).toEqual(["q-ricavi"]);
    expect(esito.daVerificare).toEqual([]);
  });

  it("requisiti coperti da più risposte: chiude con l'ultima che contribuisce se almeno una è completa", () => {
    const r1 = risposta({ id: "r1", valutazione: "parziale", requisitiSoddisfatti: copre("q-ricavi"), arrivataIl: ore(10) });
    const r2 = risposta({ id: "r2", valutazione: "completa", requisitiSoddisfatti: copre("q-costi"), arrivataIl: ore(20) });
    const r3 = risposta({ id: "r3", valutazione: "parziale", arrivataIl: ore(30) });
    const esito = derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r3, r2, r1], correzioni: [] });
    expect(esito.stato).toBe("soddisfatta");
    expect(esito.chiusaDa).toBe("ai");
    expect(esito.rispostaDiChiusura).toBe("r2");
    expect(esito.daVerificare).toEqual([]);
  });

  it("un requisito dichiarato senza evidenza va verificato anche se l'attesa è soddisfatta", () => {
    const r1 = risposta({ id: "r1", requisitiSoddisfatti: [...copre("q-ricavi", "q-costi"), ...senzaEvidenza("q-ricavi")] });
    const r2 = risposta({ id: "r2", valutazione: "parziale", requisitiSoddisfatti: senzaEvidenza("q-costi"), arrivataIl: ore(30) });
    const esito = derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1, r2], correzioni: [] });
    expect(esito.stato).toBe("soddisfatta");
    expect(esito.daVerificare).toEqual(["r2"]);
  });

  it("due risposte parziali che insieme coprono tutto non chiudono l'attesa", () => {
    const r1 = risposta({ id: "r1", valutazione: "parziale", requisitiSoddisfatti: copre("q-ricavi") });
    const r2 = risposta({ id: "r2", valutazione: "parziale", requisitiSoddisfatti: copre("q-costi"), arrivataIl: ore(30) });
    const esito = derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1, r2], correzioni: [] });
    expect(esito.stato).toBe("parziale");
    expect(esito.requisitiSoddisfatti).toEqual(["q-ricavi", "q-costi"]);
  });

  it("senza requisiti una completa dell'AI non può chiudere e va verificata", () => {
    const r1 = risposta({ id: "r1" });
    const esito = derivaStatoAttesa({ attesa: attesa(), requisiti: [], risposte: [r1], correzioni: [] });
    expect(esito.stato).toBe("aperta");
    expect(esito.daVerificare).toEqual(["r1"]);
  });

  it("ignora le risposte di altre attese e i requisiti sconosciuti", () => {
    const altra = risposta({ id: "rx", attesaId: "w2", requisitiSoddisfatti: copre("q-ricavi", "q-costi") });
    const sconosciuto = risposta({ id: "r1", valutazione: "parziale", requisitiSoddisfatti: copre("q-inventato") });
    const esito = derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [altra, sconosciuto], correzioni: [] });
    expect(esito.stato).toBe("aperta");
    expect(esito.requisitiSoddisfatti).toEqual([]);
  });

  it("scenario: chiusura, riapertura, rianalisi che non richiude, nuova risposta che richiude, poi parziale", () => {
    const r1 = risposta({ id: "r1", requisitiSoddisfatti: copre("q-ricavi", "q-costi"), arrivataIl: ore(10) });
    const base = { attesa: attesa(), requisiti };

    expect(derivaStatoAttesa({ ...base, risposte: [r1], correzioni: [] }).stato).toBe("soddisfatta");

    const riapri = correzione(suRisposta("r1"), "valutazione", "non_pertinente");
    const riaperta = derivaStatoAttesa({ ...base, risposte: [r1], correzioni: [riapri] });
    expect(riaperta).toMatchObject({ stato: "aperta", chiusaDa: null, rispostaDiChiusura: null, requisitiSoddisfatti: [] });

    const rianalizzata = { ...r1, valutazione: "completa" as const, analisiId: "a2" };
    expect(derivaStatoAttesa({ ...base, risposte: [rianalizzata], correzioni: [riapri] }).stato).toBe("aperta");

    const r2 = risposta({ id: "r2", emailId: "e-r2", requisitiSoddisfatti: copre("q-ricavi", "q-costi"), arrivataIl: ore(40) });
    expect(derivaStatoAttesa({ ...base, risposte: [rianalizzata, r2], correzioni: [riapri] })).toMatchObject({
      stato: "soddisfatta",
      chiusaDa: "ai",
      rispostaDiChiusura: "r2",
    });

    const r2Parziale = { ...r2, valutazione: "parziale" as const, requisitiSoddisfatti: copre("q-costi") };
    expect(derivaStatoAttesa({ ...base, risposte: [rianalizzata, r2Parziale], correzioni: [riapri] })).toMatchObject({
      stato: "parziale",
      requisitiSoddisfatti: ["q-costi"],
    });
  });

  it("una risposta rifiutata dall'utente non conta", () => {
    const r1 = risposta({ id: "r1", requisitiSoddisfatti: copre("q-ricavi", "q-costi") });
    const rifiuto = correzione(suRisposta("r1"), "statoCollegamento", "rifiutato");
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [rifiuto] }).stato).toBe("aperta");
  });

  it("una risposta rifiutata dall'AI non conta, ma l'utente può ripristinarla", () => {
    const r1 = risposta({ id: "r1", statoCollegamento: "rifiutato", requisitiSoddisfatti: copre("q-ricavi", "q-costi") });
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [] }).stato).toBe("aperta");
    const conferma = correzione(suRisposta("r1"), "statoCollegamento", "confermato");
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [conferma] }).stato).toBe("soddisfatta");
  });

  it("una valutazione non pertinente dell'AI non conta", () => {
    const r1 = risposta({ id: "r1", valutazione: "non_pertinente", requisitiSoddisfatti: copre("q-ricavi") });
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [] }).stato).toBe("aperta");
  });

  it("una risposta corretta dall'utente in completa soddisfa tutti i requisiti (chiusa dall'utente)", () => {
    const r1 = risposta({ id: "r1", valutazione: "parziale", requisitiSoddisfatti: senzaEvidenza("q-ricavi") });
    const completa = correzione(suRisposta("r1"), "valutazione", "completa");
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [completa] })).toEqual({
      stato: "soddisfatta",
      chiusaDa: "utente",
      rispostaDiChiusura: "r1",
      requisitiSoddisfatti: ["q-ricavi", "q-costi"],
      daVerificare: [],
    });
  });

  it("senza requisiti una risposta corretta dall'utente in completa chiude l'attesa", () => {
    const r1 = risposta({ id: "r1", valutazione: "parziale" });
    const completa = correzione(suRisposta("r1"), "valutazione", "completa");
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti: [], risposte: [r1], correzioni: [completa] })).toMatchObject({
      stato: "soddisfatta",
      chiusaDa: "utente",
      rispostaDiChiusura: "r1",
    });
  });

  it("chiusa dall'AI se la chiusura regge anche senza le risposte corrette dall'utente", () => {
    const r1 = risposta({ id: "r1", requisitiSoddisfatti: copre("q-ricavi", "q-costi"), arrivataIl: ore(10) });
    const r2 = risposta({ id: "r2", valutazione: "parziale", arrivataIl: ore(20) });
    const completa = correzione(suRisposta("r2"), "valutazione", "completa");
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1, r2], correzioni: [completa] })).toMatchObject({
      stato: "soddisfatta",
      chiusaDa: "ai",
      rispostaDiChiusura: "r2",
    });
  });

  it("chiusa dall'utente se un requisito è coperto solo dalla risposta corretta dall'utente", () => {
    const r1 = risposta({ id: "r1", valutazione: "parziale", requisitiSoddisfatti: copre("q-ricavi"), arrivataIl: ore(30) });
    const r2 = risposta({ id: "r2", valutazione: "parziale", arrivataIl: ore(20) });
    const completa = correzione(suRisposta("r2"), "valutazione", "completa");
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1, r2], correzioni: [completa] })).toMatchObject({
      stato: "soddisfatta",
      chiusaDa: "utente",
      rispostaDiChiusura: "r1",
    });
  });

  it("una correzione in parziale non fa diventare dell'utente una chiusura che regge sulle evidenze dell'AI", () => {
    const r1 = risposta({ id: "r1", requisitiSoddisfatti: copre("q-ricavi", "q-costi"), arrivataIl: ore(10) });
    const r2 = risposta({ id: "r2", requisitiSoddisfatti: copre("q-costi"), arrivataIl: ore(20) });
    const parziale = correzione(suRisposta("r1"), "valutazione", "parziale");
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1, r2], correzioni: [parziale] })).toMatchObject({
      stato: "soddisfatta",
      chiusaDa: "ai",
      rispostaDiChiusura: "r2",
    });
  });

  it("una completa dell'AI confermata dall'utente è chiusa dall'utente: non è più un'inferenza", () => {
    const r1 = risposta({ id: "r1", requisitiSoddisfatti: copre("q-ricavi", "q-costi"), arrivataIl: ore(10) });
    const conferma = correzione(suRisposta("r1"), "valutazione", "completa");
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [conferma] })).toMatchObject({
      stato: "soddisfatta",
      chiusaDa: "utente",
      rispostaDiChiusura: "r1",
    });
  });

  it("correggere in parziale una completa dell'AI riapre l'attesa come parziale", () => {
    const r1 = risposta({ id: "r1", requisitiSoddisfatti: copre("q-ricavi", "q-costi") });
    const parziale = correzione(suRisposta("r1"), "valutazione", "parziale");
    const esito = derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [parziale] });
    expect(esito).toMatchObject({ stato: "parziale", chiusaDa: null, rispostaDiChiusura: null });
    expect(esito.daVerificare).toEqual([]);
  });

  it("la decisione terminale dell'utente sull'attesa prevale", () => {
    const annulla = correzione(suAttesa, "stato", "annullata");
    const r1 = risposta({ id: "r1", valutazione: "parziale", requisitiSoddisfatti: copre("q-ricavi") });
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [r1], correzioni: [annulla] })).toMatchObject({
      stato: "annullata",
      chiusaDa: "utente",
      rispostaDiChiusura: null,
      requisitiSoddisfatti: ["q-ricavi"],
    });

    const soddisfa = correzione(suAttesa, "stato", "soddisfatta");
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [], correzioni: [soddisfa] })).toMatchObject({
      stato: "soddisfatta",
      chiusaDa: "utente",
      rispostaDiChiusura: null,
    });
  });

  it("una correzione successiva non terminale sull'attesa riporta allo stato derivato", () => {
    const soddisfa = correzione(suAttesa, "stato", "soddisfatta", { creataIl: ore(1) });
    const riapri = correzione(suAttesa, "stato", "aperta", { creataIl: ore(2) });
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [], correzioni: [soddisfa, riapri] }).stato).toBe("aperta");
  });

  it("un'attesa scartata o superata è annullata", () => {
    const r1 = risposta({ id: "r1", requisitiSoddisfatti: copre("q-ricavi", "q-costi") });
    for (const ciclo of ["scartata", "superata"] as const) {
      expect(derivaStatoAttesa({ attesa: attesa({ ciclo }), requisiti, risposte: [r1], correzioni: [] })).toMatchObject({
        stato: "annullata",
        chiusaDa: null,
        rispostaDiChiusura: null,
      });
    }
  });

  it("le proposte contano: un'attesa proposta può essere soddisfatta", () => {
    const r1 = risposta({ id: "r1", statoCollegamento: "proposto", requisitiSoddisfatti: copre("q-ricavi", "q-costi") });
    expect(derivaStatoAttesa({ attesa: attesa({ ciclo: "proposta" }), requisiti, risposte: [r1], correzioni: [] }).stato).toBe(
      "soddisfatta",
    );
  });

  it("la risposta di chiusura a parità di arrivo è scelta per id in modo stabile", () => {
    const a = risposta({ id: "ra", requisitiSoddisfatti: copre("q-ricavi", "q-costi"), arrivataIl: ore(5) });
    const b = risposta({ id: "rb", requisitiSoddisfatti: copre("q-ricavi", "q-costi"), arrivataIl: ore(5) });
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [b, a], correzioni: [] }).rispostaDiChiusura).toBe("rb");
    expect(derivaStatoAttesa({ attesa: attesa(), requisiti, risposte: [a, b], correzioni: [] }).rispostaDiChiusura).toBe("rb");
  });
});
