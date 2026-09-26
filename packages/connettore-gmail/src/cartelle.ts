import { CARTELLE, type Cartella } from "@ec/core";

const CARTELLE_GMAIL: Readonly<Record<string, Cartella>> = {
  INBOX: "in_arrivo",
  SENT: "inviata",
  SPAM: "spam",
  TRASH: "cestino",
  DRAFT: "bozza",
  CHAT: "chat",
};

export function cartelleDaEtichette(etichette: readonly string[]): Cartella[] {
  const trovate = new Set(etichette.flatMap((e) => CARTELLE_GMAIL[e] ?? []));
  return trovate.size > 0 ? CARTELLE.filter((c) => trovate.has(c)) : ["archiviata"];
}
