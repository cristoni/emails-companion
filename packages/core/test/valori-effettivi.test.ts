import { describe, expect, it } from "vitest";
import { correzioniAttive, toccatoDallUtente, valoreEffettivo } from "../src/dominio/valori-effettivi";
import { correzione, ore } from "./costruttori";

const attivita = { tipo: "attivita", id: "t1" } as const;

describe("correzioniAttive", () => {
  it("tiene solo le correzioni non revocate di quel soggetto e campo, dalla più vecchia", () => {
    const recente = correzione(attivita, "stato", "completata", { creataIl: ore(5) });
    const vecchia = correzione(attivita, "stato", "confermata", { creataIl: ore(1) });
    const revocata = correzione(attivita, "stato", "scartata", { creataIl: ore(3), revocataIl: ore(4) });
    const altroCampo = correzione(attivita, "priorita", "alta");
    const altroSoggetto = correzione({ tipo: "attivita", id: "t2" }, "stato", "scartata");
    const altroTipo = correzione({ tipo: "attesa", id: "t1" }, "stato", "annullata");

    const attive = correzioniAttive([recente, vecchia, revocata, altroCampo, altroSoggetto, altroTipo], attivita, "stato");

    expect(attive).toEqual([vecchia, recente]);
  });

  it("a parità di data ordina per id, indipendentemente dall'ordine di lettura", () => {
    const b = correzione(attivita, "stato", "completata", { id: "b", creataIl: ore(1) });
    const a = correzione(attivita, "stato", "confermata", { id: "a", creataIl: ore(1) });
    expect(correzioniAttive([b, a], attivita, "stato")).toEqual([a, b]);
    expect(correzioniAttive([a, b], attivita, "stato")).toEqual([a, b]);
  });
});

describe("valoreEffettivo", () => {
  it("senza correzioni è il valore dell'AI", () => {
    expect(valoreEffettivo("proposta", [], attivita, "stato")).toEqual({ valore: "proposta", corretto: false, correzione: null });
  });

  it("l'ultima correzione attiva prevale sul valore dell'AI", () => {
    const prima = correzione(attivita, "stato", "confermata", { creataIl: ore(1) });
    const ultima = correzione(attivita, "stato", "completata", { creataIl: ore(2) });
    expect(valoreEffettivo("proposta", [ultima, prima], attivita, "stato")).toEqual({
      valore: "completata",
      corretto: true,
      correzione: ultima,
    });
  });

  it("revocare l'ultima correzione ripristina quella precedente", () => {
    const prima = correzione(attivita, "stato", "confermata", { creataIl: ore(1) });
    const revocata = correzione(attivita, "stato", "completata", { creataIl: ore(2), revocataIl: ore(3) });
    expect(valoreEffettivo("proposta", [prima, revocata], attivita, "stato").valore).toBe("confermata");
  });

  it("una correzione a null è un valore effettivo, non un'assenza", () => {
    const c = correzione(attivita, "scadenza", null);
    expect(valoreEffettivo<Date | null>(new Date(), [c], attivita, "scadenza")).toEqual({ valore: null, corretto: true, correzione: c });
  });
});

describe("toccatoDallUtente", () => {
  it("è vero con almeno una correzione attiva sul soggetto, su qualunque campo", () => {
    expect(toccatoDallUtente([correzione(attivita, "descrizione", "x")], attivita)).toBe(true);
  });

  it("ignora correzioni revocate e di altri soggetti", () => {
    const revocata = correzione(attivita, "stato", "scartata", { revocataIl: ore(9) });
    const altro = correzione({ tipo: "attivita", id: "t9" }, "stato", "scartata");
    expect(toccatoDallUtente([revocata, altro], attivita)).toBe(false);
  });
});
