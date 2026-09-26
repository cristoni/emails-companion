import { describe, expect, it } from "vitest";
import { daEscludereDallAnalisi, determinaDirezione, inAttesaDiCopiaInviata } from "../src/dominio/direzione";
import { minuti } from "./costruttori";

const indirizziUtente = new Set(["io@studio.it", "io@gmail.com"]);

describe("determinaDirezione", () => {
  it("è in entrata se il mittente non è dell'utente e nessuna copia è inviata", () => {
    expect(
      determinaDirezione({ cartelleCopie: [["in_arrivo"]], mittente: "anna@cliente.it", destinatari: ["io@studio.it"], indirizziUtente }),
    ).toBe("entrata");
  });

  it("è in uscita se il mittente è un indirizzo dell'utente, a meno di maiuscole e spazi", () => {
    expect(
      determinaDirezione({ cartelleCopie: [["in_arrivo"]], mittente: " IO@Studio.it", destinatari: ["anna@cliente.it"], indirizziUtente }),
    ).toBe("uscita");
  });

  it("è in uscita se una copia è tra le inviate, anche con un mittente sconosciuto", () => {
    expect(
      determinaDirezione({
        cartelleCopie: [["in_arrivo"], ["inviata"]],
        mittente: "alias-nuovo@studio.it",
        destinatari: ["anna@cliente.it"],
        indirizziUtente,
      }),
    ).toBe("uscita");
  });

  it("è interna se mittente e tutti i destinatari sono dell'utente", () => {
    expect(
      determinaDirezione({
        cartelleCopie: [["inviata", "in_arrivo"]],
        mittente: "io@studio.it",
        destinatari: ["IO@gmail.com", "io@studio.it"],
        indirizziUtente,
      }),
    ).toBe("interna");
  });

  it("non è interna se un destinatario è esterno o se non ci sono destinatari", () => {
    const base = { cartelleCopie: [["inviata" as const]], mittente: "io@studio.it", indirizziUtente };
    expect(determinaDirezione({ ...base, destinatari: ["io@gmail.com", "anna@cliente.it"] })).toBe("uscita");
    expect(determinaDirezione({ ...base, destinatari: [] })).toBe("uscita");
  });
});

describe("daEscludereDallAnalisi", () => {
  it("esclude un'email solo se ogni copia è in una cartella esclusa", () => {
    expect(daEscludereDallAnalisi([["spam"], ["cestino"]])).toBe(true);
    expect(daEscludereDallAnalisi([["bozza"]])).toBe(true);
    expect(daEscludereDallAnalisi([["chat"]])).toBe(true);
    expect(daEscludereDallAnalisi([["inviata", "cestino"]])).toBe(true);
    expect(daEscludereDallAnalisi([["spam"], ["in_arrivo"]])).toBe(false);
    expect(daEscludereDallAnalisi([["archiviata"]])).toBe(false);
    expect(daEscludereDallAnalisi([[]])).toBe(false);
  });

  it("esclude un'email senza copie: non c'è nulla da analizzare", () => {
    expect(daEscludereDallAnalisi([])).toBe(true);
  });
});

describe("inAttesaDiCopiaInviata", () => {
  const acquisitaIl = minuti(0);

  it("attende fino a 15 minuti la copia inviata di un'email con mittente dell'utente", () => {
    const base = { mittenteDellUtente: true, haCopiaInviata: false, acquisitaIl };
    expect(inAttesaDiCopiaInviata({ ...base, ora: minuti(14) })).toBe(true);
    expect(inAttesaDiCopiaInviata({ ...base, ora: minuti(15) })).toBe(false);
    expect(inAttesaDiCopiaInviata({ ...base, ora: minuti(20), minuti: 30 })).toBe(true);
  });

  it("non attende se la copia inviata c'è o il mittente non è dell'utente", () => {
    expect(inAttesaDiCopiaInviata({ mittenteDellUtente: true, haCopiaInviata: true, acquisitaIl, ora: minuti(1) })).toBe(false);
    expect(inAttesaDiCopiaInviata({ mittenteDellUtente: false, haCopiaInviata: false, acquisitaIl, ora: minuti(1) })).toBe(false);
  });
});
