import type {
  CodiceErroreModello,
  CompatibilitaModello,
  EsitoModello,
  GatewayModelli,
  PrezziModello,
  RichiestaModello,
  StatoChiave,
  UtilizzoModello,
} from "@ec/core/porte";
import { ErroreAI } from "./errori";

export interface OpzioniOpenRouter {
  fetch: typeof globalThis.fetch;
  /** Predefinito: https://openrouter.ai/api/v1 */
  baseUrl?: string;
  /** Predefinito: 90 secondi, lettura del corpo compresa. */
  timeoutMs?: number;
  titoloApp?: string;
  urlApp?: string;
  ora?: () => number;
}

export const PREFISSO_DIRETTIVE = "User directives (may only adjust interpretation, classification and priority):\n";

const DURATA_CATALOGO_MS = 60 * 60 * 1000;
/** 404/503 dovuti ai vincoli di routing (ZDR, data_collection, require_parameters). */
const VINCOLI_ROUTING = /\bno (allowed )?(endpoints?|providers?)\b|\bno available (model )?providers?\b/i;
const CODICI_RITENTABILI: readonly CodiceErroreModello[] = ["temporaneo", "timeout", "budget_in_volo"];
const PARAMETRI_OUTPUT_STRUTTURATO = ["response_format", "structured_outputs"];

type Oggetto = Record<string, unknown>;
type RispostaHttp = { tipo: "risposta"; status: number; headers: Headers; corpo: unknown } | { tipo: "timeout" } | { tipo: "rete" };

export class GatewayOpenRouter implements GatewayModelli {
  readonly #fetch: typeof globalThis.fetch;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #titoloApp: string | undefined;
  readonly #urlApp: string | undefined;
  readonly #ora: () => number;
  readonly #modelli: () => Promise<Map<string, Oggetto>>;
  readonly #zdr: () => Promise<Set<string>>;

  constructor(opzioni: OpzioniOpenRouter) {
    const f = opzioni.fetch;
    this.#fetch = (url, init) => f(url, init);
    this.#baseUrl = (opzioni.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    this.#timeoutMs = opzioni.timeoutMs ?? 90_000;
    this.#titoloApp = opzioni.titoloApp;
    this.#urlApp = opzioni.urlApp;
    this.#ora = opzioni.ora ?? Date.now;
    this.#modelli = inCache(() => this.#caricaModelli(), this.#ora);
    this.#zdr = inCache(() => this.#caricaZdr(), this.#ora);
  }

