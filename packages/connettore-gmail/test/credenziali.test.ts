import { describe, expect, it, vi } from "vitest";
import { ErroreConnettore } from "@ec/core";
import { accessTokenValido, creaAuthPerCasella, type CredenzialiSalvate, type DepositoCredenziali } from "../src/credenziali";

const ORA = new Date("2026-09-27T10:00:00Z");
const tra = (ms: number) => new Date(ORA.getTime() + ms);
const MINUTO = 60_000;

function deposito(credenziali: CredenzialiSalvate | null, salvato = true) {
  return {
    leggi: vi.fn(async (_casellaId: string) => credenziali),
    salvaAccessoSeValido: vi.fn(async (_c: string, _g: number, _t: string, _s: Date) => salvato),
    segnaDaRicollegare: vi.fn(async (_c: string, _g: number) => {}),
  } satisfies DepositoCredenziali;
}

const salvate = (parziali: Partial<CredenzialiSalvate> = {}): CredenzialiSalvate => ({
  refreshToken: "rinnovo",
  accessToken: "salvato",
  scadenzaAccesso: tra(10 * MINUTO),
  generazione: 3,
  ...parziali,
});

const nuovo = { accessToken: "nuovo", scadenza: tra(60 * MINUTO) };

describe("accessTokenValido", () => {
  it("riusa il token salvato se scade tra più di 2 minuti", async () => {
    const d = deposito(salvate({ scadenzaAccesso: tra(2 * MINUTO + 1) }));
    const rinnova = vi.fn(async () => nuovo);

    expect(await accessTokenValido("c1", d, rinnova, () => ORA)).toBe("salvato");
    expect(d.leggi).toHaveBeenCalledWith("c1");
    expect(rinnova).not.toHaveBeenCalled();
  });

  it.each([
    ["scade entro 2 minuti", salvate({ scadenzaAccesso: tra(2 * MINUTO) })],
    ["è già scaduto", salvate({ scadenzaAccesso: tra(-MINUTO) })],
    ["manca", salvate({ accessToken: null, scadenzaAccesso: null })],
  ])("rinnova e salva in modo condizionale se il token %s", async (_, credenziali) => {
    const d = deposito(credenziali);
    const rinnova = vi.fn(async (_r: string) => nuovo);

    expect(await accessTokenValido("c1", d, rinnova, () => ORA)).toBe("nuovo");
    expect(rinnova).toHaveBeenCalledWith("rinnovo");
    expect(d.salvaAccessoSeValido).toHaveBeenCalledWith("c1", 3, "nuovo", nuovo.scadenza);
  });

  it("usa il token rinnovato anche se un altro processo ha già salvato", async () => {
    const d = deposito(salvate({ scadenzaAccesso: tra(MINUTO) }), false);
    expect(await accessTokenValido("c1", d, async () => nuovo, () => ORA)).toBe("nuovo");
  });

  it.each([
    ["senza refresh token", salvate({ refreshToken: null, scadenzaAccesso: tra(MINUTO) })],
    ["senza credenziali", null],
  ])("%s → autorizzazione_revocata, senza rinnovare", async (_, credenziali) => {
    const d = deposito(credenziali);
    const rinnova = vi.fn(async () => nuovo);

    await expect(accessTokenValido("c1", d, rinnova, () => ORA)).rejects.toMatchObject({ codice: "autorizzazione_revocata" });
    expect(rinnova).not.toHaveBeenCalled();
    expect(d.segnaDaRicollegare).not.toHaveBeenCalled();
  });

  it.each([
    ["già ridotto a codice", new ErroreConnettore("autorizzazione_revocata")],
    ["risposta invalid_grant", { response: { status: 400, data: { error: "invalid_grant" }, headers: new Headers() } }],
  ])("invalid_grant (%s) segna la casella da ricollegare con la generazione usata", async (_, errore) => {
    const d = deposito(salvate({ scadenzaAccesso: tra(MINUTO) }));

    await expect(
      accessTokenValido("c1", d, async () => Promise.reject(errore), () => ORA),
    ).rejects.toMatchObject({ codice: "autorizzazione_revocata" });
    expect(d.segnaDaRicollegare).toHaveBeenCalledWith("c1", 3);
    expect(d.salvaAccessoSeValido).not.toHaveBeenCalled();
  });

  it("un errore temporaneo del rinnovo non tocca lo stato della casella", async () => {
    const d = deposito(salvate({ scadenzaAccesso: tra(MINUTO) }));

    await expect(
      accessTokenValido("c1", d, async () => Promise.reject(new ErroreConnettore("temporaneo")), () => ORA),
    ).rejects.toMatchObject({ codice: "temporaneo" });
    expect(d.segnaDaRicollegare).not.toHaveBeenCalled();
  });
});

