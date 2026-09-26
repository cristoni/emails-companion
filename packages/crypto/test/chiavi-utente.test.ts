import { createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import type { ContestoCifratura } from "@ec/core";
import { describe, expect, it } from "vitest";
import {
  CassaforteBusta,
  DepositoChiaviInMemoria,
  ErroreCassaforte,
  type DepositoChiaviUtente,
} from "../src/index";

const k1 = randomBytes(32);
const k2 = randomBytes(32);
const chiaveIndiciGlobali = randomBytes(32);
const contesto: ContestoCifratura = { utenteId: "u1", tabella: "email", colonna: "oggetto", id: "e1" };

function creaCassaforte(
  deposito: DepositoChiaviUtente,
  chiaviPrincipali: Record<number, Uint8Array> = { 1: k1 },
  versioneAttiva = 1,
  capienzaCache?: number,
) {
  return new CassaforteBusta({ chiaviPrincipali, versioneAttiva, chiaveIndiciGlobali, deposito, capienzaCache });
}

async function codiceErrore(azione: Promise<unknown>): Promise<string> {
  try {
    await azione;
  } catch (errore) {
    expect(errore).toBeInstanceOf(ErroreCassaforte);
    return (errore as ErroreCassaforte).codice;
  }
  throw new Error("nessun errore");
}

/** Le letture si concludono solo quando tutti i partecipanti hanno letto: nessuno trova la chiave dell'altro. */
function conBarriera(deposito: DepositoChiaviUtente, partecipanti: number): DepositoChiaviUtente {
  let arrivati = 0;
  let apri = () => {};
  const barriera = new Promise<void>((risolvi) => (apri = risolvi));
  return {
    leggi: async (utenteId) => {
      const letto = await deposito.leggi(utenteId);
      if (++arrivati >= partecipanti) apri();
      await barriera;
      return letto;
    },
    creaSeAssente: (...argomenti) => deposito.creaSeAssente(...argomenti),
    aggiorna: (...argomenti) => deposito.aggiorna(...argomenti),
    elimina: (...argomenti) => deposito.elimina(...argomenti),
  };
}

function conConteggio(deposito: DepositoChiaviUtente) {
  const letture: string[] = [];
  const contato: DepositoChiaviUtente = {
    leggi: (utenteId) => {
      letture.push(utenteId);
      return deposito.leggi(utenteId);
    },
    creaSeAssente: (...argomenti) => deposito.creaSeAssente(...argomenti),
    aggiorna: (...argomenti) => deposito.aggiorna(...argomenti),
    elimina: (...argomenti) => deposito.elimina(...argomenti),
  };
  return { contato, letture };
}

function apri(chiave: Uint8Array, cifrato: Uint8Array, aad: string): Buffer {
  const decifratore = createDecipheriv("aes-256-gcm", chiave, cifrato.subarray(1, 13));
  decifratore.setAAD(Buffer.from(aad));
  decifratore.setAuthTag(cifrato.subarray(cifrato.length - 16));
  return Buffer.concat([decifratore.update(cifrato.subarray(13, cifrato.length - 16)), decifratore.final()]);
}

describe("CassaforteBusta: chiave dati per utente", () => {
  it("rispetta i formati persistiti di chiave dati, campi e indici", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const cassaforte = creaCassaforte(deposito);
    const cifrato = await cassaforte.cifra(contesto, "formato stabile");
    const indice = await cassaforte.indice("u1", "indirizzo", "anna@example.com");

    const riga = (await deposito.leggi("u1"))!;
    expect(riga.versioneKek).toBe(1);
    expect(riga.dekCifrata[0]).toBe(1);
    expect(riga.dekCifrata.length).toBe(1 + 12 + 32 + 16);
    const dek = apri(k1, riga.dekCifrata, "dek:u1:v1");
    expect(apri(dek, cifrato, "u1:email:oggetto:e1").toString("utf8")).toBe("formato stabile");
    const chiaveIndice = Buffer.from(hkdfSync("sha256", dek, "ec-indici", "indice:indirizzo", 32));
    expect(indice).toBe(createHmac("sha256", chiaveIndice).update("anna@example.com").digest("hex"));
  });

  it("due primi usi concorrenti da istanze diverse finiscono sulla stessa chiave dati", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const conflitto = conBarriera(deposito, 2);
    const [a, b] = await Promise.all([
      creaCassaforte(conflitto).cifra(contesto, "da a"),
      creaCassaforte(conflitto).cifra(contesto, "da b"),
    ]);
    const terza = creaCassaforte(deposito);
    expect(await terza.decifra(contesto, a)).toBe("da a");
    expect(await terza.decifra(contesto, b)).toBe("da b");
  });

  it("due primi usi concorrenti nella stessa istanza finiscono sulla stessa chiave dati", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const cassaforte = creaCassaforte(conBarriera(deposito, 2));
    const [a, indice] = await Promise.all([
      cassaforte.cifra(contesto, "primo"),
      cassaforte.indice("u1", "indirizzo", "anna@example.com"),
    ]);
    const altra = creaCassaforte(deposito);
    expect(await altra.decifra(contesto, a)).toBe("primo");
    expect(await altra.indice("u1", "indirizzo", "anna@example.com")).toBe(indice);
  });

  it("rifiuta una chiave dati spostata su un altro utente", async () => {
    const deposito = new DepositoChiaviInMemoria();
    await creaCassaforte(deposito).cifra(contesto, "x");
    const riga = (await deposito.leggi("u1"))!;
    await deposito.creaSeAssente("u2", riga.dekCifrata, riga.versioneKek);
    expect(await codiceErrore(creaCassaforte(deposito).cifra({ ...contesto, utenteId: "u2" }, "x"))).toBe(
      "chiave_utente_non_valida",
    );
  });

  it("tiene in memoria le chiavi dati degli utenti usati più di recente", async () => {
    const { contato, letture } = conConteggio(new DepositoChiaviInMemoria());
    const cassaforte = creaCassaforte(contato, { 1: k1 }, 1, 2);
    for (const utente of ["u1", "u2", "u1", "u3", "u1", "u2"]) await cassaforte.indice(utente, "d", "v");
    expect(letture).toEqual(["u1", "u2", "u3", "u2"]);
  });
});

