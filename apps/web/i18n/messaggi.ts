import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Lingua } from "./lingue";

const cache = new Map<Lingua, Record<string, unknown>>();

/**
 * Messaggi divisi per namespace (`messages/<lingua>/<namespace>.json`): ogni pagina ha il suo file,
 * così le traduzioni crescono senza conflitti. Il nome del file è il namespace.
 */
export function messaggi(lingua: Lingua): Record<string, unknown> {
  const inCache = cache.get(lingua);
  if (inCache && process.env.NODE_ENV === "production") return inCache;
  const cartella = join(process.cwd(), "messages", lingua);
  const risultato: Record<string, unknown> = {};
  for (const file of readdirSync(cartella).filter((f) => f.endsWith(".json")).sort()) {
    risultato[file.slice(0, -5)] = JSON.parse(readFileSync(join(cartella, file), "utf8"));
  }
  cache.set(lingua, risultato);
  return risultato;
}
