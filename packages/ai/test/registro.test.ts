import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FUNZIONI_AI, MODELLO_PREDEFINITO } from "@ec/core/dominio";
import { REGISTRO_FUNZIONI } from "../src";

const radice = join(import.meta.dirname, "..", "..", "..");

function sezione44(): string {
  const testo = readFileSync(join(radice, "PROJECT.md"), "utf8");
  const inizio = testo.indexOf("### 4.4");
  expect(inizio).toBeGreaterThanOrEqual(0);
  const fine = testo.indexOf("\n## ", inizio);
  return testo.slice(inizio, fine < 0 ? undefined : fine);
}

describe("registro delle Funzioni AI", () => {
  const voci = Object.values(REGISTRO_FUNZIONI);

  it("ha una voce per ogni chiave di FUNZIONI_AI e nessun'altra", () => {
    expect(Object.keys(REGISTRO_FUNZIONI).sort()).toEqual([...FUNZIONI_AI].sort());
    for (const [chiave, voce] of Object.entries(REGISTRO_FUNZIONI)) expect(voce.chiave).toBe(chiave);
  });

  it("usa openai/gpt-6-luna come modello predefinito di ogni funzione", () => {
    for (const voce of voci) expect(voce.modelloPredefinito).toBe("openai/gpt-6-luna");
    expect(MODELLO_PREDEFINITO).toBe("openai/gpt-6-luna");
  });

  it("ha la riga di ogni funzione nella tabella di PROJECT.md §4.4", () => {
    const tabella = sezione44();
    const nomi = ["Classificazione e priorità", "Estrazione attività", "Gestione attese e risposte", "Riepilogo News", "Bozze assistite"];
    expect(voci.map((v) => v.nome).sort()).toEqual([...nomi].sort());
    for (const voce of voci) expect(tabella).toContain(`| ${voce.nome} |`);
  });

  it("descrive scopo, dati interpretati, schema e limiti di ogni funzione", () => {
    for (const voce of voci) {
      expect(voce.etichettaI18n).toBe(`funzioni.${voce.chiave}.nome`);
      expect(voce.descrizioneI18n).toBe(`funzioni.${voce.chiave}.descrizione`);
      expect(voce.datiInterpretati.length).toBeGreaterThan(10);
      expect(voce.versionePrompt).toMatch(/\S/);
      expect(voce.versioneSchema).toMatch(/\S/);
      expect(voce.nomeSchema).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(voce.maxTokenUscita).toBeGreaterThan(0);
      expect(typeof voce.schema.safeParse).toBe("function");
    }
    expect(new Set(voci.map((v) => v.nomeSchema)).size).toBe(voci.length);
  });
});
