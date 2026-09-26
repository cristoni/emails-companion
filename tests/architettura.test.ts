import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const radice = join(import.meta.dirname, "..");

function fileSorgente(cartella: string): string[] {
  if (!existsSync(cartella)) return [];
  const risultato: string[] = [];
  for (const voce of readdirSync(cartella)) {
    if (voce === "node_modules" || voce === ".next" || voce === "dist") continue;
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) risultato.push(...fileSorgente(percorso));
    else if (/\.(ts|tsx|mts)$/.test(voce)) risultato.push(percorso);
  }
  return risultato;
}

const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function importazioni(file: string): string[] {
  const testo = readFileSync(file, "utf8");
  const trovate: string[] = [];
  for (const m of testo.matchAll(IMPORT)) {
    const modulo = m[1] ?? m[2] ?? m[3];
    if (modulo) trovate.push(modulo);
  }
  return trovate;
}

function violazioni(cartella: string, vietato: (modulo: string) => boolean): string[] {
  return fileSorgente(join(radice, cartella)).flatMap((file) =>
    importazioni(file)
      .filter(vietato)
      .map((modulo) => `${relative(radice, file).split(sep).join("/")} → ${modulo}`),
  );
}

describe("regole di dipendenza tra pacchetti", () => {
  it("il core non dipende da infrastruttura, framework o altri pacchetti dell'app", () => {
    const infrastruttura = [
      /^@ec\/(db|ai|crypto|connettore-|testing)/,
      /^(pg|drizzle-orm|graphile-worker|better-auth|next|react)(\/|$)/,
      /^@googleapis\//,
      /^google-auth-library/,
      /^@google-cloud\//,
      /^node:(fs|net|http|https|child_process)/,
    ];
    const trovate = violazioni("packages/core/src", (m) => infrastruttura.some((r) => r.test(m)));
    expect(trovate).toEqual([]);
  });

  it("l'AI non raggiunge l'invio della posta", () => {
    const trovate = violazioni("packages/ai/src", (m) => /invio|invia/i.test(m) || /^@ec\/connettore-/.test(m));
    expect(trovate).toEqual([]);
  });

  it("i connettori non dipendono da database, AI o webapp", () => {
    const trovate = violazioni("packages/connettore-gmail/src", (m) => /^@ec\/(db|ai|testing)/.test(m) || /^next/.test(m));
    expect(trovate).toEqual([]);
  });

  it("la webapp non importa strumenti di test", () => {
    const trovate = violazioni("apps/web", (m) => /^@ec\/testing/.test(m) || /better-auth\/plugins.*test/i.test(m));
    expect(trovate).toEqual([]);
  });

  it("il codice di produzione non importa i fake", () => {
    const cartelle = ["packages/core/src", "packages/db/src", "packages/ai/src", "packages/connettore-gmail/src", "apps/worker/src"];
    const trovate = cartelle.flatMap((c) => violazioni(c, (m) => /^@ec\/testing/.test(m)));
    expect(trovate).toEqual([]);
  });
});
