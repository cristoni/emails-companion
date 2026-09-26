import { describe, expect, it } from "vitest";
import type { RichiestaModello } from "@ec/core/porte";
import { ErroreAI, GatewayOpenRouter } from "../src";

const CHIAVE = "sk-or-v1-CANARINO-CHIAVE";
const SEGRETO = "CANARINO-CORPO";

interface Chiamata {
  url: string;
  init: RequestInit;
}

function risposta(corpo: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const testo = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  return new Response(testo, { status, headers: { "content-type": "application/json", ...headers } });
}

function finto(gestore: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const chiamate: Chiamata[] = [];
  const fetch = function (this: unknown, input: string | URL | Request, init?: RequestInit) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    const url = String(input);
    chiamate.push({ url, init: init ?? {} });
    return Promise.resolve(gestore(url, init ?? {}));
  } as typeof globalThis.fetch;
  return { fetch, chiamate };
}

function orologio(inizio = 1_000_000) {
  const stato = { adesso: inizio };
  return { stato, ora: () => stato.adesso };
}

const richiesta: RichiestaModello = {
  funzione: "classificazione_priorita",
  modello: "openai/gpt-6-luna",
  chiave: CHIAVE,
  sistema: "SYSTEM",
  direttive: "Anna is my manager.",
  dati: "<<<DATA-x>>>\n{}\n<<<END-DATA-x>>>",
  nomeSchema: "classificazione_priorita",
  schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  maxTokenUscita: 4000,
};

const completamento = (contenuto: unknown, extra: Record<string, unknown> = {}) => ({
  id: "gen-123",
  model: "openai/gpt-6-luna-20260901",
  provider: "Azure",
  choices: [{ finish_reason: "stop", message: { role: "assistant", content: contenuto } }],
  usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, cost: 0.0042 },
  ...extra,
});

