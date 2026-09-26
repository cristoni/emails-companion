import { beforeAll, describe, expect, it } from "vitest";
import { RilevatoreLinguaEld, type MotoreEld } from "../src";

const motore = (language: string, affidabile: boolean): MotoreEld => ({
  detect: () => ({ language, isReliable: () => affidabile }),
});

describe("RilevatoreLinguaEld con un motore sostituito", () => {
  it("richiede almeno 20 lettere, senza contare cifre, punteggiatura, indirizzi web ed email", () => {
    const rilevatore = new RilevatoreLinguaEld(motore("it", true));
    expect(rilevatore.rileva("abcde fghij, klmno 12345 pqrs! https://esempio.it a@b.it").affidabile).toBe(false);
    expect(rilevatore.rileva("abcde fghij, klmno 12345 pqrst! https://esempio.it a@b.it").affidabile).toBe(true);
  });

  it("non è affidabile quando il motore stesso non lo è, anche su un testo lungo", () => {
    const rilevatore = new RilevatoreLinguaEld(motore("it", false));
    expect(rilevatore.rileva("parola ".repeat(50))).toEqual({ lingua: "it", affidabile: false });
  });

  it("restituisce il codice in minuscolo e nessuna lingua quando il motore non ne trova", () => {
    expect(new RilevatoreLinguaEld(motore("EN", true)).rileva("parola ".repeat(10)).lingua).toBe("en");
    expect(new RilevatoreLinguaEld(motore("", true)).rileva("parola ".repeat(10))).toEqual({
      lingua: null,
      affidabile: false,
    });
  });
});

describe("RilevatoreLinguaEld", () => {
  let rilevatore: RilevatoreLinguaEld;

  beforeAll(async () => {
    rilevatore = await RilevatoreLinguaEld.crea();
  });

  it.each([
    [
      "it",
      "Buongiorno Laura, ti confermo che la riunione con il fornitore è spostata a giovedì alle 15. " +
        "Puoi mandarmi entro domani la versione aggiornata del preventivo? Grazie mille.",
    ],
    [
      "en",
      "Hi Tom, just following up on the contract renewal we discussed last week. " +
        "Could you send me the signed copy by Friday so we can close this out? Thanks a lot.",
    ],
    [
      "es",
      "Hola Lucía, te escribo para confirmar que la reunión con el proveedor se ha trasladado al jueves por la tarde. " +
        "¿Podrías enviarme mañana la versión actualizada del presupuesto? Muchas gracias.",
    ],
    [
      "de",
      "Hallo Stefan, ich wollte kurz nachfragen, ob du die Rechnung für den letzten Monat schon erhalten hast. " +
        "Könntest du mir bitte bis Freitag Bescheid geben? Vielen Dank und viele Grüße.",
    ],
    [
      "fr",
      "Bonjour Claire, je vous écris pour confirmer que la réunion avec le fournisseur est reportée à jeudi après-midi. " +
        "Pourriez-vous m'envoyer demain la version mise à jour du devis ? Merci beaucoup.",
    ],
  ])("riconosce con affidabilità la lingua %s", (lingua, testo) => {
    expect(rilevatore.rileva(testo)).toEqual({ lingua, affidabile: true });
  });

  it("considera non affidabile un testo breve", () => {
    expect(rilevatore.rileva("Ok, grazie!").affidabile).toBe(false);
  });

  it("non conta le lettere di indirizzi web ed email", () => {
    const esito = rilevatore.rileva("Vedi https://example.com/documenti/preventivo e scrivi a ufficio.acquisti@example.com");
    expect(esito.affidabile).toBe(false);
  });

  it("resta rapido su un testo con una lunga sequenza senza spazi", () => {
    const testo = `Ciao Marco, ti mando il file che mi avevi chiesto ieri. ${"QUJD".repeat(8 * 1024)}`;
    const inizio = performance.now();
    rilevatore.rileva(testo);
    expect(performance.now() - inizio).toBeLessThan(250);
  });

  it("non restituisce una lingua quando il testo non ne ha", () => {
    expect(rilevatore.rileva("")).toEqual({ lingua: null, affidabile: false });
    expect(rilevatore.rileva("12345 67890 !!!")).toEqual({ lingua: null, affidabile: false });
  });
});
