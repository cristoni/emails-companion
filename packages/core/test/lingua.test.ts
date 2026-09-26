import { describe, expect, it } from "vitest";
import { linguaVoceRiepilogo, scegliLingua, testoPerRilevamento } from "../src/dominio/lingua";

describe("testoPerRilevamento", () => {
  it("unisce oggetto senza prefissi e testo", () => {
    expect(testoPerRilevamento("Re: Fwd: Dati di agosto", "Ciao Marco,\nti mando i dati.")).toBe(
      "Dati di agosto\nCiao Marco,\nti mando i dati.",
    );
  });

  it("toglie le righe citate", () => {
    expect(testoPerRilevamento("Dati", "Va bene.\n> Can you send the data?\n  > Thanks\nA domani")).toBe("Dati\nVa bene.\nA domani");
  });

  it.each([
    ["inglese", "On Mon, Sep 1, 2026 at 10:00 AM Mark <mark@example.com> wrote:"],
    ["italiano", "Il giorno lun 1 set 2026 alle ore 10:00 Marco <marco@example.it> ha scritto:"],
    ["francese", "Le lun. 1 sept. 2026 à 10:00, Jean <jean@example.fr> a écrit :"],
    ["tedesco", "Am Mo., 1. Sept. 2026 um 10:00 Uhr schrieb Hans <hans@example.de>:"],
    ["spagnolo", "El lun, 1 sept 2026 a las 10:00, Juan (<juan@example.es>) escribió:"],
    ["inoltro Gmail", "---------- Forwarded message ---------"],
    ["inoltro Gmail italiano", "---------- Messaggio inoltrato ---------"],
    ["inoltro Apple", "Begin forwarded message:"],
    ["Outlook", "-----Original Message-----"],
    ["Outlook italiano", "-----Messaggio originale-----"],
    ["firma", "-- "],
  ])("taglia dall'intestazione di risposta, inoltro o firma (%s)", (_, intestazione) => {
    const testo = `Perfetto, grazie mille.\n\n${intestazione}\nPlease send me the August figures by Friday.`;
    expect(testoPerRilevamento("Dati", testo)).toBe("Dati\nPerfetto, grazie mille.");
  });

  it("riconosce l'intestazione di risposta spezzata su due righe", () => {
    const testo = "Ricevuto.\nOn Mon, Sep 1, 2026 at 10:00 AM Mark Smith <\nmark@example.com> wrote:\nPlease send the data.";
    expect(testoPerRilevamento("Dati", testo)).toBe("Dati\nRicevuto.");
  });

  it("non taglia la riga propria che precede un'intestazione di risposta su una sola riga", () => {
    const italiano = "Il giorno 5 ci vediamo.\nIl giorno lun 1 set 2026 alle ore 10:00 Marco <m@x.it> ha scritto:\n> ciao";
    expect(testoPerRilevamento("Incontro", italiano)).toBe("Incontro\nIl giorno 5 ci vediamo.");
    const inglese = "On Monday I will be out.\nOn Mon, Sep 1, 2026 Mark <m@example.com> wrote:\n> hi";
    expect(testoPerRilevamento("Ferie", inglese)).toBe("Ferie\nOn Monday I will be out.");
  });

  it("riconosce il blocco di intestazioni di Outlook", () => {
    const testo = "Ricevuto, grazie.\n\nFrom: Mark Smith <mark@example.com>\nSent: Monday, September 1, 2026 10:00 AM\nTo: me\nSubject: data\n\nPlease send the data.";
    expect(testoPerRilevamento("Dati", testo)).toBe("Dati\nRicevuto, grazie.");
    const italiano = "Ricevuto.\nDa: Marco Rossi\nInviato: lunedì 1 settembre 2026 10:00\nA: io\n\nMandami i dati.";
    expect(testoPerRilevamento("Dati", italiano)).toBe("Dati\nRicevuto.");
  });

  it("non taglia una riga che inizia come un'intestazione senza esserlo", () => {
    const testo = "Da: lunedì sono in ferie.\nOn Monday I will be out.";
    expect(testoPerRilevamento("Ferie", testo)).toBe("Ferie\nDa: lunedì sono in ferie.\nOn Monday I will be out.");
  });

  it("con il solo testo citato resta l'oggetto", () => {
    expect(testoPerRilevamento("Report", "On Mon, Sep 1, 2026 Mark <m@example.com> wrote:\n> hi")).toBe("Report");
  });

  it("tronca al massimo senza spezzare un carattere fuori dal piano base", () => {
    expect(testoPerRilevamento("abc", "d".repeat(50), 10)).toBe("abc\ndddddd");
    expect(testoPerRilevamento("abcdefgh", "🙂🙂", 10)).toBe("abcdefgh");
    expect(testoPerRilevamento("abcdefg", "🙂🙂", 10)).toBe("abcdefg\n🙂");
  });

  it("usa 2000 caratteri come massimo predefinito", () => {
    expect(testoPerRilevamento("", "x".repeat(3000))).toHaveLength(2000);
  });
});

describe("scegliLingua", () => {
  const base = {
    correzione: null,
    rilevamento: null,
    linguaThread: null,
    linguaRisposta: null,
    linguaInterfaccia: "en",
  };

  it("la correzione dell'utente prevale su tutto", () => {
    expect(scegliLingua({ ...base, correzione: "de", rilevamento: { lingua: "it", affidabile: true }, linguaThread: "fr" })).toEqual({
      lingua: "de",
      fonte: "utente",
    });
  });

  it("usa il rilevamento affidabile", () => {
    expect(scegliLingua({ ...base, rilevamento: { lingua: "it", affidabile: true }, linguaThread: "fr" })).toEqual({
      lingua: "it",
      fonte: "rilevata",
    });
  });

  it("con rilevamento poco affidabile ripiega su thread, email a cui risponde, interfaccia", () => {
    const incerto = { lingua: "it", affidabile: false };
    expect(scegliLingua({ ...base, rilevamento: incerto, linguaThread: "fr", linguaRisposta: "es" })).toEqual({
      lingua: "fr",
      fonte: "thread",
    });
    expect(scegliLingua({ ...base, rilevamento: incerto, linguaRisposta: "es" })).toEqual({ lingua: "es", fonte: "risposta" });
    expect(scegliLingua({ ...base, rilevamento: incerto })).toEqual({ lingua: "en", fonte: "interfaccia" });
    expect(scegliLingua({ ...base, rilevamento: { lingua: null, affidabile: true } })).toEqual({ lingua: "en", fonte: "interfaccia" });
  });

  it("ignora valori vuoti", () => {
    expect(scegliLingua({ ...base, correzione: " ", linguaThread: "" })).toEqual({ lingua: "en", fonte: "interfaccia" });
  });
});

describe("linguaVoceRiepilogo", () => {
  it("usa la lingua delle fonti se è unica, altrimenti quella dell'interfaccia", () => {
    expect(linguaVoceRiepilogo(["it", "it"], "en")).toBe("it");
    expect(linguaVoceRiepilogo(["it", "fr"], "en")).toBe("en");
    expect(linguaVoceRiepilogo([], "en")).toBe("en");
  });
});