describe("creaAuthPerCasella", () => {
  it("fornisce alle richieste il token della casella con la sua scadenza", async () => {
    const scadenza = new Date(Date.now() + 30 * MINUTO);
    const d = deposito(salvate({ scadenzaAccesso: scadenza }));
    const auth = creaAuthPerCasella({ casellaId: "c1", deposito: d, rinnova: async () => nuovo });

    expect((await auth.getAccessToken()).token).toBe("salvato");
    expect((await auth.getRequestHeaders()).get("authorization")).toBe("Bearer salvato");
    expect(auth.credentials.expiry_date).toBe(scadenza.getTime());
    expect(d.leggi).toHaveBeenCalledOnce();
  });

  it("rinnova tramite accessTokenValido quando il token è in scadenza", async () => {
    const d = deposito(salvate({ scadenzaAccesso: new Date(Date.now() + MINUTO) }));
    const scadenzaNuova = new Date(Date.now() + 60 * MINUTO);
    const auth = creaAuthPerCasella({
      casellaId: "c1",
      deposito: d,
      rinnova: async () => ({ accessToken: "nuovo", scadenza: scadenzaNuova }),
    });

    expect((await auth.getAccessToken()).token).toBe("nuovo");
    expect(auth.credentials.expiry_date).toBe(scadenzaNuova.getTime());
  });

  it("richieste concorrenti condividono un solo rinnovo; dopo un fallimento si riprova", async () => {
    const d = deposito(salvate({ scadenzaAccesso: new Date(Date.now() + MINUTO) }));
    let risolvi: (v: typeof nuovo) => void = () => {};
    const rinnova = vi
      .fn<(r: string) => Promise<typeof nuovo>>()
      .mockRejectedValueOnce(new ErroreConnettore("temporaneo"))
      .mockImplementationOnce(() => new Promise((r) => (risolvi = r)));
    const auth = creaAuthPerCasella({ casellaId: "c1", deposito: d, rinnova });

    await expect(auth.getRequestHeaders()).rejects.toMatchObject({ codice: "temporaneo" });

    const richieste = [auth.getRequestHeaders(), auth.getRequestHeaders()];
    await vi.waitFor(() => expect(rinnova).toHaveBeenCalledTimes(2));
    risolvi({ accessToken: "nuovo", scadenza: new Date(Date.now() + 60 * MINUTO) });
    const intestazioni = await Promise.all(richieste);

    expect(intestazioni.map((h) => h.get("authorization"))).toEqual(["Bearer nuovo", "Bearer nuovo"]);
    expect(rinnova).toHaveBeenCalledTimes(2);
    expect(d.leggi).toHaveBeenCalledTimes(2);
  });

  it("propaga il codice se la casella non è più autorizzata", async () => {
    const auth = creaAuthPerCasella({ casellaId: "c1", deposito: deposito(null), rinnova: async () => nuovo });
    await expect(auth.getRequestHeaders()).rejects.toMatchObject({ codice: "autorizzazione_revocata" });
  });
});