describe("CassaforteBusta: rotazione della chiave principale", () => {
  it("decifra con la versione precedente e ricifra la chiave dati con quella attiva", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const cifrato = await creaCassaforte(deposito).cifra(contesto, "prima della rotazione");

    const ruotata = creaCassaforte(deposito, { 1: k1, 2: k2 }, 2);
    expect(await ruotata.decifra(contesto, cifrato)).toBe("prima della rotazione");
    expect(await ruotata.ruotaChiaveUtente("u1")).toBe(true);
    expect((await deposito.leggi("u1"))!.versioneKek).toBe(2);
    expect(await ruotata.ruotaChiaveUtente("u1")).toBe(false);

    expect(await creaCassaforte(deposito, { 2: k2 }, 2).decifra(contesto, cifrato)).toBe("prima della rotazione");
    expect(await codiceErrore(creaCassaforte(deposito, { 1: k1 }, 1).decifra(contesto, cifrato))).toBe(
      "versione_chiave_principale_sconosciuta",
    );
  });

  it("ricifra solo la busta: indici e cifrati precedenti restano validi", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const prima = creaCassaforte(deposito);
    const indice = await prima.indice("u1", "indirizzo", "anna@example.com");
    const dekCifrataPrima = (await deposito.leggi("u1"))!.dekCifrata;

    expect(await creaCassaforte(deposito, { 1: k1, 2: k2 }, 2).ruotaChiaveUtente("u1")).toBe(true);
    expect(Buffer.from((await deposito.leggi("u1"))!.dekCifrata).equals(Buffer.from(dekCifrataPrima))).toBe(false);
    expect(await creaCassaforte(deposito, { 2: k2 }, 2).indice("u1", "indirizzo", "anna@example.com")).toBe(indice);
  });

  it("non riporta a una versione precedente una chiave dati già ruotata", async () => {
    const deposito = new DepositoChiaviInMemoria();
    await creaCassaforte(deposito, { 1: k1, 2: k2 }, 2).cifra(contesto, "x");
    const indietro = creaCassaforte(deposito, { 1: k1, 2: k2 }, 1);
    expect(await indietro.ruotaChiaveUtente("u1")).toBe(false);
    expect((await deposito.leggi("u1"))!.versioneKek).toBe(2);
  });

  it("crea le nuove chiavi dati con la versione attiva", async () => {
    const deposito = new DepositoChiaviInMemoria();
    await creaCassaforte(deposito, { 1: k1, 2: k2 }, 2).cifra(contesto, "x");
    expect((await deposito.leggi("u1"))!.versioneKek).toBe(2);
  });

  it("non crea una chiave dati per un utente che non ne ha", async () => {
    const deposito = new DepositoChiaviInMemoria();
    expect(await creaCassaforte(deposito, { 1: k1, 2: k2 }, 2).ruotaChiaveUtente("u1")).toBe(false);
    expect(await deposito.leggi("u1")).toBeNull();
  });

  it("non resuscita una chiave dati eliminata durante la rotazione", async () => {
    const deposito = new DepositoChiaviInMemoria();
    await creaCassaforte(deposito).cifra(contesto, "x");
    const eliminaDopoLettura: DepositoChiaviUtente = {
      leggi: async (utenteId) => {
        const letto = await deposito.leggi(utenteId);
        await deposito.elimina(utenteId);
        return letto;
      },
      creaSeAssente: (...argomenti) => deposito.creaSeAssente(...argomenti),
      aggiorna: (...argomenti) => deposito.aggiorna(...argomenti),
      elimina: (...argomenti) => deposito.elimina(...argomenti),
    };
    await creaCassaforte(eliminaDopoLettura, { 1: k1, 2: k2 }, 2).ruotaChiaveUtente("u1");
    expect(await deposito.leggi("u1")).toBeNull();
  });
});

