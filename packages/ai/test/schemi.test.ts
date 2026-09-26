import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FUNZIONI_AI } from "@ec/core/dominio";
import { jsonSchemaStrict, REGISTRO_FUNZIONI } from "../src";

type Nodo = Record<string, unknown>;

const PAROLE_AMMESSE = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "anyOf", "description"]);

function visita(nodo: unknown, percorso: string, controlla: (n: Nodo, p: string) => void): void {
  if (nodo === null || typeof nodo !== "object") return;
  const n = nodo as Nodo;
  controlla(n, percorso);
  for (const [k, figlio] of Object.entries((n.properties as Nodo | undefined) ?? {})) visita(figlio, `${percorso}.${k}`, controlla);
  if (n.items) visita(n.items, `${percorso}[]`, controlla);
  for (const [i, ramo] of ((n.anyOf as unknown[] | undefined) ?? []).entries()) visita(ramo, `${percorso}|${i}`, controlla);
}

describe("jsonSchemaStrict", () => {
  for (const funzione of FUNZIONI_AI) {
    it(`produce uno schema strict valido per ${funzione}`, () => {
      const schema = jsonSchemaStrict(REGISTRO_FUNZIONI[funzione].schema);
      expect(schema.type).toBe("object");
      visita(schema, funzione, (n, p) => {
        for (const chiave of Object.keys(n)) expect(PAROLE_AMMESSE, `${p}: ${chiave}`).toContain(chiave);
        const tipi = ([] as unknown[]).concat(n.type ?? []);
        if (tipi.includes("object")) {
          expect(n.additionalProperties, p).toBe(false);
          expect([...((n.required as string[]) ?? [])].sort(), p).toEqual(Object.keys(n.properties as Nodo).sort());
        }
        if (Array.isArray(n.anyOf)) {
          expect(n.anyOf.some((r) => (r as Nodo).type === "null"), p).toBe(false);
        }
        if (Array.isArray(n.enum) && tipi.includes("null")) expect(n.enum, p).toContain(null);
      });
    });
  }

  it("rende i campi nullable come unione di tipi, anche per le enumerazioni", () => {
    const schema = jsonSchemaStrict(z.object({ a: z.string().nullable(), b: z.enum(["x", "y"]).nullable() }));
    const proprieta = schema.properties as Record<string, Nodo>;
    expect(proprieta.a).toEqual({ type: ["string", "null"] });
    expect(proprieta.b).toEqual({ type: ["string", "null"], enum: ["x", "y", null] });
  });

  it("rifiuta i costrutti che la modalità strict non rappresenta, invece di scartarli in silenzio", () => {
    const casi = [
      z.object({ a: z.literal("x") }),
      z.object({ u: z.discriminatedUnion("t", [z.object({ t: z.enum(["a"]) }), z.object({ t: z.enum(["b"]) })]) }),
      z.object({ r: z.record(z.string(), z.string()) }),
    ];
    for (const schema of casi) {
      expect(() => jsonSchemaStrict(schema)).toThrow(expect.objectContaining({ codice: "schema_non_supportato" }));
    }
  });

  it("rende obbligatori anche i campi opzionali e conserva le descrizioni", () => {
    const schema = jsonSchemaStrict(z.object({ a: z.string().optional(), b: z.number().min(0).max(1).describe("da 0 a 1") }));
    expect(schema.required).toEqual(["a", "b"]);
    expect((schema.properties as Record<string, Nodo>).b).toEqual({ type: "number", description: "da 0 a 1" });
  });
});

describe("schemi di output", () => {
  const { schema: estrazione } = REGISTRO_FUNZIONI.estrazione_attivita;
  const elemento = {
    esito: "nuovo",
    riferimento: null,
    descrizione: "Inviare il report",
    scadenza_iso: "2026-10-02",
    scadenza_citazione: "entro venerdì",
    priorita: "alta",
    urgente: false,
    base: "rilevato",
    evidenze: [{ email: "e1", citazione: "mi mandi il report entro venerdì" }],
  };
  const output = (e: object) => ({ elementi: [e], titolo_situazione: null, descrizione_situazione: null });

  it("accetta un elemento nuovo completo", () => {
    expect(estrazione.safeParse(output(elemento)).success).toBe(true);
  });

  it("rifiuta un esito incoerente con il riferimento", () => {
    expect(estrazione.safeParse(output({ ...elemento, riferimento: "t1" })).success).toBe(false);
    expect(estrazione.safeParse(output({ ...elemento, esito: "aggiorna" })).success).toBe(false);
    expect(estrazione.safeParse(output({ ...elemento, esito: "aggiorna", riferimento: "t1", descrizione: null })).success).toBe(true);
  });

  it("rifiuta un elemento nuovo senza descrizione e una data non ISO", () => {
    expect(estrazione.safeParse(output({ ...elemento, descrizione: null })).success).toBe(false);
    expect(estrazione.safeParse(output({ ...elemento, scadenza_iso: "venerdì" })).success).toBe(false);
  });
});
