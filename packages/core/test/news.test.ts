import { describe, expect, it } from "vitest";
import {
  emailNonIncluse,
  firmaInsiemeNews,
  inFinestraNews,
  membriNews,
  prossimaRigenerazione,
  prossimaUscitaDallaFinestra,
  vociVisibili,
} from "../src/dominio/news";
import { minuti, ore } from "./costruttori";

const ORA = ore(100);

describe("inFinestraNews", () => {
  it("include le ultime 24 ore, escluso l'estremo iniziale e incluso l'istante di consultazione", () => {
    expect(inFinestraNews(ore(-24, ORA), ORA)).toBe(false);
    expect(inFinestraNews(new Date(ore(-24, ORA).getTime() + 1), ORA)).toBe(true);
    expect(inFinestraNews(ORA, ORA)).toBe(true);
    expect(inFinestraNews(new Date(ORA.getTime() + 1), ORA)).toBe(false);
  });

  it("accetta una finestra diversa", () => {
    expect(inFinestraNews(ore(-30, ORA), ORA, 48)).toBe(true);
    expect(inFinestraNews(ore(-30, ORA), ORA)).toBe(false);
  });
});

describe("membriNews", () => {
  const email = (id: string, altro: Partial<Parameters<typeof membriNews>[0][number]> = {}) => ({
    id,
    direzione: "entrata" as const,
    ricevutaIl: ore(-1, ORA),
    categoriaEffettiva: "news" as const,
    eliminata: false,
    ...altro,
  });

  it("include solo News in entrata, nella finestra e non eliminate, dalla più recente", () => {
    const membri = membriNews(
      [
        email("vecchia", { ricevutaIl: ore(-20, ORA) }),
        email("b", { ricevutaIl: ore(-2, ORA) }),
        email("a", { ricevutaIl: ore(-2, ORA) }),
        email("recente", { ricevutaIl: ore(-1, ORA) }),
        email("fuori", { ricevutaIl: ore(-25, ORA) }),
        email("uscita", { direzione: "uscita" }),
        email("interna", { direzione: "interna" }),
        email("operativa", { categoriaEffettiva: "operativa" }),
        email("non-classificata", { categoriaEffettiva: null }),
        email("eliminata", { eliminata: true }),
      ],
      ORA,
    );
    expect(membri).toEqual(["recente", "a", "b", "vecchia"]);
  });
});

describe("firmaInsiemeNews", () => {
  it("non dipende dall'ordine né dai duplicati", () => {
    expect(firmaInsiemeNews(["e2", "e1", "e3"], "en")).toBe(firmaInsiemeNews(["e1", "e3", "e2", "e1"], "en"));
  });

  it("cambia con l'insieme e con la lingua dell'interfaccia", () => {
    const firma = firmaInsiemeNews(["e1", "e2"], "en");
    expect(firma).toMatch(/^[0-9a-f]{64}$/);
    expect(firmaInsiemeNews(["e1"], "en")).not.toBe(firma);
    expect(firmaInsiemeNews(["e1", "e2"], "it")).not.toBe(firma);
  });

  it("non confonde confini tra id", () => {
    expect(firmaInsiemeNews(["a,b"], "en")).not.toBe(firmaInsiemeNews(["a", "b"], "en"));
  });
});

describe("vociVisibili ed emailNonIncluse", () => {
  const voci = [
    { testo: "Due newsletter", emailIds: ["e1", "e2"] },
    { testo: "Una fonte uscita dalla finestra", emailIds: ["e3", "e-uscita"] },
    { testo: "Senza fonti", emailIds: [] },
    { testo: "Una", emailIds: ["e4"] },
  ];

  it("mostra una voce solo se tutte le sue fonti sono ancora incluse", () => {
    expect(vociVisibili(voci, ["e1", "e2", "e3", "e4", "e5"]).map((v) => v.testo)).toEqual(["Due newsletter", "Una"]);
  });

  it("conta tra le non incluse le email fuori dalle voci mostrate, nell'ordine dei membri", () => {
    const membri = ["e5", "e4", "e3", "e2", "e1"];
    expect(emailNonIncluse(membri, vociVisibili(voci, membri))).toEqual(["e5", "e3"]);
  });
});

describe("prossimaRigenerazione", () => {
  it("attende 10 minuti per raggruppare i cambiamenti", () => {
    expect(prossimaRigenerazione(ORA, null)).toEqual(minuti(10, ORA));
    expect(prossimaRigenerazione(ORA, ore(-2, ORA))).toEqual(minuti(10, ORA));
  });

  it("non rigenera più di una volta ogni 30 minuti", () => {
    expect(prossimaRigenerazione(ORA, minuti(-5, ORA))).toEqual(minuti(25, ORA));
  });
});

describe("prossimaUscitaDallaFinestra", () => {
  it("è l'istante in cui la fonte più vecchia ancora inclusa esce dalla finestra", () => {
    const ricevute = [ore(-3, ORA), ore(-20, ORA), ore(-30, ORA), ore(1, ORA)];
    const uscita = prossimaUscitaDallaFinestra(ricevute, ORA);
    expect(uscita).toEqual(ore(4, ORA));
    expect(inFinestraNews(ore(-20, ORA), new Date(uscita!.getTime() - 1))).toBe(true);
    expect(inFinestraNews(ore(-20, ORA), uscita!)).toBe(false);
  });

  it("è null senza email nella finestra", () => {
    expect(prossimaUscitaDallaFinestra([], ORA)).toBeNull();
    expect(prossimaUscitaDallaFinestra([ore(-30, ORA)], ORA)).toBeNull();
  });
});