describe("CassaforteBusta: dimenticaUtente", () => {
  it("rende indecifrabili i vecchi cifrati, anche dopo la creazione di una nuova chiave dati", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const cassaforte = creaCassaforte(deposito);
    const vecchio = await cassaforte.cifra(contesto, "da dimenticare");
    const indicePrima = await cassaforte.indice("u1", "indirizzo", "anna@example.com");

    await cassaforte.dimenticaUtente("u1");
    expect(await deposito.leggi("u1")).toBeNull();
    expect(await codiceErrore(cassaforte.decifra(contesto, vecchio))).toBe("chiave_utente_assente");

    await cassaforte.cifra(contesto, "nuova chiave");
    expect(await codiceErrore(cassaforte.decifra(contesto, vecchio))).toBe("decifratura_fallita");
    expect(await codiceErrore(creaCassaforte(deposito).decifra(contesto, vecchio))).toBe("decifratura_fallita");
    expect(await cassaforte.indice("u1", "indirizzo", "anna@example.com")).not.toBe(indicePrima);
  });

  it("non rimette in memoria una chiave dati letta prima dell'eliminazione", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const vecchio = await creaCassaforte(deposito).cifra(contesto, "da dimenticare");
    let apriLettura = () => {};
    const lettura = new Promise<void>((risolvi) => (apriLettura = risolvi));
    const lento: DepositoChiaviUtente = {
      leggi: async (utenteId) => {
        const letto = await deposito.leggi(utenteId);
        await lettura;
        return letto;
      },
      creaSeAssente: (...argomenti) => deposito.creaSeAssente(...argomenti),
      aggiorna: (...argomenti) => deposito.aggiorna(...argomenti),
      elimina: (...argomenti) => deposito.elimina(...argomenti),
    };
    const cassaforte = creaCassaforte(lento);

    const inCorso = cassaforte.decifra(contesto, vecchio);
    await cassaforte.dimenticaUtente("u1");
    apriLettura();
    expect(await inCorso).toBe("da dimenticare");
    expect(await codiceErrore(cassaforte.decifra(contesto, vecchio))).toBe("chiave_utente_assente");
  });

  it("non rimette in memoria una chiave dati letta mentre l'eliminazione è in corso", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const vecchio = await creaCassaforte(deposito).cifra(contesto, "da dimenticare");
    let apriEliminazione = () => {};
    const eliminazione = new Promise<void>((risolvi) => (apriEliminazione = risolvi));
    let apriLettura = () => {};
    const lettura = new Promise<void>((risolvi) => (apriLettura = risolvi));
    const lento: DepositoChiaviUtente = {
      leggi: async (utenteId) => {
        const letto = await deposito.leggi(utenteId);
        await lettura;
        return letto;
      },
      creaSeAssente: (...argomenti) => deposito.creaSeAssente(...argomenti),
      aggiorna: (...argomenti) => deposito.aggiorna(...argomenti),
      elimina: async (utenteId) => {
        await eliminazione;
        await deposito.elimina(utenteId);
      },
    };
    const cassaforte = creaCassaforte(lento);

    const dimenticanza = cassaforte.dimenticaUtente("u1");
    const inCorso = cassaforte.decifra(contesto, vecchio);
    apriEliminazione();
    await dimenticanza;
    apriLettura();
    expect(await inCorso).toBe("da dimenticare");
    expect(await codiceErrore(cassaforte.decifra(contesto, vecchio))).toBe("chiave_utente_assente");
  });

  it("non tocca le chiavi degli altri utenti", async () => {
    const deposito = new DepositoChiaviInMemoria();
    const cassaforte = creaCassaforte(deposito);
    const altro = { ...contesto, utenteId: "u2" };
    const cifrato = await cassaforte.cifra(altro, "resta");
    await cassaforte.dimenticaUtente("u1");
    expect(await creaCassaforte(deposito).decifra(altro, cifrato)).toBe("resta");
  });
});
