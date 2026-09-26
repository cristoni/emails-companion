import { htmlInTesto } from "./html";

// Include l'insieme di `normalizzaPerConfronto` in @ec/core, più U+034F usato nel riempimento delle anteprime:
// l'AI cita il testo già ripulito, quindi un insieme più ampio non invalida le citazioni.
const INVISIBILI = /[\u200B-\u200D\u2060\uFEFF\u00AD\u034F]/g;

export function normalizzaTesto(testo: string): string {
  // Riga per riga: una regex come /[^\S\n]+$/gm è quadratica sulle lunghe sequenze di spazi.
  return testo
    .replace(INVISIBILI, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((riga) => riga.trimEnd())
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function testoPerAnalisi(
  parti: { testo?: string | null; html?: string | null },
  limite = 32 * 1024,
): string {
  const semplice = normalizzaTesto(parti.testo ?? "");
  return tronca(semplice || normalizzaTesto(htmlInTesto(parti.html ?? "")), limite).trimEnd();
}

export function anteprima(testo: string, lunghezza = 200): string {
  const riga = testo.replace(INVISIBILI, "").replace(/\s+/g, " ").trim();
  if (riga.length <= lunghezza) return riga;
  return `${tronca(riga, lunghezza - 1).trimEnd()}…`;
}

function tronca(testo: string, limite: number): string {
  if (testo.length <= limite) return testo;
  const fine = Math.max(0, limite);
  const alta = testo.charCodeAt(fine - 1);
  return testo.slice(0, alta >= 0xd800 && alta <= 0xdbff ? fine - 1 : fine);
}
