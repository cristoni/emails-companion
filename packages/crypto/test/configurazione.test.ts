import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CassaforteBusta,
  DepositoChiaviInMemoria,
  ErroreConfigurazioneChiavi,
  caricaConfigurazioneChiavi,
  generaChiaveBase64,
  type OpzioniCassaforteBusta,
} from "../src/index";

const v1 = generaChiaveBase64();
const v2 = generaChiaveBase64();
const globale = generaChiaveBase64();

function ambiente(sostituzioni: Record<string, string | undefined> = {}) {
  return {
    EC_CHIAVE_PRINCIPALE_V1: v1,
    EC_CHIAVE_PRINCIPALE_ATTIVA: "1",
    EC_CHIAVE_INDICI_GLOBALI: globale,
    ALTRA_VARIABILE: "ignorata",
    ...sostituzioni,
  };
}

function errore(azione: () => unknown): ErroreConfigurazioneChiavi {
  try {
    azione();
  } catch (e) {
    expect(e).toBeInstanceOf(ErroreConfigurazioneChiavi);
    return e as ErroreConfigurazioneChiavi;
  }
  throw new Error("nessun errore");
}

describe("generaChiaveBase64", () => {
  it("genera 32 byte casuali in base64", () => {
    expect(Buffer.from(v1, "base64").length).toBe(32);
    expect(v1).not.toBe(v2);
  });
});

describe("caricaConfigurazioneChiavi", () => {
  it("legge chiavi principali, versione attiva e chiave degli indici globali", async () => {
    const configurazione = caricaConfigurazioneChiavi(ambiente({ EC_CHIAVE_PRINCIPALE_V2: v2, EC_CHIAVE_PRINCIPALE_ATTIVA: "2" }));
    expect(configurazione.versioneAttiva).toBe(2);
    expect(Object.keys(configurazione.chiaviPrincipali).sort()).toEqual(["1", "2"]);
    expect(Buffer.from(configurazione.chiaviPrincipali[1]!).toString("base64")).toBe(v1);
    expect(Buffer.from(configurazione.chiaviPrincipali[2]!).toString("base64")).toBe(v2);
    expect(Buffer.from(configurazione.chiaveIndiciGlobali).toString("base64")).toBe(globale);

    const cassaforte = new CassaforteBusta({ ...configurazione, deposito: new DepositoChiaviInMemoria() });
    const contesto = { utenteId: "u1", tabella: "email", colonna: "oggetto", id: "e1" };
    expect(await cassaforte.decifra(contesto, await cassaforte.cifra(contesto, "ok"))).toBe("ok");
  });

  it("accetta spazi o a capo attorno ai valori", () => {
    expect(caricaConfigurazioneChiavi(ambiente({ EC_CHIAVE_PRINCIPALE_V1: ` ${v1}\n` })).versioneAttiva).toBe(1);
  });

  it.each([
    ["EC_CHIAVE_PRINCIPALE_ATTIVA", { EC_CHIAVE_PRINCIPALE_ATTIVA: undefined }],
    ["EC_CHIAVE_PRINCIPALE_ATTIVA", { EC_CHIAVE_PRINCIPALE_ATTIVA: "" }],
    ["EC_CHIAVE_INDICI_GLOBALI", { EC_CHIAVE_INDICI_GLOBALI: undefined }],
    ["EC_CHIAVE_PRINCIPALE_V1", { EC_CHIAVE_PRINCIPALE_V1: undefined }],
    ["EC_CHIAVE_PRINCIPALE_V2", { EC_CHIAVE_PRINCIPALE_ATTIVA: "2" }],
  ])("segnala la variabile mancante %s", (voce, sostituzioni) => {
    const e = errore(() => caricaConfigurazioneChiavi(ambiente(sostituzioni)));
    expect(e.codice).toBe("variabile_mancante");
    expect(e.voce).toBe(voce);
    expect(e.message).toContain(voce);
  });

  it("accetta la versione più alta che entra in un integer di Postgres", () => {
    const configurazione = caricaConfigurazioneChiavi(
      ambiente({ EC_CHIAVE_PRINCIPALE_V2147483647: v2, EC_CHIAVE_PRINCIPALE_ATTIVA: "2147483647" }),
    );
    expect(configurazione.versioneAttiva).toBe(2147483647);
  });

  it.each(["0", "01", "+2", "2.0", "1e0", "uno", "-1", "1 2", "2147483648", "99999999999999999999"])(
    "rifiuta la versione attiva %j",
    (valore) => {
      const e = errore(() => caricaConfigurazioneChiavi(ambiente({ EC_CHIAVE_PRINCIPALE_ATTIVA: valore })));
      expect(e.codice).toBe("versione_non_valida");
      expect(e.voce).toBe("EC_CHIAVE_PRINCIPALE_ATTIVA");
    },
  );

  it.each([
    "EC_CHIAVE_PRINCIPALE_V01",
    "EC_CHIAVE_PRINCIPALE_V0",
    "EC_CHIAVE_PRINCIPALE_VX",
    "EC_CHIAVE_PRINCIPALE_V2147483648",
  ])(
    "rifiuta il nome di versione %s",
    (nome) => {
      const e = errore(() => caricaConfigurazioneChiavi(ambiente({ [nome]: v2 })));
      expect(e.codice).toBe("versione_non_valida");
      expect(e.voce).toBe(nome);
    },
  );

  it.each([
    ["non base64", "canarino-segreto!!"],
    ["16 byte", randomBytes(16).toString("base64")],
    ["33 byte", randomBytes(33).toString("base64")],
    ["base64url", Buffer.from(randomBytes(32)).toString("base64url")],
  ])("rifiuta una chiave %s senza riportarne il valore", (_, valore) => {
    for (const voce of ["EC_CHIAVE_PRINCIPALE_V1", "EC_CHIAVE_INDICI_GLOBALI"]) {
      const e = errore(() => caricaConfigurazioneChiavi(ambiente({ [voce]: valore })));
      expect(e.codice).toBe("chiave_non_valida");
      expect(e.voce).toBe(voce);
      expect(`${String(e)} ${e.message} ${JSON.stringify(e)}`).not.toContain(valore.trim().slice(0, 12));
    }
  });

  it("rifiuta una chiave degli indici globali uguale a una chiave principale", () => {
    const e = errore(() => caricaConfigurazioneChiavi(ambiente({ EC_CHIAVE_INDICI_GLOBALI: v1 })));
    expect(e.codice).toBe("chiavi_non_distinte");
    expect(e.voce).toBe("EC_CHIAVE_INDICI_GLOBALI");
    expect(e.message).not.toContain(v1.slice(0, 12));
  });
});