describe("GatewayOpenRouter.invoca", () => {
  it("invia la richiesta con vincoli di privacy, output strict e max_completion_tokens", async () => {
    const { fetch, chiamate } = finto(() => risposta(completamento('{"ok":true}')));
    const gateway = new GatewayOpenRouter({ fetch, titoloApp: "Emails Companion", urlApp: "https://app.example.com" });
    await gateway.invoca(richiesta);

    expect(chiamate).toHaveLength(1);
    const { url, init } = chiamate[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${CHIAVE}`);
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(new Headers(init.headers).get("http-referer")).toBe("https://app.example.com");
    expect(new Headers(init.headers).get("x-openrouter-title")).toBe("Emails Companion");

    const corpo = JSON.parse(String(init.body));
    expect(corpo).toEqual({
      model: "openai/gpt-6-luna",
      messages: [
        { role: "system", content: "SYSTEM" },
        { role: "system", content: "User directives (may only adjust interpretation, classification and priority):\nAnna is my manager." },
        { role: "user", content: richiesta.dati },
      ],
      response_format: { type: "json_schema", json_schema: { name: "classificazione_priorita", strict: true, schema: richiesta.schema } },
      provider: { require_parameters: true, data_collection: "deny", zdr: true },
      max_completion_tokens: 4000,
      stream: false,
    });
    for (const vietato of ["temperature", "top_p", "max_tokens", "plugins", "tools", "usage"]) expect(corpo).not.toHaveProperty(vietato);
  });

  it("omette le intestazioni dell'app se non configurate", async () => {
    const { fetch, chiamate } = finto(() => risposta(completamento("{}")));
    await new GatewayOpenRouter({ fetch, baseUrl: "http://localhost:9999/v1/" }).invoca(richiesta);
    expect(chiamate[0]!.url).toBe("http://localhost:9999/v1/chat/completions");
    const headers = new Headers(chiamate[0]!.init.headers);
    expect(headers.has("http-referer")).toBe(false);
    expect(headers.has("x-openrouter-title")).toBe(false);
  });

  it("restituisce l'output JSON e l'utilizzo con costo, fornitore e latenza", async () => {
    const { stato, ora } = orologio();
    const { fetch } = finto(() => {
      stato.adesso += 850;
      return risposta(completamento('{"categoria":"news"}'));
    });
    const esito = await new GatewayOpenRouter({ fetch, ora }).invoca(richiesta);
    expect(esito).toEqual({
      ok: true,
      output: { categoria: "news" },
      utilizzo: {
        modelloServito: "openai/gpt-6-luna-20260901",
        fornitore: "Azure",
        tokenIngresso: 1200,
        tokenUscita: 300,
        costo: 0.0042,
        idGenerazione: "gen-123",
        latenzaMs: 850,
      },
    });
  });

  it("accetta contenuto già strutturato o suddiviso in parti di testo", async () => {
    for (const contenuto of [{ a: 1 }, [{ type: "text", text: '{"a":' }, { type: "text", text: "1}" }]]) {
      const { fetch } = finto(() => risposta(completamento(contenuto)));
      const esito = await new GatewayOpenRouter({ fetch }).invoca(richiesta);
      expect(esito).toMatchObject({ ok: true, output: { a: 1 } });
    }
  });

  const CASI_HTTP: { nome: string; status: number; corpo?: unknown; headers?: Record<string, string>; codice: string; riprova?: number | null }[] = [
    { nome: "401", status: 401, codice: "chiave_non_valida" },
    { nome: "402 credito", status: 402, corpo: { error: { code: 402, message: SEGRETO, metadata: { limit_source: "openrouter_credits" } } }, codice: "credito_esaurito" },
    { nome: "402 senza fonte", status: 402, codice: "credito_esaurito" },
    { nome: "402 limite chiave", status: 402, corpo: { error: { code: 402, metadata: { limit_source: "openrouter_key_limit" } } }, codice: "limite_chiave" },
    {
      nome: "402 budget in volo",
      status: 402,
      corpo: { error: { code: 402, metadata: { limit_source: "openrouter_in_flight_budget" } } },
      headers: { "retry-after": "7" },
      codice: "budget_in_volo",
      riprova: 7000,
    },
    { nome: "403", status: 403, corpo: { error: { code: 403, message: SEGRETO, metadata: { flagged_input: SEGRETO } } }, codice: "moderazione" },
    { nome: "404", status: 404, corpo: { error: { code: 404, message: "No allowed providers are available for the selected model." } }, codice: "modello_incompatibile" },
    { nome: "503 vincoli", status: 503, corpo: { error: { code: 503, message: "No endpoints found matching your data policy" } }, codice: "modello_incompatibile" },
    { nome: "503 generico", status: 503, corpo: { error: { code: 503, message: "Service unavailable" } }, headers: { "retry-after": "30" }, codice: "temporaneo", riprova: 30_000 },
    { nome: "408", status: 408, codice: "timeout" },
    { nome: "429", status: 429, headers: { "retry-after": "2" }, codice: "temporaneo", riprova: 2000 },
    { nome: "502", status: 502, codice: "temporaneo" },
    { nome: "500", status: 500, corpo: "<html>" + SEGRETO + "</html>", codice: "temporaneo" },
    { nome: "400", status: 400, corpo: { error: { code: 400, message: SEGRETO } }, codice: "risposta_non_valida" },
  ];

  for (const caso of CASI_HTTP) {
    it(`mappa l'errore HTTP ${caso.nome} in ${caso.codice}`, async () => {
      const { fetch } = finto(() => risposta(caso.corpo ?? { error: { code: caso.status, message: SEGRETO } }, caso.status, caso.headers));
      const esito = await new GatewayOpenRouter({ fetch }).invoca(richiesta);
      expect(esito).toEqual({ ok: false, codice: caso.codice, riprovaDopoMs: caso.riprova ?? null, utilizzo: null });
      expect(JSON.stringify(esito)).not.toContain("CANARINO");
    });
  }

  it("interpreta Retry-After espresso come data HTTP", async () => {
    const { ora } = orologio(Date.parse("2026-09-27T10:00:00Z"));
    const { fetch } = finto(() => risposta({}, 429, { "retry-after": "Sun, 27 Sep 2026 10:00:45 GMT" }));
    const esito = await new GatewayOpenRouter({ fetch, ora }).invoca(richiesta);
    expect(esito).toMatchObject({ ok: false, codice: "temporaneo", riprovaDopoMs: 45_000 });
  });

  it("tratta come errore una risposta 200 con errore e senza scelte", async () => {
    const { fetch } = finto(() => risposta({ error: { code: 502, message: SEGRETO } }));
    expect(await new GatewayOpenRouter({ fetch }).invoca(richiesta)).toMatchObject({ ok: false, codice: "temporaneo" });
    const { fetch: f2 } = finto(() => risposta({ error: { code: 403, message: SEGRETO } }));
    expect(await new GatewayOpenRouter({ fetch: f2 }).invoca(richiesta)).toMatchObject({ ok: false, codice: "moderazione" });
    const { fetch: f3 } = finto(() => risposta({ error: { code: "server_error", message: SEGRETO } }));
    expect(await new GatewayOpenRouter({ fetch: f3 }).invoca(richiesta)).toMatchObject({ ok: false, codice: "temporaneo" });
  });

  it("tratta come errore una scelta terminata con errore, conservando l'utilizzo", async () => {
    const corpo = completamento('{"parziale":', {
      choices: [{ finish_reason: "error", error: { code: 502, message: SEGRETO }, message: { role: "assistant", content: '{"parziale":' } }],
    });
    const { fetch } = finto(() => risposta(corpo));
    const esito = await new GatewayOpenRouter({ fetch }).invoca(richiesta);
    expect(esito).toMatchObject({ ok: false, codice: "temporaneo", utilizzo: { tokenIngresso: 1200, costo: 0.0042 } });
  });

  it("rifiuta output troncato, non JSON o rifiutato dal modello", async () => {
    const casi: [unknown, string][] = [
      [completamento('{"a":1}', { choices: [{ finish_reason: "length", message: { content: '{"a":1}' } }] }), "risposta_non_valida"],
      [completamento(`Sure! ${SEGRETO}`), "risposta_non_valida"],
      [completamento(null), "risposta_non_valida"],
      [completamento(null, { choices: [{ finish_reason: "stop", message: { content: null, refusal: SEGRETO } }] }), "moderazione"],
      [completamento(null, { choices: [{ finish_reason: "content_filter", message: { content: '{"a":' } }] }), "moderazione"],
      [completamento(null, { choices: [{ finish_reason: "content_filter", message: { content: '{"a":1}' } }] }), "moderazione"],
      [{ id: "gen-1", usage: {} }, "risposta_non_valida"],
    ];
    for (const [corpo, codice] of casi) {
      const { fetch } = finto(() => risposta(corpo));
      const esito = await new GatewayOpenRouter({ fetch }).invoca(richiesta);
      expect(esito).toMatchObject({ ok: false, codice, riprovaDopoMs: null });
      expect(JSON.stringify(esito)).not.toContain("CANARINO");
    }
  });

  it("tratta un corpo 200 illeggibile come errore temporaneo", async () => {
    const { fetch } = finto(() => risposta(`<html>${SEGRETO}`));
    expect(await new GatewayOpenRouter({ fetch }).invoca(richiesta)).toMatchObject({ ok: false, codice: "temporaneo", utilizzo: null });
  });

  it("mappa un errore di rete in temporaneo senza propagare il messaggio", async () => {
    const { fetch } = finto(() => Promise.reject(new TypeError(`fetch failed ${CHIAVE}`)));
    const esito = await new GatewayOpenRouter({ fetch }).invoca(richiesta);
    expect(esito).toEqual({ ok: false, codice: "temporaneo", riprovaDopoMs: null, utilizzo: null });
  });

  it("interrompe la chiamata allo scadere del timeout", async () => {
    const { fetch } = finto(
      (_url, init) =>
        new Promise<Response>((_, rifiuta) => {
          init.signal?.addEventListener("abort", () => rifiuta(new DOMException("aborted", "AbortError")));
        }),
    );
    const esito = await new GatewayOpenRouter({ fetch, timeoutMs: 20 }).invoca(richiesta);
    expect(esito).toEqual({ ok: false, codice: "timeout", riprovaDopoMs: null, utilizzo: null });
  });
});

