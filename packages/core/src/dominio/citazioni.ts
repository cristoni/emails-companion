const EQUIVALENTI: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "«": '"',
  "»": '"',
  "–": "-",
  "—": "-",
  "−": "-",
  " ": " ",
  "…": "...",
};

const INVISIBILI = /[​-‍⁠﻿­]/;

/**
 * Forma di confronto: NFKC, minuscole, virgolette e trattini unificati, spazi compressi.
 * `mappa[i]` è l'indice nel testo originale del carattere normalizzato `i`.
 */
export function normalizzaPerConfronto(testo: string): { normalizzato: string; mappa: number[] } {
  let normalizzato = "";
  const mappa: number[] = [];
  let spazioPrecedente = true;
  let i = 0;
  for (const carattere of testo) {
    const posizione = i;
    i += carattere.length;
    if (INVISIBILI.test(carattere)) continue;
    const base = (EQUIVALENTI[carattere] ?? carattere).normalize("NFKC").toLowerCase();
    for (const c of base) {
      if (/\s/.test(c)) {
        if (spazioPrecedente) continue;
        normalizzato += " ";
        mappa.push(posizione);
        spazioPrecedente = true;
      } else {
        normalizzato += c;
        for (let u = 0; u < c.length; u++) mappa.push(posizione);
        spazioPrecedente = false;
      }
    }
  }
  if (normalizzato.endsWith(" ")) {
    normalizzato = normalizzato.slice(0, -1);
    mappa.pop();
  }
  return { normalizzato, mappa };
}

export interface EsitoCitazione {
  verificata: boolean;
  inizio: number | null;
  fine: number | null;
}

/** Verifica che la citazione compaia letteralmente (a meno di spazi, maiuscole e virgolette) nel testo. */
export function verificaCitazione(testo: string, citazione: string): EsitoCitazione {
  const cercata = normalizzaPerConfronto(citazione).normalizzato;
  if (cercata.length < 3) return { verificata: false, inizio: null, fine: null };
  const { normalizzato, mappa } = normalizzaPerConfronto(testo);
  const indice = normalizzato.indexOf(cercata);
  if (indice < 0) return { verificata: false, inizio: null, fine: null };
  const ultimo = indice + cercata.length - 1;
  const inizio = mappa[indice] ?? 0;
  const inizioUltimo = mappa[ultimo] ?? inizio;
  const carattereUltimo = testo.codePointAt(inizioUltimo);
  const fine = inizioUltimo + (carattereUltimo !== undefined && carattereUltimo > 0xffff ? 2 : 1);
  return { verificata: true, inizio, fine };
}

export function intervalliSovrapposti(
  a: { inizio: number | null; fine: number | null },
  b: { inizio: number | null; fine: number | null },
): boolean {
  if (a.inizio === null || a.fine === null || b.inizio === null || b.fine === null) return false;
  return a.inizio < b.fine && b.inizio < a.fine;
}
