import { describe, expect, it, vi } from "vitest";
import { GaxiosError, type GaxiosOptionsPrepared } from "gaxios";
import { ErroreConnettore } from "@ec/core";
import { conRitentativi, erroreConnettore } from "../src/errori";

function risposta(status: number, data: unknown, headers: Record<string, string> = {}) {
  return { response: { status, data, headers: new Headers(headers) } };
}

function erroreGoogle(status: number, reason: string, extra: Record<string, unknown> = {}) {
  return risposta(status, { error: { code: status, message: "dettaglio del provider", errors: [{ reason }], ...extra } });
}

function erroreRete(causa: unknown = new DOMException("scaduto", "TimeoutError")) {
  const config = { url: new URL("https://gmail.googleapis.com/x"), headers: new Headers() } as GaxiosOptionsPrepared;
  return new GaxiosError("fetch failed: segreto", config, undefined, causa);
}

describe("erroreConnettore", () => {
  it("lascia passare un ErroreConnettore già ridotto a codice", () => {
    const e = new ErroreConnettore("cursore_scaduto");
    expect(erroreConnettore(e)).toBe(e);
  });

  it.each([
    ["invalid_grant nel corpo", risposta(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." })],
    ["invalid_grant nel messaggio", Object.assign(new Error("invalid_grant"), {})],
    ["401", risposta(401, { error: { code: 401, message: "Invalid Credentials" } })],
  ])("%s → autorizzazione_revocata", (_, errore) => {
    expect(erroreConnettore(errore).codice).toBe("autorizzazione_revocata");
  });

  it.each(["insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"])("403 %s → permessi_insufficienti", (reason) => {
    expect(erroreConnettore(erroreGoogle(403, reason)).codice).toBe("permessi_insufficienti");
  });

  it("un 403 con motivo sconosciuto → permessi_insufficienti", () => {
    expect(erroreConnettore(erroreGoogle(403, "domainPolicy")).codice).toBe("permessi_insufficienti");
    expect(erroreConnettore(risposta(403, {})).codice).toBe("permessi_insufficienti");
  });

  it("riconosce il motivo anche nei dettagli AIP-193", () => {
    const e = risposta(403, {
      error: { code: 403, status: "PERMISSION_DENIED", details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] },
    });
    expect(erroreConnettore(e).codice).toBe("permessi_insufficienti");
  });

  it.each(["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded"])("403 %s → limite_frequenza", (reason) => {
    const e = erroreConnettore(erroreGoogle(403, reason));
    expect(e.codice).toBe("limite_frequenza");
    expect(e.riprovaDopoMs).toBeNull();
  });

  it("429 → limite_frequenza con Retry-After in millisecondi", () => {
    const e = erroreConnettore(risposta(429, {}, { "retry-after": "7" }));
    expect(e.codice).toBe("limite_frequenza");
    expect(e.riprovaDopoMs).toBe(7000);
  });

  it.each([500, 502, 503, 408])("%i → temporaneo", (status) => {
    expect(erroreConnettore(risposta(status, {})).codice).toBe("temporaneo");
  });

  it("errore di rete senza risposta → temporaneo", () => {
    expect(erroreConnettore(erroreRete()).codice).toBe("temporaneo");
    expect(erroreConnettore(erroreRete(Object.assign(new Error("x"), { code: "ECONNRESET" }))).codice).toBe("temporaneo");
  });

  it("404 → non_trovato", () => {
    expect(erroreConnettore(risposta(404, {})).codice).toBe("non_trovato");
  });

  it("non conserva messaggio né causa del provider", () => {
    const e = erroreConnettore(erroreGoogle(403, "insufficientPermissions"));
    expect(e.message).toBe("permessi_insufficienti");
    expect(e.cause).toBeUndefined();
    expect(JSON.stringify(e)).not.toContain("dettaglio del provider");
  });
});

describe("conRitentativi", () => {
  const nessunaAttesa = () => vi.fn(async (_ms: number) => {});

  it("riprova fino a 3 tentativi in totale su errori temporanei, con attese crescenti", async () => {
    const attesa = nessunaAttesa();
    const operazione = vi.fn(async () => {
      throw risposta(503, {});
    });
    await expect(conRitentativi(operazione, { attesa, casuale: () => 0 })).rejects.toMatchObject({ codice: "temporaneo" });
    expect(operazione).toHaveBeenCalledTimes(3);
    expect(attesa.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
  });

  it("aggiunge un jitter all'attesa", async () => {
    const attesa = nessunaAttesa();
    const operazione = vi.fn().mockRejectedValueOnce(erroreRete()).mockResolvedValueOnce("ok");
    await expect(conRitentativi(operazione, { attesa, casuale: () => 0.5 })).resolves.toBe("ok");
    expect(attesa.mock.calls[0]?.[0]).toBe(1500);
  });

  it("restituisce il risultato appena un tentativo riesce", async () => {
    const operazione = vi.fn().mockRejectedValueOnce(risposta(429, {})).mockResolvedValueOnce(42);
    await expect(conRitentativi(operazione, { attesa: nessunaAttesa() })).resolves.toBe(42);
    expect(operazione).toHaveBeenCalledTimes(2);
  });

  it("usa Retry-After come attesa minima", async () => {
    const attesa = nessunaAttesa();
    const operazione = vi.fn().mockRejectedValueOnce(risposta(429, {}, { "retry-after": "5" })).mockResolvedValueOnce(1);
    await conRitentativi(operazione, { attesa, casuale: () => 0 });
    expect(attesa.mock.calls[0]?.[0]).toBe(5000);
  });

  it("non attende nel processo un Retry-After troppo lungo: lo restituisce al chiamante", async () => {
    const operazione = vi.fn(async () => {
      throw risposta(429, {}, { "retry-after": "3600" });
    });
    await expect(conRitentativi(operazione, { attesa: nessunaAttesa() })).rejects.toMatchObject({
      codice: "limite_frequenza",
      riprovaDopoMs: 3_600_000,
    });
    expect(operazione).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["non_trovato", risposta(404, {})],
    ["autorizzazione_revocata", risposta(401, {})],
    ["permessi_insufficienti", erroreGoogle(403, "insufficientPermissions")],
  ])("non riprova %s", async (codice, errore) => {
    const operazione = vi.fn(async () => {
      throw errore;
    });
    await expect(conRitentativi(operazione, { attesa: nessunaAttesa() })).rejects.toMatchObject({ codice });
    expect(operazione).toHaveBeenCalledTimes(1);
  });

  it("non riprova una richiesta rifiutata (400) né un errore sconosciuto", async () => {
    for (const errore of [risposta(400, { error: { code: 400 } }), new TypeError("bug")]) {
      const operazione = vi.fn(async () => {
        throw errore;
      });
      await expect(conRitentativi(operazione, { attesa: nessunaAttesa() })).rejects.toBeInstanceOf(ErroreConnettore);
      expect(operazione).toHaveBeenCalledTimes(1);
    }
  });
});