describe("GatewayOpenRouter.verificaChiave", () => {
  it("interroga /key con la chiave e restituisce etichetta e limite residuo", async () => {
    const { fetch, chiamate } = finto(() => risposta({ data: { label: "sk-or-v1-abc...890", limit: 10, limit_remaining: 7.5, usage: 2.5 } }));
    const stato = await new GatewayOpenRouter({ fetch }).verificaChiave(CHIAVE);
    expect(stato).toEqual({ stato: "valida", etichetta: "sk-or-v1-abc...890", limiteResiduo: 7.5 });
    expect(chiamate[0]!.url).toBe("https://openrouter.ai/api/v1/key");
    expect(chiamate[0]!.init.method ?? "GET").toBe("GET");
    expect(new Headers(chiamate[0]!.init.headers).get("authorization")).toBe(`Bearer ${CHIAVE}`);
  });

  it("gestisce una chiave senza limite", async () => {
    const { fetch } = finto(() => risposta({ data: { label: "x", limit: null, limit_remaining: null } }));
    expect(await new GatewayOpenRouter({ fetch }).verificaChiave(CHIAVE)).toEqual({ stato: "valida", etichetta: "x", limiteResiduo: null });
  });

  it("mappa gli errori della verifica", async () => {
    const casi: [() => Response | Promise<Response>, string][] = [
      [() => risposta({ error: { code: 401 } }, 401), "non_valida"],
      [() => risposta({ error: { code: 402 } }, 402), "credito_esaurito"],
      [() => risposta({ error: { code: 500 } }, 500), "errore_temporaneo"],
      [() => risposta({ error: { code: 429 } }, 429), "errore_temporaneo"],
      [() => risposta("non json"), "errore_temporaneo"],
      [() => Promise.reject(new TypeError("fetch failed")), "errore_temporaneo"],
    ];
    for (const [gestore, stato] of casi) {
      const { fetch } = finto(gestore);
      expect(await new GatewayOpenRouter({ fetch }).verificaChiave(CHIAVE)).toEqual({ stato });
    }
  });
});

