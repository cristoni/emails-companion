import { describe, expect, it } from "vitest";
import { OAuth2Client } from "google-auth-library";
import { creaClientGmail } from "../src/client";
import { ConnettoreGmail } from "../src/connettore";
import { erroreConnettore } from "../src/errori";

interface Chiamata {
  metodo: string;
  url: URL;
  corpo: unknown;
  autorizzazione: string | null;
}

const json = (corpo: unknown, status = 200, intestazioni: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...intestazioni } });

function clientHttp(rispondi: (url: URL) => Response | Promise<Response>, opzioni?: { timeoutInvioMs?: number }) {
  const chiamate: Chiamata[] = [];
  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const corpo = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    chiamate.push({ metodo: init?.method ?? "GET", url, corpo, autorizzazione: new Headers(init?.headers).get("authorization") });
    if (url.pathname.endsWith("/messages/send") && opzioni?.timeoutInvioMs) {
      return new Promise<Response>((_, rifiuta) => init?.signal?.addEventListener("abort", () => rifiuta(init.signal?.reason)));
    }
    return rispondi(url);
  }) as typeof fetch;
  const auth = new OAuth2Client({ transporterOptions: { fetchImplementation } });
  auth.setCredentials({ access_token: "token-finto", expiry_date: Date.now() + 3_600_000 });
  return { client: creaClientGmail(auth, opzioni), chiamate };
}

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

describe("creaClientGmail: forma delle richieste", () => {
  it("legge il profilo con il token della casella", async () => {
    const { client, chiamate } = clientHttp(() => json({ emailAddress: "io@esempio.it", historyId: "4321" }));

    expect(await client.getProfile()).toEqual({ emailAddress: "io@esempio.it", historyId: "4321" });
    expect(chiamate[0]).toMatchObject({ metodo: "GET", autorizzazione: "Bearer token-finto" });
    expect(chiamate[0]?.url.href).toBe(`${BASE}/profile`);
  });

  it("chiede la cronologia con tutti i tipi e senza filtro di etichette", async () => {
    const { client, chiamate } = clientHttp(() =>
      json({
        history: [
          {
            id: "11",
            messagesAdded: [{ message: { id: "a", threadId: "t", labelIds: ["INBOX"] } }],
            labelsRemoved: [{ message: { id: "b", threadId: "t" }, labelIds: ["INBOX"] }],
          },
        ],
        historyId: "12",
        nextPageToken: "pt",
      }),
    );

    const pagina = await client.historyList({
      startHistoryId: "10",
      historyTypes: ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
      maxResults: 500,
      pageToken: "p0",
    });

    const parametri = chiamate[0]!.url.searchParams;
    expect(chiamate[0]!.url.pathname).toBe("/gmail/v1/users/me/history");
    expect(parametri.getAll("historyTypes")).toEqual(["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"]);
    expect(parametri.get("startHistoryId")).toBe("10");
    expect(parametri.get("maxResults")).toBe("500");
    expect(parametri.get("pageToken")).toBe("p0");
    expect(parametri.has("labelId")).toBe(false);
    expect(pagina).toEqual({
      history: [
        {
          id: "11",
          messagesAdded: [{ id: "a", threadId: "t", labelIds: ["INBOX"] }],
          messagesDeleted: [],
          labelsAdded: [],
          labelsRemoved: [{ id: "b", threadId: "t", labelIds: null }],
        },
      ],
      historyId: "12",
      nextPageToken: "pt",
    });
  });

  it("elenca i messaggi con la ricerca indicata", async () => {
    const { client, chiamate } = clientHttp(() => json({ messages: [{ id: "a", threadId: "t" }], resultSizeEstimate: 1 }));

    expect(await client.messagesList({ q: "in:sent after:1", maxResults: 500 })).toEqual({ ids: ["a"], nextPageToken: null });
    expect(chiamate[0]!.url.searchParams.get("q")).toBe("in:sent after:1");
    expect(await clientHttp(() => json({ resultSizeEstimate: 0 })).client.messagesList({ q: "x", maxResults: 1 })).toEqual({
      ids: [],
      nextPageToken: null,
    });
  });

  it("legge un messaggio nei formati raw, metadata e minimal", async () => {
    const { client, chiamate } = clientHttp((url) => {
      const formato = url.searchParams.get("format");
      const base = { id: "m1", threadId: "t1", labelIds: ["INBOX"], internalDate: "1790000000000" };
      if (formato === "raw") return json({ ...base, raw: "UmF3" });
      if (formato === "metadata") return json({ ...base, payload: { headers: [{ name: "Message-ID", value: "<x@y>" }] } });
      return json({ id: "m1", threadId: "t1" });
    });

    expect(await client.messagesGetRaw("m1")).toEqual({
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX"],
      internalDate: "1790000000000",
      raw: "UmF3",
    });
    expect(await client.messagesGetMetadata("m1", ["Message-ID"])).toEqual({
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX"],
      headers: [{ name: "Message-ID", value: "<x@y>" }],
    });
    expect(await client.messagesGetMinimal("m1")).toEqual({ id: "m1", threadId: "t1", labelIds: [] });
    expect(chiamate.map((c) => c.url.pathname)).toEqual(Array(3).fill("/gmail/v1/users/me/messages/m1"));
    expect(chiamate[1]!.url.searchParams.getAll("metadataHeaders")).toEqual(["Message-ID"]);
  });

  it("legge un thread nel formato minimo", async () => {
    const { client, chiamate } = clientHttp(() => json({ id: "t1", messages: [{ id: "a", threadId: "t1", labelIds: ["SENT"] }] }));
    expect(await client.threadsGetMinimal("t1")).toEqual({ id: "t1", messages: [{ id: "a", threadId: "t1", labelIds: ["SENT"] }] });
    expect(chiamate[0]!.url.pathname).toBe("/gmail/v1/users/me/threads/t1");
    expect(chiamate[0]!.url.searchParams.get("format")).toBe("minimal");
  });

  it("invia il MIME grezzo nel thread indicato", async () => {
    const { client, chiamate } = clientHttp(() => json({ id: "s1", threadId: "t1", labelIds: ["SENT"] }));

    expect(await client.messagesSend("UmF3", "t1")).toEqual({ id: "s1", threadId: "t1" });
    await client.messagesSend("UmF3", null);

    expect(chiamate.map((c) => [c.metodo, c.url.href, c.corpo])).toEqual([
      ["POST", `${BASE}/messages/send`, { raw: "UmF3", threadId: "t1" }],
      ["POST", `${BASE}/messages/send`, { raw: "UmF3" }],
    ]);
  });

  it("una risposta di invio senza id ha esito ignoto, non un rifiuto", async () => {
    const { client } = clientHttp(() => json({}));
    await expect(client.messagesSend("UmF3", null)).rejects.toMatchObject({ codice: "timeout_invio" });
  });

  it("avvia e ferma il watch senza filtro di etichette ed elenca gli alias", async () => {
    const { client, chiamate } = clientHttp((url) => {
      if (url.pathname.endsWith("/watch")) return json({ historyId: "9", expiration: "1790000000000" });
      if (url.pathname.endsWith("/sendAs")) {
        return json({ sendAs: [{ sendAsEmail: "io@esempio.it", isPrimary: true }, { sendAsEmail: "alias@esempio.it" }] });
      }
      return new Response(null, { status: 204 });
    });

    expect(await client.watch("projects/p/topics/t")).toEqual({ historyId: "9", expiration: "1790000000000" });
    await client.stop();
    expect(await client.sendAsList()).toEqual(["io@esempio.it", "alias@esempio.it"]);
    expect(chiamate.map((c) => [c.metodo, c.url.pathname, c.corpo])).toEqual([
      ["POST", "/gmail/v1/users/me/watch", { topicName: "projects/p/topics/t" }],
      ["POST", "/gmail/v1/users/me/stop", undefined],
      ["GET", "/gmail/v1/users/me/settings/sendAs", undefined],
    ]);
  });
});

