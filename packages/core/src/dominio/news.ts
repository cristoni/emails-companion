import { createHash } from "node:crypto";
import { serializzazioneCanonica } from "./canonico";
import type { Categoria, Direzione } from "./tipi";

export const ORE_FINESTRA_NEWS = 24;
const MINUTI_RAGGRUPPAMENTO = 10;
const MINUTI_TRA_GENERAZIONI = 30;
const ORA_MS = 3_600_000;
const MINUTO_MS = 60_000;

export function inFinestraNews(ricevutaIl: Date, ora: Date, ore = ORE_FINESTRA_NEWS): boolean {
  return ricevutaIl.getTime() > ora.getTime() - ore * ORA_MS && ricevutaIl <= ora;
}

export interface EmailCandidataNews {
  id: string;
  direzione: Direzione;
  ricevutaIl: Date;
  categoriaEffettiva: Categoria | null;
  eliminata: boolean;
}

/** Id delle email del Riepilogo News, dalla più recente (a parità, per id). */
export function membriNews(emails: readonly EmailCandidataNews[], ora: Date): string[] {
  return emails
    .filter((e) => e.direzione === "entrata" && e.categoriaEffettiva === "news" && !e.eliminata && inFinestraNews(e.ricevutaIl, ora))
    .sort((a, b) => b.ricevutaIl.getTime() - a.ricevutaIl.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e) => e.id);
}

/** Hash dell'insieme di email e della lingua dell'interfaccia: una generazione si salva solo se è ancora questo. */
export function firmaInsiemeNews(ids: readonly string[], linguaInterfaccia: string): string {
  const emailIds = [...new Set(ids)].sort();
  return createHash("sha256").update(serializzazioneCanonica({ emailIds, linguaInterfaccia }), "utf8").digest("hex");
}

/** Una voce senza fonti non è mai mostrata: ogni affermazione deve rimandare alle sue email. */
export function vociVisibili<V extends { emailIds: readonly string[] }>(voci: readonly V[], membri: readonly string[]): V[] {
  const inclusi = new Set(membri);
  return voci.filter((v) => v.emailIds.length > 0 && v.emailIds.every((id) => inclusi.has(id)));
}

export function emailNonIncluse(membri: readonly string[], vociVisibili: readonly { emailIds: readonly string[] }[]): string[] {
  const coperte = new Set(vociVisibili.flatMap((v) => v.emailIds));
  return membri.filter((id) => !coperte.has(id));
}

export function prossimaRigenerazione(ora: Date, ultimaGenerazione: Date | null): Date {
  const raggruppata = ora.getTime() + MINUTI_RAGGRUPPAMENTO * MINUTO_MS;
  const distanziata = ultimaGenerazione === null ? raggruppata : ultimaGenerazione.getTime() + MINUTI_TRA_GENERAZIONI * MINUTO_MS;
  return new Date(Math.max(raggruppata, distanziata));
}

/** Istante in cui la più vecchia email ancora nella finestra ne esce. */
export function prossimaUscitaDallaFinestra(ricevute: readonly Date[], ora: Date, ore = ORE_FINESTRA_NEWS): Date | null {
  let piuVecchia: number | null = null;
  for (const r of ricevute) {
    if (inFinestraNews(r, ora, ore) && (piuVecchia === null || r.getTime() < piuVecchia)) piuVecchia = r.getTime();
  }
  return piuVecchia === null ? null : new Date(piuVecchia + ore * ORA_MS);
}