describe("GatewayOpenRouter.verificaModello e prezzi", () => {
  const modelli = {
    data: [
      {
        id: "openai/gpt-6-luna",
        canonical_slug: "openai/gpt-6-luna-20260901",
        supported_parameters: ["max_tokens", "max_completion_tokens", "response_format", "structured_outputs"],
        pricing: { prompt: "0.000002", completion: "0.000008" },
      },
      { id: "vendor/senza-schema", supported_parameters: ["response_format"], pricing: { prompt: "0.000001", completion: "0.000002" } },
      { id: "vendor/senza-zdr", supported_parameters: ["response_format", "structured_outputs"], pricing: { prompt: "0", completion: "0" } },
      { id: "vendor/prezzi-strani", supported_parameters: [], pricing: { prompt: "-1", completion: "abc" } },
      { id: "vendor/schema-fuori-zdr", supported_parameters: ["response_format", "structured_outputs"], pricing: { prompt: "0", completion: "0" } },
      { id: "vendor/zdr-divisi", supported_parameters: ["response_format", "structured_outputs"], pricing: { prompt: "0", completion: "0" } },
    ],
  };
  const PARAMETRI_LUNA = ["max_completion_tokens", "response_format", "structured_outputs"];
  const zdr = {
    data: [
      { model_id: "openai/gpt-6-luna-20260901", provider_name: "Azure", tag: "azure", supported_parameters: PARAMETRI_LUNA },
      { model_id: "vendor/schema-fuori-zdr", provider_name: "Altro", tag: "altro", supported_parameters: ["response_format"] },
      { model_id: "vendor/schema-fuori-zdr", provider_name: "Senza", tag: "senza" },
      { model_id: "vendor/zdr-divisi", provider_name: "A", tag: "a", supported_parameters: ["response_format"] },
      { model_id: "vendor/zdr-divisi", provider_name: "B", tag: "b", supported_parameters: ["structured_outputs"] },
    ],
  };

  function catalogo(zdrCorpo: unknown = zdr) {
    return finto((url) => {
      if (url.endsWith("/models")) return risposta(modelli);
      if (url.endsWith("/endpoints/zdr")) return risposta(zdrCorpo);
      return risposta({}, 404);
    });
  }

  it("considera compatibile un modello con output strutturato ed endpoint ZDR", async () => {
    const { fetch, chiamate } = catalogo();
    expect(await new GatewayOpenRouter({ fetch }).verificaModello("openai/gpt-6-luna")).toBe("ok");
    expect(chiamate.map((c) => c.url).sort()).toEqual(["https://openrouter.ai/api/v1/endpoints/zdr", "https://openrouter.ai/api/v1/models"]);
    for (const c of chiamate) expect(new Headers(c.init.headers).has("authorization")).toBe(false);
  });

  it("accetta l'elenco ZDR anche come array e il modello indicato con lo slug canonico", async () => {
    const { fetch } = catalogo(zdr.data);
    const gateway = new GatewayOpenRouter({ fetch });
    expect(await gateway.verificaModello("openai/gpt-6-luna")).toBe("ok");
    expect(await gateway.verificaModello("openai/gpt-6-luna-20260901")).toBe("ok");
  });

  it("distingue modelli incompatibili e non disponibili", async () => {
    const { fetch } = catalogo();
    const gateway = new GatewayOpenRouter({ fetch });
    expect(await gateway.verificaModello("vendor/senza-schema")).toBe("incompatibile");
    expect(await gateway.verificaModello("vendor/senza-zdr")).toBe("incompatibile");
    expect(await gateway.verificaModello("vendor/inesistente")).toBe("non_disponibile");
  });

  it("richiede un singolo endpoint ZDR che supporti l'output strutturato, perché la richiesta impone require_parameters e zdr", async () => {
    const { fetch } = catalogo();
    const gateway = new GatewayOpenRouter({ fetch });
    expect(await gateway.verificaModello("vendor/schema-fuori-zdr")).toBe("incompatibile");
    expect(await gateway.verificaModello("vendor/zdr-divisi")).toBe("incompatibile");
  });

  it("conserva i cataloghi per un'ora", async () => {
    const { stato, ora } = orologio();
    const { fetch, chiamate } = catalogo();
    const gateway = new GatewayOpenRouter({ fetch, ora });
    await Promise.all([gateway.verificaModello("openai/gpt-6-luna"), gateway.prezzi("openai/gpt-6-luna")]);
    await gateway.verificaModello("vendor/senza-zdr");
    expect(chiamate).toHaveLength(2);
    stato.adesso += 60 * 60 * 1000 + 1;
    await gateway.verificaModello("openai/gpt-6-luna");
    expect(chiamate).toHaveLength(4);
  });

  it("segnala con un codice un catalogo non raggiungibile e non conserva l'errore", async () => {
    let fallisci = true;
    const { fetch } = finto((url) => {
      if (fallisci) return risposta(SEGRETO, 500);
      return url.endsWith("/models") ? risposta(modelli) : risposta(zdr);
    });
    const gateway = new GatewayOpenRouter({ fetch });
    const errore = await gateway.verificaModello("openai/gpt-6-luna").catch((e: unknown) => e);
    expect(errore).toBeInstanceOf(ErroreAI);
    expect((errore as ErroreAI).codice).toBe("catalogo_non_disponibile");
    expect(String((errore as Error).message)).not.toContain("CANARINO");
    await expect(gateway.prezzi("openai/gpt-6-luna")).rejects.toBeInstanceOf(ErroreAI);
    fallisci = false;
    expect(await gateway.verificaModello("openai/gpt-6-luna")).toBe("ok");
  });

  it("restituisce i prezzi per token dal catalogo", async () => {
    const { fetch } = catalogo();
    const gateway = new GatewayOpenRouter({ fetch });
    expect(await gateway.prezzi("openai/gpt-6-luna")).toEqual({ ingressoPerToken: 0.000002, uscitaPerToken: 0.000008 });
    expect(await gateway.prezzi("vendor/senza-zdr")).toEqual({ ingressoPerToken: 0, uscitaPerToken: 0 });
    expect(await gateway.prezzi("vendor/prezzi-strani")).toBeNull();
    expect(await gateway.prezzi("vendor/inesistente")).toBeNull();
  });
});
