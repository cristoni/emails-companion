import { describe, expect, it } from "vitest";
import { ErroreAI, stimaCosto, TOKEN_MEDI_INGRESSO, TOKEN_MEDI_USCITA } from "../src";

const luna = { ingressoPerToken: 0.000002, uscitaPerToken: 0.000008 };

describe("stimaCosto", () => {
  it("moltiplica token medi e prezzi per ogni funzione e somma il totale", () => {
    const stima = stimaCosto({
      numeroEmail: 100,
      funzioni: ["classificazione_priorita", "estrazione_attivita"],
      prezzi: { classificazione_priorita: luna, estrazione_attivita: { ingressoPerToken: 0.000001, uscitaPerToken: 0.000004 } },
      tokenMediIngresso: 1000,
      tokenMediUscita: 200,
    });
    expect(stima.dettaglio).toEqual([
      { funzione: "classificazione_priorita", tokenIngresso: 100_000, tokenUscita: 20_000, costo: expect.closeTo(0.36, 10) },
      { funzione: "estrazione_attivita", tokenIngresso: 100_000, tokenUscita: 20_000, costo: expect.closeTo(0.18, 10) },
    ]);
    expect(stima.costoStimato).toBeCloseTo(0.54, 10);
    expect(stima.prezziMancanti).toEqual([]);
  });

  it("usa i token medi predefiniti", () => {
    const stima = stimaCosto({ numeroEmail: 10, funzioni: ["riepilogo_news"], prezzi: { riepilogo_news: luna } });
    expect(stima.dettaglio[0]).toMatchObject({ tokenIngresso: 10 * TOKEN_MEDI_INGRESSO, tokenUscita: 10 * TOKEN_MEDI_USCITA });
    expect(stima.costoStimato).toBeCloseTo(10 * (TOKEN_MEDI_INGRESSO * 0.000002 + TOKEN_MEDI_USCITA * 0.000008), 10);
  });

  it("segnala le funzioni senza prezzo e le esclude dal totale", () => {
    const stima = stimaCosto({ numeroEmail: 1, funzioni: ["attese_risposte", "bozze_assistite"], prezzi: { bozze_assistite: luna }, tokenMediIngresso: 1, tokenMediUscita: 1 });
    expect(stima.dettaglio[0]).toMatchObject({ funzione: "attese_risposte", costo: null });
    expect(stima.prezziMancanti).toEqual(["attese_risposte"]);
    expect(stima.costoStimato).toBeCloseTo(0.00001, 12);
  });

  it("conta una sola volta le funzioni ripetute e restituisce zero senza email", () => {
    const stima = stimaCosto({ numeroEmail: 0, funzioni: ["riepilogo_news", "riepilogo_news"], prezzi: { riepilogo_news: luna } });
    expect(stima.dettaglio).toHaveLength(1);
    expect(stima.costoStimato).toBe(0);
  });

  it("rifiuta quantità negative o non finite", () => {
    for (const input of [{ numeroEmail: -1 }, { numeroEmail: Number.NaN }, { numeroEmail: 1, tokenMediIngresso: -5 }, { numeroEmail: 1, tokenMediUscita: Infinity }]) {
      expect(() => stimaCosto({ funzioni: ["riepilogo_news"], prezzi: {}, ...input })).toThrow(ErroreAI);
    }
  });
});
