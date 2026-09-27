import type { NumberFormatOptions } from "next-intl";

/**
 * Opzioni per mostrare un importo in dollari con il formatter di next-intl: i centesimi di dollaro
 * contano (una stima o un consumo possono essere di pochi millesimi), quindi sotto il dollaro si
 * mostrano fino a quattro decimali.
 */
export function opzioniImporto(valore: number): NumberFormatOptions {
  const piccolo = valore !== 0 && Math.abs(valore) < 1;
  return { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: piccolo ? 4 : 2 };
}

/** Il tema salvato nelle preferenze (il database parte da "sistema"): tutto ciò che non è chiaro o scuro vale "system". */
export type Tema = "system" | "light" | "dark";

export function temaDa(valore: string | null | undefined): Tema {
  return valore === "light" || valore === "dark" ? valore : "system";
}
