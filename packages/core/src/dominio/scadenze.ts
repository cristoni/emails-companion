import { verificaCitazione } from "./citazioni";

const SOLO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATA_ORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|([+-])(\d{2}):(\d{2}))$/;
const GIORNO_MS = 86_400_000;

function dataValida(anno: number, mese: number, giorno: number): boolean {
  const d = new Date(Date.UTC(anno, mese - 1, giorno));
  return d.getUTCFullYear() === anno && d.getUTCMonth() === mese - 1 && d.getUTCDate() === giorno;
}

/**
 * Data ISO senza ora → mezzanotte UTC (come `new Date("YYYY-MM-DD")`).
 * Data e ora senza fuso sono rifiutate: verrebbero lette nel fuso della macchina.
 */
function leggiIso(iso: string): { data: Date; soloData: boolean } | null {
  const soloData = SOLO_DATA.exec(iso);
  if (soloData) {
    const [anno, mese, giorno] = soloData.slice(1).map(Number) as [number, number, number];
    return dataValida(anno, mese, giorno) ? { data: new Date(Date.UTC(anno, mese - 1, giorno)), soloData: true } : null;
  }
  const m = DATA_ORA.exec(iso);
  if (!m) return null;
  const [anno, mese, giorno, ora, minuto] = m.slice(1, 6).map(Number) as [number, number, number, number, number];
  const secondo = Number(m[6] ?? 0);
  const millisecondi = Number(((m[7] ?? "") + "000").slice(0, 3));
  const segno = m[9] === "-" ? -1 : 1;
  const oreFuso = Number(m[10] ?? 0);
  const minutiFuso = Number(m[11] ?? 0);
  if (!dataValida(anno, mese, giorno) || ora > 23 || minuto > 59 || secondo > 59 || oreFuso > 23 || minutiFuso > 59) return null;
  const locale = Date.UTC(anno, mese - 1, giorno, ora, minuto, secondo, millisecondi);
  return { data: new Date(locale - segno * (oreFuso * 60 + minutiFuso) * 60_000), soloData: false };
}

/**
 * Non prima di un giorno dalla ricezione, entro due anni. Una data senza ora si confronta per giorno di calendario:
 * a mezzanotte UTC, "entro oggi" scritto la sera a ovest di UTC cadrebbe prima della ricezione meno 24 ore.
 */
function plausibile({ data, soloData }: { data: Date; soloData: boolean }, ricevutaIl: Date): boolean {
  const unGiornoPrima = ricevutaIl.getTime() - GIORNO_MS;
  const minimo = soloData ? Math.floor(unGiornoPrima / GIORNO_MS) * GIORNO_MS : unGiornoPrima;
  const massimo = new Date(ricevutaIl);
  massimo.setUTCFullYear(massimo.getUTCFullYear() + 2);
  return data.getTime() >= minimo && data <= massimo;
}

/** La scadenza ha una data solo se la citazione è nel testo e la data è plausibile rispetto alla ricezione. */
export function validaScadenza(input: {
  iso: string | null;
  citazione: string | null;
  testo: string;
  ricevutaIl: Date;
}): { scadenza: Date | null; citazioneVerificata: boolean } {
  const citazioneVerificata = input.citazione !== null && verificaCitazione(input.testo, input.citazione).verificata;
  const letta = input.iso === null ? null : leggiIso(input.iso.trim());
  const scadenza = citazioneVerificata && letta !== null && plausibile(letta, input.ricevutaIl) ? letta.data : null;
  return { scadenza, citazioneVerificata };
}
