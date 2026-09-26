import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SCOPE_ACCESSO,
  SCOPE_GMAIL_INVIO,
  SCOPE_GMAIL_LETTURA,
  creaUrlAutorizzazione,
  generaPkce,
  revocaToken,
  rinnovaAccesso,
  scambiaCodice,
  valutaScope,
} from "../src/oauth";

const cfg = { clientId: "client-id.apps.example", clientSecret: "segreto-del-client", redirectUri: "https://app.esempio.it/oauth/google" };
const SCOPE_TUTTI = [...SCOPE_ACCESSO, SCOPE_GMAIL_LETTURA, SCOPE_GMAIL_INVIO];

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

interface Richiesta {
  url: URL;
  metodo: string;
  modulo: URLSearchParams;
}

function fetchFinto(rispondi: (r: Richiesta) => Response) {
  const richieste: Richiesta[] = [];
  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    const r = { url: new URL(String(input)), metodo: init?.method ?? "GET", modulo: new URLSearchParams(String(init?.body ?? "")) };
    richieste.push(r);
    return rispondi(r);
  }) as typeof fetch;
  return { fetchImplementation, richieste };
}

describe("creaUrlAutorizzazione", () => {
  it("chiede accesso offline, scope incrementali e PKCE S256", () => {
    const url = new URL(
      creaUrlAutorizzazione(cfg, {
        state: "stato-casuale",
        codeChallenge: "sfida",
        loginHint: "io@esempio.it",
        prompt: "consent select_account",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      access_type: "offline",
      include_granted_scopes: "true",
      scope: `openid email profile ${SCOPE_GMAIL_LETTURA} ${SCOPE_GMAIL_INVIO}`,
      state: "stato-casuale",
      code_challenge: "sfida",
      code_challenge_method: "S256",
      prompt: "consent select_account",
      login_hint: "io@esempio.it",
      response_type: "code",
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
    });
  });

  it("omette login_hint se non è noto e non espone mai il segreto del client", () => {
    const url = new URL(creaUrlAutorizzazione(cfg, { state: "s", codeChallenge: "c", prompt: "consent" }));
    expect(url.searchParams.has("login_hint")).toBe(false);
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.href).not.toContain(cfg.clientSecret);
  });
});

describe("generaPkce", () => {
  it("genera un verifier valido e la sua sfida S256", async () => {
    const { verifier, challenge } = await generaPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect((await generaPkce()).verifier).not.toBe(verifier);
  });
});

describe("valutaScope", () => {
  it.each([
    [SCOPE_TUTTI, "completi"],
    [[...SCOPE_ACCESSO, SCOPE_GMAIL_INVIO], "manca_lettura"],
    [[...SCOPE_ACCESSO, SCOPE_GMAIL_LETTURA], "manca_invio"],
    [SCOPE_ACCESSO, "manca_lettura"],
  ] as const)("%j → %s", (scope, atteso) => {
    expect(valutaScope([...scope])).toBe(atteso);
  });
});