describe("creaClientGmail: errori reali di gaxios", () => {
  async function errore(risposta: () => Response) {
    const { client, chiamate } = clientHttp(risposta);
    const e = await client.getProfile().then(
      () => expect.fail("attesa un'eccezione"),
      (e: unknown) => e,
    );
    return { e: erroreConnettore(e), chiamate: chiamate.length };
  }

  it("404 → non_trovato", async () => {
    expect((await errore(() => json({ error: { code: 404, message: "Not Found" } }, 404))).e.codice).toBe("non_trovato");
  });

  it("403 con motivo di scope → permessi_insufficienti", async () => {
    const corpo = {
      error: {
        code: 403,
        message: "Request had insufficient authentication scopes.",
        errors: [{ message: "Insufficient Permission", domain: "global", reason: "insufficientPermissions" }],
        status: "PERMISSION_DENIED",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }],
      },
    };
    expect((await errore(() => json(corpo, 403))).e.codice).toBe("permessi_insufficienti");
  });

  it("403 di frequenza e 429 → limite_frequenza con Retry-After", async () => {
    const frequenza = { error: { code: 403, errors: [{ reason: "userRateLimitExceeded" }] } };
    expect((await errore(() => json(frequenza, 403))).e.codice).toBe("limite_frequenza");
    const { e } = await errore(() => json({ error: { code: 429 } }, 429, { "retry-after": "2" }));
    expect(e).toMatchObject({ codice: "limite_frequenza", riprovaDopoMs: 2000 });
  });

  it("401 → autorizzazione_revocata", async () => {
    expect((await errore(() => json({ error: { code: 401, message: "Invalid Credentials" } }, 401))).e.codice).toBe(
      "autorizzazione_revocata",
    );
  });

  it("5xx → temporaneo, senza i ritentativi automatici della libreria", async () => {
    const { e, chiamate } = await errore(() => json({ error: { code: 503 } }, 503));
    expect(e.codice).toBe("temporaneo");
    expect(chiamate).toBe(1);
  });

  it("un invio scaduto diventa timeout_invio e non viene ripetuto", async () => {
    const { client, chiamate } = clientHttp(() => json({}), { timeoutInvioMs: 20 });
    const connettore = new ConnettoreGmail({ client, indirizzo: "io@esempio.it" });

    await expect(
      connettore.invia({
        messageId: "x@app.esempio.it",
        da: { indirizzo: "io@esempio.it" },
        a: [{ indirizzo: "a@esempio.it" }],
        cc: [],
        bcc: [],
        oggetto: "x",
        corpo: "x",
        inReplyTo: null,
        references: [],
        threadConnettore: null,
      }),
    ).rejects.toMatchObject({ codice: "timeout_invio" });
    expect(chiamate).toHaveLength(1);
  });
});
