import { describe, expect, it } from "vitest";
import { anteprima, normalizzaTesto, testoPerAnalisi } from "../src";

describe("normalizzaTesto", () => {
  it("rimuove i caratteri a larghezza zero e invisibili", () => {
    const testo = "Con\u200Bfer\u200Cma\u200D l'or\u2060di\uFEFFne a\u00ADdesso";
    expect(normalizzaTesto(testo)).toBe("Conferma l'ordine adesso");
  });

  it("uniforma CRLF e CR in LF", () => {
    expect(normalizzaTesto("uno\r\ndue\rtre\nquattro")).toBe("uno\ndue\ntre\nquattro");
  });

  it("toglie gli spazi in fondo a ogni riga, compresi quelli non separabili, ma non l'indentazione", () => {
    expect(normalizzaTesto("Ciao  \t\n  > citato\u00A0\u00A0\nfine")).toBe("Ciao\n  > citato\nfine");
  });

  it("riduce tre o più righe vuote consecutive a due", () => {
    expect(normalizzaTesto("a\n\n\n\n\n\nb\n\n\nc\n\nd")).toBe("a\n\n\nb\n\n\nc\n\nd");
  });

  it("considera vuote le righe fatte solo di spazi", () => {
    expect(normalizzaTesto("a\n \n\t\n\u00A0\n  \nb")).toBe("a\n\n\nb");
  });

  it("toglie spazi e righe vuote all'inizio e alla fine", () => {
    expect(normalizzaTesto("\n\n  \u200B Ciao\n\n\n")).toBe("Ciao");
  });

  it("resta lineare su una lunga sequenza di spazi dentro una riga", () => {
    const testo = `a${" ".repeat(50_000)}b\n${" \t".repeat(25_000)}c`;
    const inizio = performance.now();
    expect(normalizzaTesto(testo)).toHaveLength(testo.length);
    expect(performance.now() - inizio).toBeLessThan(200);
  });
});

describe("testoPerAnalisi", () => {
  const html = '<div style="display:none">anteprima nascosta</div><p>Versione <b>HTML</b></p>';

  it("preferisce la parte di testo semplice a quella HTML", () => {
    expect(testoPerAnalisi({ testo: "Versione testo\r\n", html })).toBe("Versione testo");
  });

  it("usa l'HTML quando manca il testo semplice", () => {
    expect(testoPerAnalisi({ html })).toBe("Versione HTML");
    expect(testoPerAnalisi({ testo: null, html })).toBe("Versione HTML");
  });

  it("usa l'HTML quando il testo semplice è vuoto o fatto solo di spazi e caratteri invisibili", () => {
    expect(testoPerAnalisi({ testo: "  \n ", html })).toBe("Versione HTML");
    expect(testoPerAnalisi({ testo: "\u200B\uFEFF\n", html })).toBe("Versione HTML");
  });

  it("restituisce una stringa vuota senza alcuna parte", () => {
    expect(testoPerAnalisi({})).toBe("");
    expect(testoPerAnalisi({ testo: null, html: null })).toBe("");
  });

  it("normalizza il testo scelto", () => {
    expect(testoPerAnalisi({ testo: "Ciao\u200B  \r\n\r\n\r\n\r\n\r\nMarco" })).toBe("Ciao\n\n\nMarco");
  });

  it("tronca al limite indicato, per impostazione a 32 KB", () => {
    const lungo = "a".repeat(40 * 1024);
    expect(testoPerAnalisi({ testo: lungo })).toHaveLength(32 * 1024);
    expect(testoPerAnalisi({ testo: "abcdefghij" }, 4)).toBe("abcd");
  });

  it("resta in forma normalizzata quando il taglio cade dopo uno spazio", () => {
    const risultato = testoPerAnalisi({ testo: "abc def" }, 4);
    expect(risultato).toBe("abc");
    expect(normalizzaTesto(risultato)).toBe(risultato);
  });

  it("non spezza una coppia surrogata sul limite", () => {
    const testo = "abc😀def";
    expect(testoPerAnalisi({ testo }, 4)).toBe("abc");
    expect(testoPerAnalisi({ testo }, 5)).toBe("abc😀");
  });
});

describe("anteprima", () => {
  it("restituisce una sola riga con gli spazi compressi", () => {
    expect(anteprima("  Ciao Marco,\n\n  ti  scrivo\tper\u200B la riunione.  ")).toBe(
      "Ciao Marco, ti scrivo per la riunione.",
    );
  });

  it("lascia intatto un testo entro la lunghezza", () => {
    const testo = "x".repeat(200);
    expect(anteprima(testo)).toBe(testo);
  });

  it("tronca con i puntini di sospensione senza superare la lunghezza", () => {
    const risultato = anteprima("parola ".repeat(100));
    expect(risultato.length).toBeLessThanOrEqual(200);
    expect(risultato.endsWith("…")).toBe(true);
    expect(anteprima("abcdefghij", 5)).toBe("abcd…");
  });

  it("ignora il riempimento invisibile dell'anteprima delle newsletter", () => {
    const testo = `Solo oggi: sconto del 30%${" \u034F\u200C\u00A0".repeat(60)}\nCiao Marco, ecco le novità.`;
    expect(anteprima(testo)).toBe("Solo oggi: sconto del 30% Ciao Marco, ecco le novità.");
    expect(normalizzaTesto(testo)).toBe("Solo oggi: sconto del 30%\nCiao Marco, ecco le novità.");
  });

  it("non lascia uno spazio prima dei puntini", () => {
    expect(anteprima("abc def ghi", 5)).toBe("abc…");
  });

  it("non spezza una coppia surrogata", () => {
    expect(anteprima("abc😀def", 5)).toBe("abc…");
  });
});
