import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const cartella = join(import.meta.dirname, "..", "apps", "web", "messages");

function chiavi(valore: unknown, prefisso = ""): string[] {
  if (valore && typeof valore === "object" && !Array.isArray(valore)) {
    return Object.entries(valore).flatMap(([k, v]) => chiavi(v, prefisso ? `${prefisso}.${k}` : k));
  }
  return [prefisso];
}

function messaggi(lingua: string): Record<string, unknown> {
  const risultato: Record<string, unknown> = {};
  for (const file of readdirSync(join(cartella, lingua)).filter((f) => f.endsWith(".json"))) {
    risultato[file.slice(0, -5)] = JSON.parse(readFileSync(join(cartella, lingua, file), "utf8"));
  }
  return risultato;
}

describe("traduzioni dell'interfaccia", () => {
  it("inglese e italiano hanno esattamente le stesse chiavi", () => {
    const en = new Set(chiavi(messaggi("en")));
    const it_ = new Set(chiavi(messaggi("it")));
    expect([...it_].filter((k) => !en.has(k)).sort()).toEqual([]);
    expect([...en].filter((k) => !it_.has(k)).sort()).toEqual([]);
  });

  it("nessun messaggio è vuoto", () => {
    for (const lingua of ["en", "it"]) {
      const tutti = messaggi(lingua);
      const vuoti = chiavi(tutti).filter((k) => {
        const valore = k.split(".").reduce<unknown>((acc, parte) => (acc as Record<string, unknown>)[parte], tutti);
        return typeof valore !== "string" || valore.trim() === "";
      });
      expect(vuoti).toEqual([]);
    }
  });
});
