import { randomBytes } from "node:crypto";
import type { ContestoCifratura } from "@ec/core";
import { describe, expect, it } from "vitest";
import { CassaforteBusta, DepositoChiaviInMemoria, ErroreCassaforte } from "../src/index";

function creaCassaforte(deposito = new DepositoChiaviInMemoria()) {
  return new CassaforteBusta({
    chiaviPrincipali: { 1: randomBytes(32) },
    versioneAttiva: 1,
    chiaveIndiciGlobali: randomBytes(32),
    deposito,
  });
}

const contesto: ContestoCifratura = { utenteId: "u1", tabella: "email", colonna: "oggetto", id: "e1" };

async function codiceErrore(azione: Promise<unknown>): Promise<string> {
  try {
    await azione;
  } catch (errore) {
    expect(errore).toBeInstanceOf(ErroreCassaforte);
    return (errore as ErroreCassaforte).codice;
  }
  throw new Error("nessun errore");
}

describe("CassaforteBusta: cifra e decifra", () => {
  it.each([
    ["testo semplice", "Ciao Anna, mi mandi il report?"],
    ["emoji", "ok 🙂👍🏽 fatto"],
    ["cinese", "请在星期五之前发送报告"],
    ["stringa vuota", ""],
    ["BOM iniziale", "﻿ciao"],
  ])("restituisce il testo originale (%s)", async (_, testo) => {
    const cassaforte = creaCassaforte();
    const cifrato = await cassaforte.cifra(contesto, testo);
    expect(await cassaforte.decifra(contesto, cifrato)).toBe(testo);
  });

  it("produce il formato [1][IV 12][cifrato][tag 16] senza il testo in chiaro", async () => {
    const cassaforte = creaCassaforte();
    const testo = "canarino-segreto";
    const cifrato = await cassaforte.cifra(contesto, testo);
    expect(cifrato[0]).toBe(1);
    expect(cifrato.length).toBe(1 + 12 + Buffer.byteLength(testo) + 16);
    expect(Buffer.from(cifrato).includes(testo)).toBe(false);
    expect((await cassaforte.cifra(contesto, "")).length).toBe(29);
  });

  it("restituisce byte con un buffer proprio, senza altri dati del processo attorno", async () => {
    const cifrato = await creaCassaforte().cifra(contesto, "breve");
    expect(cifrato.byteOffset).toBe(0);
    expect(cifrato.buffer.byteLength).toBe(cifrato.length);
  });

  it("usa un IV diverso a ogni cifratura", async () => {
    const cassaforte = creaCassaforte();
    const a = await cassaforte.cifra(contesto, "uguale");
    const b = await cassaforte.cifra(contesto, "uguale");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it.each([
    ["tabella", { tabella: "bozza" }],
    ["colonna", { colonna: "testo" }],
    ["id", { id: "e2" }],
  ])("rifiuta un contesto con %s diverso", async (_, variazione) => {
    const cassaforte = creaCassaforte();
    const cifrato = await cassaforte.cifra(contesto, "segreto");
    expect(await codiceErrore(cassaforte.decifra({ ...contesto, ...variazione }, cifrato))).toBe("decifratura_fallita");
  });

  it("rifiuta un cifrato spostato su un altro utente", async () => {
    const cassaforte = creaCassaforte();
    const altro: ContestoCifratura = { ...contesto, utenteId: "u2" };
    await cassaforte.cifra(altro, "dati di u2");
    const cifrato = await cassaforte.cifra(contesto, "segreto");
    expect(await codiceErrore(cassaforte.decifra(altro, cifrato))).toBe("decifratura_fallita");
  });

  it.each([
    ["IV", 5],
    ["cifrato", 14],
    ["tag", -1],
  ])("rifiuta un cifrato alterato nel %s", async (_, posizione) => {
    const cassaforte = creaCassaforte();
    const cifrato = Uint8Array.from(await cassaforte.cifra(contesto, "segreto"));
    const i = posizione < 0 ? cifrato.length + posizione : posizione;
    cifrato[i] = cifrato[i]! ^ 0xff;
    expect(await codiceErrore(cassaforte.decifra(contesto, cifrato))).toBe("decifratura_fallita");
  });

  it("rifiuta un byte di formato sconosciuto", async () => {
    const cassaforte = creaCassaforte();
    const cifrato = Uint8Array.from(await cassaforte.cifra(contesto, "segreto"));
    cifrato[0] = 2;
    expect(await codiceErrore(cassaforte.decifra(contesto, cifrato))).toBe("formato_non_supportato");
  });

  it.each([
    ["vuoto", 0],
    ["solo IV", 13],
    ["più corto del minimo", 28],
  ])("rifiuta un cifrato troncato (%s)", async (_, lunghezza) => {
    const cassaforte = creaCassaforte();
    const cifrato = await cassaforte.cifra(contesto, "segreto");
    expect(await codiceErrore(cassaforte.decifra(contesto, cifrato.subarray(0, lunghezza)))).toBe(
      "formato_non_supportato",
    );
  });

  it("non inserisce testo, contesto o chiavi nel messaggio d'errore", async () => {
    const cassaforte = creaCassaforte();
    const cifrato = Uint8Array.from(await cassaforte.cifra(contesto, "canarino-segreto"));
    cifrato[20] = cifrato[20]! ^ 0xff;
    const errore = await cassaforte.decifra(contesto, cifrato).catch((e: unknown) => e);
    const reso = `${String(errore)} ${(errore as Error).message} ${JSON.stringify(errore)}`;
    expect((errore as Error).message).toBe("decifratura_fallita");
    for (const dato of ["canarino", "u1", "email", "oggetto", "e1"]) expect(reso).not.toContain(dato);
  });

  it.each([
    ["utenteId", { utenteId: "u:1" }],
    ["tabella", { tabella: "a:b" }],
    ["colonna", { colonna: "" }],
    ["id", { id: "" }],
  ])("rifiuta un contesto ambiguo o incompleto (%s)", async (_, variazione) => {
    const cassaforte = creaCassaforte();
    expect(await codiceErrore(cassaforte.cifra({ ...contesto, ...variazione }, "x"))).toBe("contesto_non_valido");
  });

  it("accetta i due punti nell'id, ultimo componente del contesto", async () => {
    const cassaforte = creaCassaforte();
    const conId = { ...contesto, id: "a:b:c" };
    expect(await cassaforte.decifra(conId, await cassaforte.cifra(conId, "ok"))).toBe("ok");
  });

  it("non crea una chiave dati per decifrare", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const cassaforte = creaCassaforte(deposito);
    const cifrato = await creaCassaforte().cifra(contesto, "altrove");
    expect(await codiceErrore(cassaforte.decifra(contesto, cifrato))).toBe("chiave_utente_assente");
    expect(await deposito.leggi("u1")).toBeNull();
  });
});