describe("scambiaCodice", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();

  function idToken(richieste: Record<string, unknown> = {}) {
    const ora = Math.floor(Date.now() / 1000);
    const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const firmato = `${b64({ alg: "RS256", kid: "k1", typ: "JWT" })}.${b64({
      iss: "https://accounts.google.com",
      aud: cfg.clientId,
      sub: "10987654321",
      email: "Io@Esempio.it",
      email_verified: true,
      iat: ora,
      exp: ora + 3600,
      ...richieste,
    })}`;
    return `${firmato}.${sign("RSA-SHA256", Buffer.from(firmato), privateKey).toString("base64url")}`;
  }

  function google(token: Response | (() => Response)) {
    return fetchFinto((r) => {
      if (r.url.href === "https://www.googleapis.com/oauth2/v1/certs") return json({ k1: pem });
      if (r.url.href === "https://oauth2.googleapis.com/token") return typeof token === "function" ? token() : token;
      return new Response(null, { status: 500 });
    });
  }

  it("scambia il codice con PKCE e ricava identità, token e scope concessi", async () => {
    const prima = Date.now();
    const { fetchImplementation, richieste } = google(
      json({
        access_token: "accesso-1",
        expires_in: 3599,
        refresh_token: "rinnovo-1",
        scope: `openid ${SCOPE_GMAIL_LETTURA} https://www.googleapis.com/auth/userinfo.email`,
        token_type: "Bearer",
        id_token: idToken(),
      }),
    );

    const consenso = await scambiaCodice({ ...cfg, fetchImplementation }, { code: "codice-1", codeVerifier: "verifier-1" });

    expect(consenso).toMatchObject({
      sub: "10987654321",
      email: "io@esempio.it",
      accessToken: "accesso-1",
      refreshToken: "rinnovo-1",
      scopeConcessi: ["openid", SCOPE_GMAIL_LETTURA, "https://www.googleapis.com/auth/userinfo.email"],
    });
    expect(consenso.scadenzaAccesso.getTime()).toBeGreaterThanOrEqual(prima + 3_599_000);
    const token = richieste.find((r) => r.url.pathname === "/token")!;
    expect(Object.fromEntries(token.modulo)).toMatchObject({
      grant_type: "authorization_code",
      code: "codice-1",
      code_verifier: "verifier-1",
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
    });
  });

  it("senza refresh token restituisce null", async () => {
    const { fetchImplementation } = google(
      json({ access_token: "a", expires_in: 3599, scope: "openid", id_token: idToken() }),
    );
    expect((await scambiaCodice({ ...cfg, fetchImplementation }, { code: "c", codeVerifier: "v" })).refreshToken).toBeNull();
  });

  it("rifiuta un id_token destinato a un altro client, senza riportarne il contenuto", async () => {
    const { fetchImplementation } = google(
      json({ access_token: "a", expires_in: 3599, scope: "openid", id_token: idToken({ aud: "altro-client" }) }),
    );
    const errore = await scambiaCodice({ ...cfg, fetchImplementation }, { code: "c", codeVerifier: "v" }).catch((e: Error) => e);
    expect(errore).toMatchObject({ name: "ErroreConnettore", codice: "autorizzazione_revocata" });
    expect(String((errore as Error).message)).toBe("autorizzazione_revocata");
  });

  it("un codice non valido → autorizzazione_revocata", async () => {
    const { fetchImplementation } = google(json({ error: "invalid_grant", error_description: "Bad Request" }, 400));
    await expect(scambiaCodice({ ...cfg, fetchImplementation }, { code: "c", codeVerifier: "v" })).rejects.toMatchObject({
      codice: "autorizzazione_revocata",
    });
  });
});

describe("rinnovaAccesso", () => {
  it("rinnova il token di accesso con il refresh token", async () => {
    const prima = Date.now();
    const { fetchImplementation, richieste } = fetchFinto(() =>
      json({ access_token: "nuovo", expires_in: 3599, scope: `${SCOPE_GMAIL_LETTURA} ${SCOPE_GMAIL_INVIO}`, token_type: "Bearer" }),
    );

    const esito = await rinnovaAccesso({ ...cfg, fetchImplementation }, "rinnovo-1");

    expect(esito.accessToken).toBe("nuovo");
    expect(esito.scadenza.getTime()).toBeGreaterThanOrEqual(prima + 3_599_000);
    expect(esito.scopeConcessi).toEqual([SCOPE_GMAIL_LETTURA, SCOPE_GMAIL_INVIO]);
    expect(Object.fromEntries(richieste[0]!.modulo)).toMatchObject({ grant_type: "refresh_token", refresh_token: "rinnovo-1" });
  });

  it("senza scope nella risposta restituisce null", async () => {
    const { fetchImplementation } = fetchFinto(() => json({ access_token: "nuovo", expires_in: 3599 }));
    expect((await rinnovaAccesso({ ...cfg, fetchImplementation }, "r")).scopeConcessi).toBeNull();
  });

  it.each([
    ["invalid_grant", "autorizzazione_revocata", json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)],
    ["client non valido", "temporaneo", json({ error: "invalid_client", error_description: "Unauthorized" }, 401)],
    ["errore del server", "temporaneo", json({ error: "internal_failure" }, 503)],
  ])("%s → %s", async (_, codice, risposta) => {
    const { fetchImplementation } = fetchFinto(() => risposta.clone());
    await expect(rinnovaAccesso({ ...cfg, fetchImplementation }, "r")).rejects.toMatchObject({ codice });
  });
});

describe("revocaToken", () => {
  it("revoca il token presso Google", async () => {
    const { fetchImplementation, richieste } = fetchFinto(() => json({}));
    await revocaToken("rinnovo-1", { fetchImplementation });
    expect(richieste[0]).toMatchObject({ metodo: "POST" });
    expect(richieste[0]!.url.origin + richieste[0]!.url.pathname).toBe("https://oauth2.googleapis.com/revoke");
  });

  it("considera riuscita la revoca di un token già non valido", async () => {
    const { fetchImplementation } = fetchFinto(() => json({ error: "invalid_token", error_description: "Token expired or revoked" }, 400));
    await expect(revocaToken("vecchio", { fetchImplementation })).resolves.toBeUndefined();
  });

  it("riduce gli altri errori a codici", async () => {
    const { fetchImplementation } = fetchFinto(() => json({ error: "invalid_request" }, 400));
    await expect(revocaToken("t", { fetchImplementation })).rejects.toMatchObject({ codice: "temporaneo" });
  });
});
