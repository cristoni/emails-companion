import { describe, expect, it } from "vitest";
import { htmlInTesto } from "../src";

const newsletter = `<!doctype html>
<html>
<head><title>Offerte</title><style>.x { color: red }</style></head>
<body>
  <div style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    Anteprima nascosta: sconto del 30% solo oggi&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>
  <table role="presentation"><tr><td><img src="https://example.com/logo.png" alt="Logo Negozio"></td></tr></table>
  <h1>Novità di settembre</h1>
  <p>Ciao Marco, ecco le novità del mese.</p>
  <script>document.write("tracciamento")</script>
</body>
</html>`;

describe("htmlInTesto", () => {
  it("estrae il testo visibile senza anteprima nascosta, immagini, script e stili", () => {
    const testo = htmlInTesto(newsletter);
    expect(testo).toContain("Novità di settembre");
    expect(testo).toContain("Ciao Marco, ecco le novità del mese.");
    expect(testo).not.toContain("Anteprima nascosta");
    expect(testo).not.toContain("Logo Negozio");
    expect(testo).not.toContain("logo.png");
    expect(testo).not.toContain("tracciamento");
    expect(testo).not.toContain("color");
    expect(testo).not.toContain("Offerte");
  });

  it.each([
    ['<p hidden>X</p>', "attributo hidden"],
    ['<div aria-hidden="true">X</div>', "aria-hidden"],
    ['<div aria-hidden="TRUE">X</div>', "aria-hidden in maiuscolo"],
    ['<span style="display:none">X</span>', "display:none"],
    ['<span style="color: red; display: none">X</span>', "display: none"],
    ['<span style="DISPLAY:NONE !important">X</span>', "display:none in maiuscolo"],
    ['<span style="visibility:hidden">X</span>', "visibility:hidden"],
    ['<span style="visibility: hidden;">X</span>', "visibility: hidden"],
    ['<span style="font-size:0;line-height:0">X</span>', "font-size:0"],
    ['<span style="font-size: 0px">X</span>', "font-size: 0px"],
    ['<span style="color:#fff;font-size:0">X</span>', "font-size:0 in fondo"],
    ['<div style="max-height:0;overflow:hidden">X</div>', "max-height:0"],
    ['<div style="max-height: 0px; overflow: hidden">X</div>', "max-height: 0px"],
    ['<span style="opacity:0">X</span>', "opacity:0"],
    ['<span style="opacity: 0 !important">X</span>', "opacity: 0 !important"],
    ['<span style="font-size:0pt">X</span>', "font-size:0pt"],
    ['<span style="font-size: 0em">X</span>', "font-size: 0em"],
    ['<span style="font-size:0rem;">X</span>', "font-size:0rem"],
    ['<div style="max-height:0%">X</div>', "max-height:0%"],
    ['<title>X</title>', "title fuori da head"],
    ["<template><p>X</p></template>", "template"],
  ])("salta gli elementi nascosti: %s (%s)", (html) => {
    expect(htmlInTesto(`<p>Prima</p>${html}<p>Dopo</p>`)).toBe("Prima\n\nDopo");
  });

  it("salta gli elementi nascosti anche quando il tag ha un proprio formato", () => {
    const html =
      '<table><tr><td>cella</td><td style="display:none">X</td></tr></table>' +
      '<p>testo <a href="https://example.com" style="display:none">X</a>visibile</p><h1 hidden>X</h1>';
    expect(htmlInTesto(html)).toBe("cella\n\ntesto visibile");
  });

  it("conserva il testo con dimensioni o opacità non nulle", () => {
    const html =
      '<span style="font-size:0.9em">piccolo</span> <span style="opacity:0.8">chiaro</span> ' +
      '<span style="max-height:0.5em">basso</span> <span style="font-size:10px">dieci</span> ' +
      '<span style="font-size:0.5pt">mezzo</span> <span style="font-size:20%">venti</span>';
    expect(htmlInTesto(html)).toBe("piccolo chiaro basso dieci mezzo venti");
  });

  it("conserva gli elementi con attributi simili ma visibili", () => {
    const html =
      '<span aria-hidden="false">uno</span> <span data-hidden="true">due</span> ' +
      '<span style="display:block">tre</span> <span style="visibility:visible">quattro</span>';
    expect(htmlInTesto(html).split(/\s+/)).toEqual(["uno", "due", "tre", "quattro"]);
  });

  it("non tratta come nascosto il corpo di un head lasciato aperto", () => {
    expect(htmlInTesto("<head><title>Oggetto</title><p>visibile</p>")).toBe("visibile");
  });

  it("non converte in errore un HTML annidato in profondità e conserva il testo successivo", () => {
    const annidato = `${"<div>".repeat(5000)}profondo${"</div>".repeat(5000)}<p>dopo</p>`;
    expect(htmlInTesto(`<p>prima</p>${annidato}`)).toMatch(/^prima\n[\s\S]*dopo$/);
  });

  it("non ripete l'indirizzo di un link uguale al testo, ma lo mostra quando è diverso", () => {
    const html =
      '<p>Vedi <a href="https://example.com/doc">https://example.com/doc</a> ' +
      'oppure <a href="https://example.com/altro">questa pagina</a>.</p>';
    expect(htmlInTesto(html)).toBe(
      "Vedi https://example.com/doc oppure questa pagina [https://example.com/altro].",
    );
  });

  it("non ripete l'indirizzo di un link mailto uguale al testo", () => {
    expect(htmlInTesto('<p>Scrivi a <a href="mailto:ufficio@example.com">ufficio@example.com</a></p>')).toBe(
      "Scrivi a ufficio@example.com",
    );
  });

  it("non spezza le righe lunghe", () => {
    const frase = "parola ".repeat(40).trim();
    expect(htmlInTesto(`<p>${frase}</p>`)).toBe(frase);
  });

  it("separa le celle delle tabelle di impaginazione", () => {
    const html = "<table><tr><td>Ordine</td><td>12345</td></tr><tr><td>Totale</td><td>40 €</td></tr></table>";
    expect(htmlInTesto(html).split("\n").filter(Boolean)).toEqual(["Ordine", "12345", "Totale", "40 €"]);
  });

  it("restituisce una stringa vuota per un HTML senza testo", () => {
    expect(htmlInTesto("")).toBe("");
    expect(htmlInTesto('<img src="x.png" alt="solo immagine">')).toBe("");
  });
});
