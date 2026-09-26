import { describe, expect, it } from "vitest";
import { intervalliSovrapposti, verificaCitazione } from "../src/dominio/citazioni";
import { serializzazioneCanonica } from "../src/dominio/canonico";

describe("verificaCitazione", () => {
  const testo = "Ciao Anna,\n\nmi mandi il  report “finale” entro venerdì?\nGrazie — Marco";

  it("trova una citazione letterale e ne restituisce l'intervallo nel testo originale", () => {
    const esito = verificaCitazione(testo, "mi mandi il report");
    expect(esito.verificata).toBe(true);
    expect(testo.slice(esito.inizio!, esito.fine!)).toBe("mi mandi il  report");
  });

  it("ignora maiuscole, spazi multipli e virgolette tipografiche", () => {
    const esito = verificaCitazione(testo, 'Report "finale" ENTRO venerdì');
    expect(esito.verificata).toBe(true);
    expect(testo.slice(esito.inizio!, esito.fine!)).toBe("report “finale” entro venerdì");
  });

  it("rifiuta una citazione inventata", () => {
    expect(verificaCitazione(testo, "entro lunedì").verificata).toBe(false);
  });

  it("rifiuta citazioni troppo corte per essere significative", () => {
    expect(verificaCitazione(testo, "  a ").verificata).toBe(false);
  });

  it("gestisce caratteri fuori dal piano base", () => {
    const t = "ok 🙂 fatto";
    const esito = verificaCitazione(t, "🙂 fatto");
    expect(t.slice(esito.inizio!, esito.fine!)).toBe("🙂 fatto");
  });
});

describe("intervalliSovrapposti", () => {
  it("riconosce la sovrapposizione e ignora intervalli mancanti", () => {
    expect(intervalliSovrapposti({ inizio: 0, fine: 5 }, { inizio: 4, fine: 9 })).toBe(true);
    expect(intervalliSovrapposti({ inizio: 0, fine: 5 }, { inizio: 5, fine: 9 })).toBe(false);
    expect(intervalliSovrapposti({ inizio: null, fine: null }, { inizio: 0, fine: 9 })).toBe(false);
  });
});

describe("serializzazioneCanonica", () => {
  it("è indipendente dall'ordine delle chiavi", () => {
    expect(serializzazioneCanonica({ b: 1, a: { d: 2, c: [3] } })).toBe(serializzazioneCanonica({ a: { c: [3], d: 2 }, b: 1 }));
  });
});
