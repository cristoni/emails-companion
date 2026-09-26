import type { Correzione, Soggetto } from "./entita";

function stessoSoggetto(a: Soggetto, b: Soggetto): boolean {
  return a.tipo === b.tipo && a.id === b.id;
}

/** Correzioni non revocate di un campo, dalla più vecchia (a parità di data, per id). */
export function correzioniAttive(correzioni: readonly Correzione[], soggetto: Soggetto, campo: string): Correzione[] {
  return correzioni
    .filter((c) => c.revocataIl === null && c.campo === campo && stessoSoggetto(c.soggetto, soggetto))
    .sort((a, b) => a.creataIl.getTime() - b.creataIl.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface ValoreEffettivo<T> {
  valore: T;
  corretto: boolean;
  correzione: Correzione | null;
}

/** L'ultima correzione attiva prevale sul valore dell'AI. */
export function valoreEffettivo<T>(
  valoreAI: T,
  correzioni: readonly Correzione[],
  soggetto: Soggetto,
  campo: string,
): ValoreEffettivo<T> {
  const ultima = correzioniAttive(correzioni, soggetto, campo).at(-1);
  if (!ultima) return { valore: valoreAI, corretto: false, correzione: null };
  return { valore: ultima.valore as T, corretto: true, correzione: ultima };
}

export function toccatoDallUtente(correzioni: readonly Correzione[], soggetto: Soggetto): boolean {
  return correzioni.some((c) => c.revocataIl === null && stessoSoggetto(c.soggetto, soggetto));
}
