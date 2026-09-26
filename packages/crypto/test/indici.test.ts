import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CassaforteBusta, DepositoChiaviInMemoria } from "../src/index";

const chiaviPrincipali = { 1: randomBytes(32) };
const chiaveIndiciGlobali = randomBytes(32);

function creaCassaforte(deposito = new DepositoChiaviInMemoria()) {
  return new CassaforteBusta({ chiaviPrincipali, versioneAttiva: 1, chiaveIndiciGlobali, deposito });
}

describe("CassaforteBusta: indici ciechi per utente", () => {
  it("è un HMAC-SHA256 esadecimale che non contiene il valore", async () => {
    const indice = await creaCassaforte().indice("u1", "indirizzo", "anna@example.com");
    expect(indice).toMatch(/^[0-9a-f]{64}$/);
    expect(indice).not.toContain("anna");
  });

  it("è deterministico per utente e dominio, anche da un'altra istanza sullo stesso deposito", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const a = await creaCassaforte(deposito).indice("u1", "indirizzo", "anna@example.com");
    const b = await creaCassaforte(deposito).indice("u1", "indirizzo", "anna@example.com");
    expect(b).toBe(a);
  });

  it("separa utenti, domini e valori", async () => {
    const cassaforte = creaCassaforte();
    const base = await cassaforte.indice("u1", "indirizzo", "anna@example.com");
    expect(await cassaforte.indice("u2", "indirizzo", "anna@example.com")).not.toBe(base);
    expect(await cassaforte.indice("u1", "message_id", "anna@example.com")).not.toBe(base);
    expect(await cassaforte.indice("u1", "indirizzo", "Anna@example.com")).not.toBe(base);
  });

  it("crea la chiave dati se l'utente non ne ha ancora una, e la riusa per cifrare", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const indice = await creaCassaforte(deposito).indice("u1", "indirizzo", "anna@example.com");
    expect(await deposito.leggi("u1")).not.toBeNull();
    const contesto = { utenteId: "u1", tabella: "email", colonna: "oggetto", id: "e1" };
    const cifrato = await creaCassaforte(deposito).cifra(contesto, "ok");
    const altra = creaCassaforte(deposito);
    expect(await altra.decifra(contesto, cifrato)).toBe("ok");
    expect(await altra.indice("u1", "indirizzo", "anna@example.com")).toBe(indice);
  });
});

describe("CassaforteBusta: indici ciechi globali", () => {
  it("è un HMAC-SHA256 con la chiave globale su `dominio:valore`, stabile tra istanze", () => {
    const atteso = createHmac("sha256", chiaveIndiciGlobali).update("account_esterno:1234567890").digest("hex");
    expect(creaCassaforte().indiceGlobale("account_esterno", "1234567890")).toBe(atteso);
    expect(creaCassaforte().indiceGlobale("account_esterno", "1234567890")).toBe(atteso);
  });

  it("separa i due domini e non dipende dalle chiavi degli utenti", async () => {
    const cassaforte = creaCassaforte();
    const globale = cassaforte.indiceGlobale("indirizzo_casella", "anna@example.com");
    expect(cassaforte.indiceGlobale("account_esterno", "anna@example.com")).not.toBe(globale);
    expect(await cassaforte.indice("u1", "indirizzo_casella", "anna@example.com")).not.toBe(globale);
  });
});