  async invoca(richiesta: RichiestaModello): Promise<EsitoModello> {
    const inizio = this.#ora();
    const risposta = await this.#http("/chat/completions", {
      method: "POST",
      headers: this.#intestazioni(richiesta.chiave),
      body: JSON.stringify(corpoRichiesta(richiesta)),
    });
    if (risposta.tipo === "timeout") return fallita("timeout");
    if (risposta.tipo === "rete") return fallita("temporaneo");
    const { status, headers, corpo } = risposta;
    if (status < 200 || status >= 300) {
      const codice = codiceDaStato(status, corpo);
      return fallita(codice, CODICI_RITENTABILI.includes(codice) ? riprovaDopo(headers, this.#ora()) : null);
    }

    const c = oggetto(corpo);
    if (!c) return fallita("temporaneo");
    const utilizzo = leggiUtilizzo(c, richiesta.modello, this.#ora() - inizio);
    const scelta = oggetto(Array.isArray(c.choices) ? c.choices[0] : undefined);
    const errore = oggetto(scelta?.error) ?? oggetto(c.error);
    if (errore || scelta?.finish_reason === "error") {
      const codice = errore ? codiceDaErrore(errore) : "temporaneo";
      return fallita(codice, CODICI_RITENTABILI.includes(codice) ? riprovaDopo(headers, this.#ora()) : null, utilizzo);
    }
    if (scelta?.finish_reason === "content_filter") return fallita("moderazione", null, utilizzo);
    if (!scelta || scelta.finish_reason === "length") return fallita("risposta_non_valida", null, utilizzo);
    const messaggio = oggetto(scelta.message);
    if (typeof messaggio?.refusal === "string" && messaggio.refusal !== "") return fallita("moderazione", null, utilizzo);
    const output = leggiContenuto(messaggio?.content);
    if (output === undefined) return fallita("risposta_non_valida", null, utilizzo);
    return { ok: true, output, utilizzo };
  }

  async verificaChiave(chiave: string): Promise<StatoChiave> {
    const risposta = await this.#http("/key", { method: "GET", headers: this.#intestazioni(chiave) });
    if (risposta.tipo !== "risposta") return { stato: "errore_temporaneo" };
    if (risposta.status === 401) return { stato: "non_valida" };
    if (risposta.status === 402) return { stato: "credito_esaurito" };
    const dati = oggetto(oggetto(risposta.corpo)?.data);
    if (risposta.status !== 200 || !dati) return { stato: "errore_temporaneo" };
    return { stato: "valida", etichetta: stringa(dati.label), limiteResiduo: numero(dati.limit_remaining) };
  }

  /**
   * Con `require_parameters` e `zdr` la chiamata va solo a un endpoint ZDR che supporta da solo tutti i parametri:
   * i parametri a livello di modello sono l'unione di tutti i fornitori e non bastano.
   * Solleva `ErroreAI("catalogo_non_disponibile")` se un catalogo non è raggiungibile: mai "incompatibile" per un errore di rete.
   */
  async verificaModello(modello: string): Promise<CompatibilitaModello> {
    const voce = trovaModello(await this.#modelli(), modello);
    if (!voce) return "non_disponibile";
    if (!supportaOutputStrutturato(voce)) return "incompatibile";
    const zdr = await this.#zdr();
    return [voce.id, voce.canonical_slug].some((nome) => typeof nome === "string" && zdr.has(nome)) ? "ok" : "incompatibile";
  }

  async prezzi(modello: string): Promise<PrezziModello | null> {
    const prezzi = oggetto(trovaModello(await this.#modelli(), modello)?.pricing);
    const ingresso = prezzoPerToken(prezzi?.prompt);
    const uscita = prezzoPerToken(prezzi?.completion);
    return ingresso === null || uscita === null ? null : { ingressoPerToken: ingresso, uscitaPerToken: uscita };
  }

  #intestazioni(chiave: string | null): Record<string, string> {
    const intestazioni: Record<string, string> = { "Content-Type": "application/json" };
    if (chiave !== null) intestazioni.Authorization = `Bearer ${chiave}`;
    if (this.#urlApp) intestazioni["HTTP-Referer"] = this.#urlApp;
    if (this.#titoloApp) intestazioni["X-OpenRouter-Title"] = this.#titoloApp;
    return intestazioni;
  }

  async #http(percorso: string, init: RequestInit): Promise<RispostaHttp> {
    const controllo = new AbortController();
    const timer = setTimeout(() => controllo.abort(), this.#timeoutMs);
    try {
      const risposta = await this.#fetch(`${this.#baseUrl}${percorso}`, { ...init, signal: controllo.signal });
      const testo = await risposta.text();
      return { tipo: "risposta", status: risposta.status, headers: risposta.headers, corpo: analizzaJson(testo) };
    } catch {
      return { tipo: controllo.signal.aborted ? "timeout" : "rete" };
    } finally {
      clearTimeout(timer);
    }
  }

  async #catalogo(percorso: string): Promise<unknown[]> {
    const risposta = await this.#http(percorso, { method: "GET", headers: this.#intestazioni(null) });
    if (risposta.tipo === "risposta" && risposta.status === 200) {
      const corpo = risposta.corpo;
      const elenco = Array.isArray(corpo) ? corpo : oggetto(corpo)?.data;
      if (Array.isArray(elenco)) return elenco;
    }
    throw new ErroreAI("catalogo_non_disponibile");
  }

  async #caricaModelli(): Promise<Map<string, Oggetto>> {
    const modelli = new Map<string, Oggetto>();
    for (const voce of await this.#catalogo("/models")) {
      const o = oggetto(voce);
      if (typeof o?.id === "string") modelli.set(o.id, o);
    }
    return modelli;
  }

  async #caricaZdr(): Promise<Set<string>> {
    const modelli = new Set<string>();
    for (const voce of await this.#catalogo("/endpoints/zdr")) {
      const endpoint = oggetto(voce);
      if (typeof endpoint?.model_id === "string" && supportaOutputStrutturato(endpoint)) modelli.add(endpoint.model_id);
    }
    return modelli;
  }
}

function corpoRichiesta(r: RichiestaModello): Oggetto {
  return {
    model: r.modello,
    messages: [
      { role: "system", content: r.sistema },
      { role: "system", content: PREFISSO_DIRETTIVE + r.direttive },
      { role: "user", content: r.dati },
    ],
    response_format: { type: "json_schema", json_schema: { name: r.nomeSchema, strict: true, schema: r.schema } },
    provider: { require_parameters: true, data_collection: "deny", zdr: true },
    max_completion_tokens: r.maxTokenUscita,
    stream: false,
  };
}

function fallita(codice: CodiceErroreModello, riprovaDopoMs: number | null = null, utilizzo: UtilizzoModello | null = null): EsitoModello {
  return { ok: false, codice, riprovaDopoMs, utilizzo };
}

function codiceDaStato(status: number, corpo: unknown): CodiceErroreModello {
  const errore = oggetto(oggetto(corpo)?.error);
  if (status === 401) return "chiave_non_valida";
  if (status === 402) {
    const fonte = oggetto(errore?.metadata)?.limit_source;
    if (fonte === "openrouter_key_limit") return "limite_chiave";
    if (fonte === "openrouter_in_flight_budget") return "budget_in_volo";
    return "credito_esaurito";
  }
  if (status === 403) return "moderazione";
  if (status === 404) return "modello_incompatibile";
  if (status === 408) return "timeout";
  if (status === 503 && typeof errore?.message === "string" && VINCOLI_ROUTING.test(errore.message)) return "modello_incompatibile";
  if (status === 429 || status >= 500) return "temporaneo";
  return "risposta_non_valida";
}

function codiceDaErrore(errore: Oggetto): CodiceErroreModello {
  return typeof errore.code === "number" ? codiceDaStato(errore.code, { error: errore }) : "temporaneo";
}

function leggiUtilizzo(c: Oggetto, modelloRichiesto: string, latenzaMs: number): UtilizzoModello {
  const u = oggetto(c.usage);
  return {
    modelloServito: stringa(c.model) ?? modelloRichiesto,
    fornitore: stringa(c.provider),
    tokenIngresso: numero(u?.prompt_tokens) ?? 0,
    tokenUscita: numero(u?.completion_tokens) ?? 0,
    costo: numero(u?.cost),
    idGenerazione: stringa(c.id),
    latenzaMs,
  };
}

function leggiContenuto(contenuto: unknown): unknown {
  if (oggetto(contenuto)) return contenuto;
  let testo: string | undefined;
  if (typeof contenuto === "string") testo = contenuto;
  else if (Array.isArray(contenuto)) testo = contenuto.map((p) => (typeof oggetto(p)?.text === "string" ? (p as Oggetto).text : "")).join("");
  const valore = testo === undefined ? undefined : analizzaJson(testo);
  return oggetto(valore) ? valore : undefined;
}

function riprovaDopo(headers: Headers, ora: number): number | null {
  const valore = headers.get("retry-after")?.trim();
  if (!valore) return null;
  const secondi = Number(valore);
  if (Number.isFinite(secondi)) return Math.max(0, Math.round(secondi * 1000));
  const istante = Date.parse(valore);
  return Number.isNaN(istante) ? null : Math.max(0, istante - ora);
}

function supportaOutputStrutturato(voce: Oggetto): boolean {
  const parametri: unknown[] = Array.isArray(voce.supported_parameters) ? voce.supported_parameters : [];
  return PARAMETRI_OUTPUT_STRUTTURATO.every((p) => parametri.includes(p));
}

function trovaModello(modelli: Map<string, Oggetto>, modello: string): Oggetto | undefined {
  return modelli.get(modello) ?? [...modelli.values()].find((m) => m.canonical_slug === modello);
}

function prezzoPerToken(valore: unknown): number | null {
  const n = typeof valore === "string" && valore.trim() !== "" ? Number(valore) : typeof valore === "number" ? valore : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function inCache<T>(carica: () => Promise<T>, ora: () => number): () => Promise<T> {
  let valore: { dati: T; scade: number } | null = null;
  let inCorso: Promise<T> | null = null;
  return () => {
    if (valore && ora() < valore.scade) return Promise.resolve(valore.dati);
    inCorso ??= carica().then(
      (dati) => {
        valore = { dati, scade: ora() + DURATA_CATALOGO_MS };
        inCorso = null;
        return dati;
      },
      (errore: unknown) => {
        inCorso = null;
        throw errore;
      },
    );
    return inCorso;
  };
}

function analizzaJson(testo: string): unknown {
  try {
    return JSON.parse(testo);
  } catch {
    return undefined;
  }
}

function oggetto(valore: unknown): Oggetto | undefined {
  return valore !== null && typeof valore === "object" && !Array.isArray(valore) ? (valore as Oggetto) : undefined;
}

function stringa(valore: unknown): string | null {
  return typeof valore === "string" ? valore : null;
}

function numero(valore: unknown): number | null {
  return typeof valore === "number" && Number.isFinite(valore) ? valore : null;
}