describe("CassaforteBusta: validazione delle chiavi", () => {
  const valide: OpzioniCassaforteBusta = {
    chiaviPrincipali: { 1: randomBytes(32) },
    versioneAttiva: 1,
    chiaveIndiciGlobali: randomBytes(32),
    deposito: new DepositoChiaviInMemoria(),
  };

  it.each<[string, string, Partial<OpzioniCassaforteBusta>]>([
    ["chiave_non_valida", "chiaviPrincipali", { chiaviPrincipali: { 1: randomBytes(16) } }],
    ["versione_non_valida", "chiaviPrincipali", { chiaviPrincipali: { 0: randomBytes(32), 1: randomBytes(32) } }],
    [
      "versione_non_valida",
      "chiaviPrincipali",
      { chiaviPrincipali: { 1: randomBytes(32), 2147483648: randomBytes(32) } },
    ],
    ["versione_attiva_senza_chiave", "versioneAttiva", { versioneAttiva: 2 }],
    ["chiave_non_valida", "chiaveIndiciGlobali", { chiaveIndiciGlobali: randomBytes(31) }],
    ["chiavi_non_distinte", "chiaveIndiciGlobali", { chiaveIndiciGlobali: valide.chiaviPrincipali[1]! }],
  ])("segnala %s su %s", (codice, voce, sostituzioni) => {
    const e = errore(() => new CassaforteBusta({ ...valide, ...sostituzioni }));
    expect(e.codice).toBe(codice);
    expect(e.voce).toBe(voce);
  });

  it("non dipende da modifiche successive ai byte delle chiavi ricevute", async () => {
    const chiave = randomBytes(32);
    const originale = Buffer.from(chiave);
    const deposito = new DepositoChiaviInMemoria();
    const cassaforte = new CassaforteBusta({ ...valide, chiaviPrincipali: { 1: chiave }, deposito });
    chiave.fill(0);
    const contesto = { utenteId: "u1", tabella: "email", colonna: "oggetto", id: "e1" };
    const cifrato = await cassaforte.cifra(contesto, "ok");
    const altra = new CassaforteBusta({ ...valide, chiaviPrincipali: { 1: originale }, deposito });
    expect(await altra.decifra(contesto, cifrato)).toBe("ok");
  });
});
