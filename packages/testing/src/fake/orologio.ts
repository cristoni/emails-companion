import type { GeneratoreId, Orologio } from "@ec/core/porte";

export class OrologioFinto implements Orologio {
  #adesso: number;

  constructor(inizio: Date | string = "2026-09-21T08:00:00Z") {
    this.#adesso = new Date(inizio).getTime();
  }

  ora(): Date {
    return new Date(this.#adesso);
  }

  avanza(ms: number): void {
    this.#adesso += ms;
  }

  imposta(istante: Date | string): void {
    this.#adesso = new Date(istante).getTime();
  }
}

export const generatoreIdCasuale: GeneratoreId = { nuovo: () => crypto.randomUUID() };
