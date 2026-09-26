import { describe, expect, it } from "vitest";
import { DepositoChiaviInMemoria } from "../src/index";

describe("DepositoChiaviInMemoria", () => {
  it("crea solo se assente e restituisce la chiave già presente", async () => {
    const deposito = new DepositoChiaviInMemoria();
    expect(await deposito.creaSeAssente("u1", Uint8Array.of(1), 1)).toEqual({ dekCifrata: Uint8Array.of(1), versioneKek: 1 });
    expect(await deposito.creaSeAssente("u1", Uint8Array.of(2), 2)).toEqual({ dekCifrata: Uint8Array.of(1), versioneKek: 1 });
    expect(await deposito.leggi("u1")).toEqual({ dekCifrata: Uint8Array.of(1), versioneKek: 1 });
  });

  it("aggiorna solo chiavi esistenti", async () => {
    const deposito = new DepositoChiaviInMemoria();
    await deposito.aggiorna("u1", Uint8Array.of(1), 1);
    expect(await deposito.leggi("u1")).toBeNull();
    await deposito.creaSeAssente("u1", Uint8Array.of(1), 1);
    await deposito.aggiorna("u1", Uint8Array.of(2), 2);
    expect(await deposito.leggi("u1")).toEqual({ dekCifrata: Uint8Array.of(2), versioneKek: 2 });
  });

  it("elimina la chiave di un solo utente", async () => {
    const deposito = new DepositoChiaviInMemoria();
    await deposito.creaSeAssente("u1", Uint8Array.of(1), 1);
    await deposito.creaSeAssente("u2", Uint8Array.of(2), 1);
    await deposito.elimina("u1");
    expect(await deposito.leggi("u1")).toBeNull();
    expect(await deposito.leggi("u2")).not.toBeNull();
  });

  it("non condivide i byte con chi scrive o legge", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const scritta = Uint8Array.of(1);
    await deposito.creaSeAssente("u1", scritta, 1);
    scritta[0] = 9;
    (await deposito.leggi("u1"))!.dekCifrata[0] = 9;
    expect(await deposito.leggi("u1")).toEqual({ dekCifrata: Uint8Array.of(1), versioneKek: 1 });
  });
});
